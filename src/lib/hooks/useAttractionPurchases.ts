import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAttractionPurchases,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import { getCurrentUser, getToken } from "../session";

// Session cache of the purchase list, keyed by location; views filter it
// client-side. Mirrors the caching approach used by useAttractions.
type Cache = { key: string; fetchedAt: number; data: PurchaseRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

type UseAttractionPurchasesParams = { locationId?: number };

/** Loads + caches the attraction purchases, with pull-to-refresh (`refetch`). */
export function useAttractionPurchases({
  locationId,
}: UseAttractionPurchasesParams = {}) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [purchases, setPurchases] = useState<PurchaseRow[]>(
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
        !!cache && cache.key === k && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

      if (fresh && !force) {
        setPurchases(cache!.data);
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
      if (cache && cache.key === k && !force) {
        setPurchases(cache.data);
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
        cache = { key: k, fetchedAt: Date.now(), data };
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
          if (!cache) setPurchases([]);
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
