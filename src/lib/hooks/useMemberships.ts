import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMemberships,
  fetchMembershipSummary,
  type MembershipRow,
} from "../../services/membershipsService";
import { getToken } from "../session";

/** Counts backing the four stat cards (Total / Active / Past Due / Frozen). */
export type MembershipCounts = {
  total: number;
  active: number;
  pastDue: number;
  frozen: number;
};

const EMPTY_COUNTS: MembershipCounts = { total: 0, active: 0, pastDue: 0, frozen: 0 };

// Derive counts from the fetched rows as a fallback when the summary endpoint is
// unavailable (e.g. a role that can't read reports). Accurate while the list
// fits in one page, which it does at this app's scale.
function deriveCounts(rows: MembershipRow[], total: number): MembershipCounts {
  return {
    total,
    active: rows.filter((m) => m.status === "active").length,
    pastDue: rows.filter((m) => m.status === "past_due").length,
    frozen: rows.filter((m) => m.status === "frozen").length,
  };
}

type Cache = { fetchedAt: number; rows: MembershipRow[]; counts: MembershipCounts };
let cache: Cache | null = null;
const CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Loads the membership list and status counts together. The list is fetched
 * unfiltered (screens filter client-side); the counts come from the reports
 * summary so they aren't capped by pagination. Returns `refetch` for pull-to-
 * refresh and after mutations.
 */
export function useMemberships() {
  const cacheFresh = !!cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [memberships, setMemberships] = useState<MembershipRow[]>(cache?.rows ?? []);
  const [counts, setCounts] = useState<MembershipCounts>(cache?.counts ?? EMPTY_COUNTS);
  const [loading, setLoading] = useState(!cacheFresh);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const sync = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const fresh = !!cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    if (fresh && !force) {
      setMemberships(cache!.rows);
      setCounts(cache!.counts);
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
      setMemberships(cache.rows);
      setCounts(cache.counts);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      // The list is required; the summary is best-effort (fall back to derived
      // counts if it fails) so a reports permission gap can't blank the screen.
      const [list, summary] = await Promise.all([
        fetchMemberships({ token }),
        fetchMembershipSummary({ token }).catch(() => null),
      ]);

      const nextCounts: MembershipCounts = summary
        ? {
            total: list.total,
            active: summary.active,
            pastDue: summary.pastDue,
            frozen: summary.frozen,
          }
        : deriveCounts(list.rows, list.total);

      cache = { fetchedAt: Date.now(), rows: list.rows, counts: nextCounts };
      if (isCurrent()) {
        setMemberships(list.rows);
        setCounts(nextCounts);
        setError(null);
      }
    } catch (err) {
      console.error("Memberships error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load memberships");
        if (!cache) {
          setMemberships([]);
          setCounts(EMPTY_COUNTS);
        }
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

  // Force a fresh reload from the backend (pull-to-refresh, and after any
  // create/cancel/freeze/delete mutation which changes rows and counts).
  const refetch = useCallback(() => {
    cache = null;
    return sync({ force: true });
  }, [sync]);

  return { memberships, counts, loading, error, refetch };
}
