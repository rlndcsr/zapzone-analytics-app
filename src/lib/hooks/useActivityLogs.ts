import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchActivityCount,
  fetchActivityLogs,
  type ActivityFilters,
  type ActivityLogEntry,
} from "../../services/activityLogsService";
import { fetchAllStaffUsers } from "../../services/usersService";
import { venueTodayKey } from "../dashboard/dashboardTimeframe";
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

export function useActivityLogs({ filters, page, perPage = 5 }: UseActivityParams) {
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
 * KPI counts for the Activity Log header (web `getLocationMetrics`). Every count
 * is the server's own total (a cheap `per_page=1` request), never a tally of
 * one page — the web moved off page tallies because they undercounted:
 *   - Total Activities / Purchases Made → the whole filter.
 *   - Today's Activities → `date_from` = the venue's today (Michigan).
 *   - Manager Actions / Attendant Actions → `user_role`.
 *   - Active Attendants → still the distinct logins in the newest page, as on
 *     the web's manager page.
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
      fetchActivityCount(token, { ...base, dateFrom: venueTodayKey() }),
      fetchActivityCount(token, { ...base, userRole: "location_manager" }),
      fetchActivityCount(token, { ...base, userRole: "attendant" }),
      // Newest page (web itemsPerPage=20, created_at desc) — Active Attendants only.
      fetchActivityLogs(token, base, 1, WEB_PAGE_SIZE),
    ])
      .then(([total, purchases, today, managerActions, attendantActions, recentPage]) => {
        if (requestId !== requestIdRef.current) return;
        // Distinct users who logged in today, within the loaded page (web's unique-userId set).
        const activeIds = new Set<number>();
        for (const log of recentPage.logs) {
          if (
            isTodayLocal(log.createdAt) &&
            log.action === "logged_in" &&
            log.actor.id != null
          ) {
            activeIds.add(log.actor.id);
          }
        }
        setStats({
          total,
          today,
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

// Window the filter/export pickers are built from. The web derives its option
// lists from its loaded page (a fixed 20); mobile's page size is user-chosen and
// defaults to 5, which would hide users the web offers — so read a fixed, wider
// window instead of whatever page the list happens to be showing.
const OPTIONS_SAMPLE_SIZE = 100;

/**
 * Newest logs used only to populate filter and export pickers (actions,
 * resource types, users). Independent of the list's pagination so the options
 * don't change as the user pages or switches rows-per-page.
 */
export function useActivityFilterOptions(
  locationId: number | undefined,
  nonce = 0,
) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const token = getToken();
    if (!token) return;

    fetchActivityLogs(token, { locationId }, 1, OPTIONS_SAMPLE_SIZE)
      .then((res) => {
        if (requestId === requestIdRef.current) setLogs(res.logs);
      })
      .catch(() => {
        /* Best-effort: the pickers fall back to the loaded page. */
      });

    return () => {
      requestIdRef.current++;
    };
  }, [locationId, nonce]);

  return logs;
}

/**
 * Every staff member, active and inactive, for the user pickers — so someone
 * with no recent activity can still be picked (web: getAllUsers x2). Best-effort.
 */
export function useActivityStaffOptions(nonce = 0) {
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requests = requestIdRef;
    const requestId = ++requests.current;
    const token = getToken();
    if (!token) return;

    fetchAllStaffUsers(token, {})
      .then((users) => {
        if (requestId !== requests.current) return;
        setStaff(users.map((u) => ({ id: u.id, name: u.name || u.email })));
      })
      .catch(() => {
        /* The pickers still list everyone in the loaded logs. */
      });

    return () => {
      requests.current++;
    };
  }, [nonce]);

  return staff;
}
