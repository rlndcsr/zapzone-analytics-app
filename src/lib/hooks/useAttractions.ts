import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAttractions,
  type AttractionRow,
} from "../../services/attractionsService";
import { getCurrentUser, getToken } from "../session";

// Session cache of the attraction list, keyed by location; views filter it
// client-side. Mirrors the caching approach used by useCalendarBookings.
type Cache = { key: string; fetchedAt: number; data: AttractionRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

// Set after a mutation (e.g. creating an attraction) so the list screen knows
// to force a refetch the next time it regains focus.
let stale = false;

/** Mark the cached attraction list stale so it refetches on next focus. */
export function markAttractionsStale(): void {
  cache = null;
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeAttractionsStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseAttractionsParams = { locationId?: number };

/** Loads + caches the attraction list, with pull-to-refresh (`refetch`). */
export function useAttractions({ locationId }: UseAttractionsParams = {}) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [attractions, setAttractions] = useState<AttractionRow[]>(
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
        setAttractions(cache!.data);
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
        setAttractions(cache.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchAttractions({
          token,
          userId: user.id,
          locationId,
        });
        cache = { key: k, fetchedAt: Date.now(), data };
        if (isCurrent()) {
          setAttractions(data);
          setError(null);
        }
      } catch (err) {
        console.error("Attractions error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load attractions",
          );
          if (!cache) setAttractions([]);
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

  return { attractions, loading, error, refetch };
}
