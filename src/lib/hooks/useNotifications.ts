import { useEffect, useState, useCallback } from 'react';
import { fetchNotifications, markAllNotificationsAsRead, clearAllNotifications, AppNotification, NotificationFilterType } from '../../services/notificationService';
import { getToken, getCurrentUser } from '../session';
import { Alert } from 'react-native';

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
    clearAll,
    actionLoading
  };
}
