import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAttractionPurchases,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import { getCurrentUser, getToken } from "../session";

// Session cache of the purchase list; views filter it client-side. One entry per
// location scope, so a scoped screen and an unscoped one don't evict each other
// and re-page the whole purchase history on every navigation.
type CacheEntry = { fetchedAt: number; data: PurchaseRow[] };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");
const isFresh = (entry?: CacheEntry) =>
  !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;

// Set after creating a purchase so the list screen force-refetches on focus.
let stale = false;

/** Mark the cached purchases stale so they refetch on next focus. */
export function markAttractionPurchasesStale(): void {
  cache.clear();
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeAttractionPurchasesStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseAttractionPurchasesParams = { locationId?: number };

/** Loads + caches the attraction purchases, with pull-to-refresh (`refetch`). */
export function useAttractionPurchases({
  locationId,
}: UseAttractionPurchasesParams = {}) {
  const cached = cache.get(cacheKey(locationId));

  const [purchases, setPurchases] = useState<PurchaseRow[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!isFresh(cached));
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = cacheKey(locationId);
      const entry = cache.get(k);

      if (isFresh(entry) && !force) {
        setPurchases(entry!.data);
        setError(null);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestId === requestIdRef.current;

      const token = getToken();
      const user = getCurrentUser();
      if (!token || !user) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      // Show stale cache instantly and refresh quietly; else show the spinner.
      if (entry && !force) {
        setPurchases(entry.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchAttractionPurchases({
          token,
          userId: user.id,
          locationId,
        });
        cache.set(k, { fetchedAt: Date.now(), data });
        if (isCurrent()) {
          setPurchases(data);
          setError(null);
        }
      } catch (err) {
        console.error("Attraction purchases error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load purchases",
          );
          if (!cache.has(k)) setPurchases([]);
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

  return { purchases, loading, error, refetch };
}
