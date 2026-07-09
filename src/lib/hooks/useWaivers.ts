import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWaiverCount,
  fetchWaivers,
  type Waiver,
  type WaiverSearchFilters,
  type WaiverStatus,
} from "../../services/waiversService";
import { getToken } from "../session";

/*
 * Waiver Records data hook. Unlike useBookings (which loads everything and
 * filters client-side), the /waivers endpoint filters + paginates server-side
 * and offers no "all statuses" fetch — so this hook refetches whenever the
 * filters or page change, exactly like the web admin's WaiversSearch.load().
 */

// Set after a mutation (assign / delete) so the list refetches on next focus.
let stale = false;

/** Mark the waiver list stale so it refetches on next focus. */
export function markWaiversStale(): void {
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeWaiversStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseWaiversParams = {
  filters: WaiverSearchFilters;
  page: number;
  perPage?: number;
};

export function useWaivers({ filters, page, perPage = 25 }: UseWaiversParams) {
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  // Serialize the inputs so the effect only refires on a real change.
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
      const res = await fetchWaivers(token, filters, page, perPage);
      if (isCurrent()) {
        setWaivers(res.waivers);
        setTotal(res.total);
        setLastPage(res.lastPage);
        setError(null);
      }
    } catch (err) {
      console.error("Waivers error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load waivers");
        setWaivers([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
    // key captures filters/page/perPage; eslint can't see through JSON.stringify.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  return { waivers, total, lastPage, loading, error, refetch: sync };
}

const COUNT_STATUSES: WaiverStatus[] = ["completed", "pending", "expired"];

/**
 * Per-status record totals (across all dates) for the KPI cards. The web has no
 * waiver KPIs; these come from cheap `per_page=1` count requests so we add no
 * heavy endpoints. Refetches when `nonce` changes (bump it after a mutation).
 */
export function useWaiverStats(nonce = 0) {
  const [stats, setStats] = useState({
    completed: 0,
    pending: 0,
    expired: 0,
    total: 0,
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
    Promise.all(COUNT_STATUSES.map((s) => fetchWaiverCount(token, s)))
      .then(([completed, pending, expired]) => {
        if (requestId !== requestIdRef.current) return;
        setStats({
          completed,
          pending,
          expired,
          total: completed + pending + expired,
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
  }, [nonce]);

  return { stats, loading };
}
