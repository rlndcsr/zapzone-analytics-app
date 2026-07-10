import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchDayOffs,
  type DayOff,
  type DayOffFilters,
} from "../../services/dayOffsService";
import { getToken } from "../session";

/*
 * Day-off (blocked dates) data hook. The /day-offs endpoint filters + paginates
 * server-side, so this refetches on any filter/page change — mirrors useWaivers.
 */

// Set after a mutation (create / update / delete) so the list refetches on focus.
let stale = false;

/** Mark the day-off list stale so it refetches on next focus. */
export function markDayOffsStale(): void {
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeDayOffsStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseDayOffsParams = {
  filters: DayOffFilters;
  page: number;
  perPage?: number;
};

export function useDayOffs({ filters, page, perPage = 15 }: UseDayOffsParams) {
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
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
      const res = await fetchDayOffs(token, filters, page, perPage);
      if (isCurrent()) {
        setDayOffs(res.dayOffs);
        setTotal(res.total);
        setLastPage(res.lastPage);
        setError(null);
      }
    } catch (err) {
      console.error("Day offs error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load day offs");
        setDayOffs([]);
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

  return { dayOffs, total, lastPage, loading, error, refetch: sync };
}
