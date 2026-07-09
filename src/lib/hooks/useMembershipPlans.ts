import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMembershipPlans,
  type MembershipPlanRow,
} from "../../services/membershipPlansService";
import { getToken } from "../session";

// Session cache of the plan list; views filter it client-side. Mirrors the
// caching approach used by usePackages.
type Cache = { fetchedAt: number; data: MembershipPlanRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Loads + caches the membership plan list, with `refetch` + optimistic patches. */
export function useMembershipPlans() {
  const cacheFresh = !!cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [plans, setPlans] = useState<MembershipPlanRow[]>(cache?.data ?? []);
  const [loading, setLoading] = useState(!cacheFresh);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const sync = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const fresh = !!cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    if (fresh && !force) {
      setPlans(cache!.data);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    const token = getToken();
    if (!token) {
      if (isCurrent()) {
        setError("Not authenticated");
        setLoading(false);
      }
      return;
    }

    if (cache && !force) {
      setPlans(cache.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchMembershipPlans({ token });
      cache = { fetchedAt: Date.now(), data };
      if (isCurrent()) {
        setPlans(data);
        setError(null);
      }
    } catch (err) {
      console.error("Membership plans error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load plans");
        if (!cache) setPlans([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  const refetch = useCallback(() => sync({ force: true }), [sync]);

  // Patch a single plan's active state in the cache + local list without a full
  // refetch (used after an optimistic toggle-status call).
  const applyStatus = useCallback((id: number, active: boolean) => {
    const patch = (rows: MembershipPlanRow[]) =>
      rows.map((p) => (p.id === id ? { ...p, isActive: active } : p));
    if (cache) cache = { ...cache, data: patch(cache.data) };
    setPlans((prev) => patch(prev));
  }, []);

  // Drop the cache so the next mount/refetch reloads from the backend (used
  // after a create/edit/delete that changes which rows exist).
  const invalidate = useCallback(() => {
    cache = null;
  }, []);

  return { plans, loading, error, refetch, applyStatus, invalidate };
}
