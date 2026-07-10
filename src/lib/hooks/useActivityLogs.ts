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

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  managerActions: number;
  attendantActions: number;
};

/**
 * KPI counts for the Activity Log header. Total + today come from cheap
 * `per_page=1` count requests; the manager/attendant split is computed over
 * today's entries (bounded fetch) since the index has no actor-role filter.
 * Both counts respect the active location filter. Refetches when `nonce` bumps.
 */
export function useActivityStats(locationId: number | undefined, nonce = 0) {
  const [stats, setStats] = useState<ActivityStats>({
    total: 0,
    today: 0,
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

    const today = todayKey();
    const base: ActivityFilters = { locationId };

    Promise.all([
      fetchActivityCount(token, base),
      fetchActivityCount(token, { ...base, dateFrom: today }),
      fetchActivityLogs(token, { ...base, dateFrom: today }, 1, 100),
    ])
      .then(([total, todayCount, todayPage]) => {
        if (requestId !== requestIdRef.current) return;
        let managerActions = 0;
        let attendantActions = 0;
        for (const log of todayPage.logs) {
          if (log.actor.role === "location_manager") managerActions++;
          else if (log.actor.role === "attendant") attendantActions++;
        }
        setStats({ total, today: todayCount, managerActions, attendantActions });
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
