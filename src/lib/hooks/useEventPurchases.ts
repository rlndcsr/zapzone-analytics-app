import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchEventPurchases,
  type EventPurchaseRow,
} from "../../services/eventPurchasesService";
import { getCurrentUser, getToken } from "../session";

// Session cache of the event-purchase list, keyed by location; views filter it
// client-side. Mirrors the caching approach used by useAttractionPurchases.
type Cache = { key: string; fetchedAt: number; data: EventPurchaseRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

// Set after creating a purchase so the list screen force-refetches on focus.
let stale = false;

/** Mark the cached event purchases stale so they refetch on next focus. */
export function markEventPurchasesStale(): void {
  cache = null;
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeEventPurchasesStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseEventPurchasesParams = { locationId?: number };

/** Loads + caches the event purchases, with pull-to-refresh (`refetch`). */
export function useEventPurchases({
  locationId,
}: UseEventPurchasesParams = {}) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [purchases, setPurchases] = useState<EventPurchaseRow[]>(
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
        const data = await fetchEventPurchases({
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
        console.error("Event purchases error:", err);
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
