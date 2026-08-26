import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchWaiverCount,
  fetchWaiverPeriodSummary,
  fetchWaivers,
  type Waiver,
  type WaiverPeriodScope,
  type WaiverPeriodSummary,
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

export function useWaivers({ filters, page, perPage = 5 }: UseWaiversParams) {
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

/**
 * The "This period, all statuses" counts for the summary line, from the same
 * `/waivers/period-summary` endpoint the web Records page reads. Sequence-
 * guarded: on a reconciliation line, a slow reply landing after a newer one
 * would show figures for a period nobody is looking at. Refetches when the
 * scope or `nonce` changes (bump it after a mutation).
 */
export function useWaiverPeriodSummary(scope: WaiverPeriodScope, nonce = 0) {
  const [summary, setSummary] = useState<WaiverPeriodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const { all, date, locationId } = scope;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchWaiverPeriodSummary(token, { all, date, locationId })
      .then((res) => {
        if (requestId !== requestIdRef.current) return;
        setSummary(res);
      })
      .catch(() => {
        // Best-effort: the line just hides itself; the list surfaces real errors.
        if (requestId === requestIdRef.current) setSummary(null);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
    return () => {
      requestIdRef.current++;
    };
  }, [all, date, locationId, nonce]);

  return { summary, loading };
}
