import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAllBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import { getToken } from "../session";

// Session cache of the full booking list, keyed by location; the Manage
// Bookings screen filters/sorts/paginates it client-side. Mirrors the caching
// approach used by useCalendarBookings / useAttractions. This cache is separate
// from useCalendarBookings' so the two screens stay decoupled, but both feed off
// the same `fetchAllBookings` request shape.
type Cache = { key: string; fetchedAt: number; data: CalendarBooking[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

// Set after a mutation (e.g. a status change from the detail sheet) so the list
// screen knows to force a refetch the next time it regains focus.
let stale = false;

/** Mark the cached booking list stale so it refetches on next focus. */
export function markBookingsStale(): void {
  cache = null;
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeBookingsStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseBookingsParams = { locationId?: number };

/** Loads + caches the full booking list, with pull-to-refresh (`refetch`). */
export function useBookings({ locationId }: UseBookingsParams = {}) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [bookings, setBookings] = useState<CalendarBooking[]>(
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
        setBookings(cache!.data);
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
        setBookings(cache.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchAllBookings({ token, locationId });
        cache = { key: k, fetchedAt: Date.now(), data };
        if (isCurrent()) {
          setBookings(data);
          setError(null);
        }
      } catch (err) {
        console.error("Bookings error:", err);
        if (isCurrent()) {
          setError(err instanceof Error ? err.message : "Failed to load bookings");
          if (!cache) setBookings([]);
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

  return { bookings, loading, error, refetch };
}
