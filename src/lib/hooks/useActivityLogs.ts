import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchActivityCount,
  fetchActivityLogs,
  type ActivityFilters,
  type ActivityLogEntry,
} from "../../services/activityLogsService";
import { getToken } from "../session";

/*
 * Activity-log data hooks. The /activity-logs endpoint is read-only and
 * paginates server-side, so useActivityLogs refetches on any filter/page change.
 */

/**
 * Local calendar-day "today" test — mirrors the web admin's `isToday`
 * (`date.getDate()/getMonth()/getFullYear()` against now, in device-local time).
 */
function isTodayLocal(value: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

// The web activity list uses a fixed page size of 20 (itemsPerPage), and its
// "Today's Activities" KPI counts isToday rows within that loaded page. Match it.
const WEB_PAGE_SIZE = 20;

type UseActivityParams = {
  filters: ActivityFilters;
  page: number;
  perPage?: number;
};

export function useActivityLogs({ filters, page, perPage = 15 }: UseActivityParams) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const key = JSON.stringify({ filters, page, perPage });

  const sync = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchActivityLogs(token, filters, page, perPage);
      if (isCurrent()) {
        setLogs(res.logs);
        setTotal(res.total);
        setLastPage(res.lastPage);
        setError(null);
      }
    } catch (err) {
      console.error("Activity logs error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load activity");
        setLogs([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  return { logs, total, lastPage, loading, error, refetch: sync };
}

export type ActivityStats = {
  total: number;
  today: number;
  purchases: number;
  activeAttendants: number;
  managerActions: number;
  attendantActions: number;
};

/**
 * KPI counts for the Activity Log header — computed exactly like the web
 * (`getLocationMetrics`), all over the newest loaded page except Total:
 *   - Total Activities  → server pagination total (cheap `per_page=1` count).
 *   - Today's Activities → count of `isToday` (device-local calendar day) rows
 *     in the newest loaded page (web loads `itemsPerPage=20` newest-first and
 *     filters that page client-side; NOT a whole-dataset server date count).
 *   - Purchases Made / Active Attendants → location-manager page cards.
 *   - Manager Actions / Attendant Actions → company-admin (/admin/activity)
 *     cards: page rows whose actor role is location_manager / attendant.
 * The screen picks which two role-specific cards to show. All respect the
 * active location filter. Refetches when `nonce` bumps.
 */
export function useActivityStats(locationId: number | undefined, nonce = 0) {
  const [stats, setStats] = useState<ActivityStats>({
    total: 0,
    today: 0,
    purchases: 0,
    activeAttendants: 0,
    managerActions: 0,
    attendantActions: 0,
  });
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const base: ActivityFilters = { locationId };

    Promise.all([
      fetchActivityCount(token, base),
      fetchActivityCount(token, { ...base, action: "purchased" }),
      // Newest page (web itemsPerPage=20, created_at desc) — the web derives
      // both Today's Activities and Active Attendants from this loaded page.
      fetchActivityLogs(token, base, 1, WEB_PAGE_SIZE),
    ])
      .then(([total, purchases, recentPage]) => {
        if (requestId !== requestIdRef.current) return;
        // Rows in the loaded page whose local calendar day is today (web isToday).
        const todayLogs = recentPage.logs.filter((log) =>
          isTodayLocal(log.createdAt),
        );
        // Distinct users who logged in today (web's unique-userId set).
        const activeIds = new Set<number>();
        for (const log of todayLogs) {
          if (log.action === "logged_in" && log.actor.id != null) {
            activeIds.add(log.actor.id);
          }
        }
        // Manager / Attendant Actions — page rows by actor role (web's
        // filteredLogs.filter(userType === 'location_manager' | 'attendant')).
        let managerActions = 0;
        let attendantActions = 0;
        for (const log of recentPage.logs) {
          if (log.actor.role === "location_manager") managerActions += 1;
          else if (log.actor.role === "attendant") attendantActions += 1;
        }
        setStats({
          total,
          today: todayLogs.length,
          purchases,
          activeAttendants: activeIds.size,
          managerActions,
          attendantActions,
        });
      })
      .catch(() => {
        /* KPIs are best-effort; the list surfaces real errors. */
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });

    return () => {
      requestIdRef.current++;
    };
  }, [locationId, nonce]);

  return { stats, loading };
}
