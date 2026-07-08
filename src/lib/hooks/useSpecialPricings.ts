import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSpecialPricings,
  type SpecialPricingRow,
} from "../../services/specialPricingService";
import { getToken } from "../session";

// Session cache of the special-pricing list, keyed by location; views filter it
// client-side. Mirrors the caching approach used by usePackages.
type Cache = { key: string; fetchedAt: number; data: SpecialPricingRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

// Set after a mutation (e.g. creating a special pricing) so the list screen
// knows to force a refetch the next time it regains focus.
let stale = false;

/** Mark the cached special-pricing list stale so it refetches on next focus. */
export function markSpecialPricingsStale(): void {
  cache = null;
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeSpecialPricingsStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseSpecialPricingsParams = { locationId?: number };

/** Loads + caches the special-pricing list, with pull-to-refresh (`refetch`). */
export function useSpecialPricings({
  locationId,
}: UseSpecialPricingsParams = {}) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [specialPricings, setSpecialPricings] = useState<SpecialPricingRow[]>(
    cache && cache.key === key ? cache.data : [],
  );
  const [loading, setLoading] = useState(!cacheFresh);
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = cacheKey(locationId);
      const fresh =
        !!cache &&
        cache.key === k &&
        Date.now() - cache.fetchedAt < CACHE_TTL_MS;

      if (fresh && !force) {
        setSpecialPricings(cache!.data);
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

      // Show stale cache instantly and refresh quietly; else show the spinner.
      if (cache && cache.key === k && !force) {
        setSpecialPricings(cache.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchSpecialPricings({ token, locationId });
        cache = { key: k, fetchedAt: Date.now(), data };
        if (isCurrent()) {
          setSpecialPricings(data);
          setError(null);
        }
      } catch (err) {
        console.error("Special pricings error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load special pricings",
          );
          if (!cache) setSpecialPricings([]);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [locationId],
  );

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  const refetch = useCallback(() => sync({ force: true }), [sync]);

  // Patch a single row's active state in the cache + local list without a full
  // refetch (used after an optimistic toggle-status call).
  const applyStatus = useCallback((id: number, active: boolean) => {
    const patch = (rows: SpecialPricingRow[]) =>
      rows.map((p) =>
        p.id === id ? { ...p, status: active ? "active" : "inactive" } : p,
      ) as SpecialPricingRow[];
    if (cache) cache = { ...cache, data: patch(cache.data) };
    setSpecialPricings((prev) => patch(prev));
  }, []);

  // Drop a row from the cache + local list without a full refetch (used after
  // a delete).
  const remove = useCallback((id: number) => {
    const drop = (rows: SpecialPricingRow[]) => rows.filter((p) => p.id !== id);
    if (cache) cache = { ...cache, data: drop(cache.data) };
    setSpecialPricings((prev) => drop(prev));
  }, []);

  return { specialPricings, loading, error, refetch, applyStatus, remove };
}
