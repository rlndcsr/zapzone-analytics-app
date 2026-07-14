import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchNotifications, markAllNotificationsAsRead, clearAllNotifications, markNotificationAsRead, deleteNotification as deleteNotificationApi, AppNotification, NotificationFilterType } from '../../services/notificationService';
import { getToken, getCurrentUser } from '../session';
import { Alert } from 'react-native';

// How long the "Undo" window stays open before the delete is committed to the API.
const UNDO_TIMEOUT_MS = 5000;

type PendingDelete = { notification: AppNotification; index: number };

export function useNotifications(initialFilter: NotificationFilterType = 'all') {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilterType>(initialFilter);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the "commit this delete to the server" callback for the item currently
  // in its undo window, so a second delete (or unmount) can flush it early.
  const commitDeleteRef = useRef<(() => void) | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const token = getToken();
      const user = getCurrentUser();

      if (!token || !user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      setLoading(true);
      const data = await fetchNotifications(token, filter, page, perPage);
      setNotifications(data.data.notifications);
      setTotalCount(data.data.pagination.total);
      setLastPage(data.data.pagination.last_page);
      setError(null);
    } catch (err) {
      console.error('Notifications error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [filter, page, perPage]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Returns the load promise (and is stable) so callers like pull-to-refresh
  // can await completion before clearing their indicator.
  const refresh = useCallback(() => loadNotifications(), [loadNotifications]);

  const updateFilter = (newFilter: NotificationFilterType) => {
    setFilter(newFilter);
    setPage(1); // Reset to first page on filter change
  };

  const updatePerPage = (newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1); // Reset to first page on per page change
  };

  const markAllAsRead = async () => {
    try {
      setActionLoading(true);
      const token = getToken();
      const user = getCurrentUser();
      if (!token || !user || !user.location_id) return;
      
      await markAllNotificationsAsRead(token, user.location_id);
      refresh();
    } catch (err) {
      Alert.alert('Error', 'Failed to mark all as read');
    } finally {
      setActionLoading(false);
    }
  };

  // Optimistically flips a single notification to read, reverting on failure.
  const markAsRead = async (id: number) => {
    const token = getToken();
    if (!token) return;

    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        wasUnread = n.status === 'unread';
        return wasUnread ? { ...n, status: 'read' } : n;
      })
    );
    if (!wasUnread) return;

    try {
      await markNotificationAsRead(token, id);
    } catch (err) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: 'unread' } : n))
      );
      Alert.alert('Error', 'Failed to mark notification as read');
    }
  };

  const clearAll = async () => {
    try {
      setActionLoading(true);
      const token = getToken();
      const user = getCurrentUser();
      if (!token || !user || !user.location_id) return;

      await clearAllNotifications(token, user.location_id);
      setPage(1);
      refresh();
    } catch (err) {
      Alert.alert('Error', 'Failed to clear notifications');
    } finally {
      setActionLoading(false);
    }
  };

  // Restores a snapshotted notification back into the list at its original slot.
  const restoreNotification = useCallback(({ notification, index }: PendingDelete) => {
    setNotifications((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, notification);
      return next;
    });
    setTotalCount((c) => c + 1);
  }, []);

  // Optimistically removes a notification and opens an undo window. The delete is
  // only sent to the API once the window elapses (or another delete flushes it).
  const deleteNotification = useCallback((id: number) => {
    const token = getToken();
    if (!token) return;

    // A delete is already waiting to be undone — commit it now before starting a new one.
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
      commitDeleteRef.current?.();
    }

    let snapshot: PendingDelete | null = null;
    setNotifications((prev) => {
      const index = prev.findIndex((n) => n.id === id);
      if (index === -1) return prev;
      snapshot = { notification: prev[index], index };
      return prev.filter((n) => n.id !== id);
    });
    if (!snapshot) return;

    setTotalCount((c) => Math.max(0, c - 1));
    setPendingDelete(snapshot);

    const captured = snapshot;
    const commit = async () => {
      undoTimerRef.current = null;
      commitDeleteRef.current = null;
      setPendingDelete((p) => (p === captured ? null : p));
      try {
        await deleteNotificationApi(token, id);
      } catch (err) {
        restoreNotification(captured);
        Alert.alert('Error', 'Failed to delete notification');
      }
    };

    commitDeleteRef.current = commit;
    undoTimerRef.current = setTimeout(commit, UNDO_TIMEOUT_MS);
  }, [restoreNotification]);

  // Cancels the pending delete and puts the notification back where it was.
  const undoDelete = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    commitDeleteRef.current = null;
    setPendingDelete((p) => {
      if (p) restoreNotification(p);
      return null;
    });
  }, [restoreNotification]);

  // On unmount, flush any pending delete so it isn't silently dropped.
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
        commitDeleteRef.current?.();
      }
    };
  }, []);

  return {
    notifications,
    totalCount,
    lastPage,
    loading,
    error,
    filter,
    page,
    perPage,
    updateFilter,
    setPage,
    updatePerPage,
    refresh,
    markAllAsRead,
    markAsRead,
    clearAll,
    deleteNotification,
    undoDelete,
    pendingDelete,
    actionLoading
  };
}
