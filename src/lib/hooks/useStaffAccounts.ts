import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchRecentStaff,
  fetchStaffCount,
  fetchStaffUsers,
  type StaffFilters,
  type StaffUser,
} from "../../services/usersService";
import { getToken } from "../session";

/*
 * Staff (Manage Accounts) data hooks. The /users endpoint filters + paginates
 * server-side, so useStaffAccounts refetches whenever the filters or page
 * change — the same shape as useWaivers.
 */

// Set after a mutation (toggle-status / delete) so the list refetches on focus.
let stale = false;

/** Mark the staff list stale so it refetches on next focus. */
export function markStaffStale(): void {
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeStaffStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseStaffParams = {
  filters: StaffFilters;
  page: number;
  perPage?: number;
};

export function useStaffAccounts({ filters, page, perPage = 15 }: UseStaffParams) {
  const [users, setUsers] = useState<StaffUser[]>([]);
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
      const res = await fetchStaffUsers(token, filters, page, perPage);
      if (isCurrent()) {
        setUsers(res.users);
        setTotal(res.total);
        setLastPage(res.lastPage);
        setError(null);
      }
    } catch (err) {
      console.error("Staff accounts error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
        setUsers([]);
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

  return { users, total, lastPage, loading, error, refetch: sync };
}

export type StaffStats = {
  total: number;
  activeTotal: number;
  managers: number;
  attendants: number;
  newAccounts: number;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * KPI counts for the Manage Accounts header. Active/role totals come from cheap
 * `per_page=1` count requests; "New Accounts" is derived from a bounded recent
 * page (the users index has no created_at filter). Refetches when `nonce` bumps.
 */
export function useStaffStats(nonce = 0) {
  const [stats, setStats] = useState<StaffStats>({
    total: 0,
    activeTotal: 0,
    managers: 0,
    attendants: 0,
    newAccounts: 0,
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

    Promise.all([
      fetchStaffCount(token, { status: "active" }),
      fetchStaffCount(token, { role: "location_manager", status: "active" }),
      fetchStaffCount(token, { role: "attendant", status: "active" }),
      fetchRecentStaff(token, 50),
    ])
      .then(([activeTotal, managers, attendants, recent]) => {
        if (requestId !== requestIdRef.current) return;
        const cutoff = Date.now() - THIRTY_DAYS_MS;
        const newAccounts = recent.filter((u) => {
          if (!u.createdAt) return false;
          const t = new Date(u.createdAt).getTime();
          return !Number.isNaN(t) && t >= cutoff;
        }).length;
        setStats({
          total: activeTotal,
          activeTotal,
          managers,
          attendants,
          newAccounts,
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
