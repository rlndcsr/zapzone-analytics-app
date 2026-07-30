import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAllBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import { getToken } from "../session";

type UseCalendarBookingsParams = {
  /** Inclusive start of the visible window, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end of the visible window, YYYY-MM-DD. */
  endDate: string;
  locationId?: number;
};

// Session cache of the full booking list; views filter it client-side. One entry
// PER LOCATION SCOPE: a single shared slot made the location-scoped Booking
// Calendar and the unscoped Calendar tab evict each other, so every navigation
// re-paged the whole list (~100 requests) and flooded the API into timeouts.
type CacheEntry = { fetchedAt: number; data: CalendarBooking[] };
const cache = new Map<string, CacheEntry>();
// In-flight fetch per scope, so two mounted calendars share one network trip.
const inFlight = new Map<string, Promise<CalendarBooking[]>>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");
const isFresh = (entry?: CacheEntry) =>
  !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;

export function useCalendarBookings({
  startDate,
  endDate,
  locationId,
}: UseCalendarBookingsParams) {
  const cached = cache.get(cacheKey(locationId));

  const [allBookings, setAllBookings] = useState<CalendarBooking[]>(
    cached?.data ?? [],
  );
  const [loading, setLoading] = useState(!isFresh(cached));
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  // Fetch + cache this scope's list; `force` (pull-to-refresh) ignores the TTL.
  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = cacheKey(locationId);
      const entry = cache.get(k);

      if (isFresh(entry) && !force) {
        setAllBookings(entry!.data);
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
      if (entry && !force) {
        setAllBookings(entry.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        // Join an in-flight sync for this scope rather than starting a second.
        let pending = force ? undefined : inFlight.get(k);
        if (!pending) {
          pending = fetchAllBookings({ token, locationId }).finally(() => {
            inFlight.delete(k);
          });
          inFlight.set(k, pending);
        }
        const data = await pending;
        cache.set(k, { fetchedAt: Date.now(), data });
        if (isCurrent()) {
          setAllBookings(data);
          setError(null);
        }
      } catch (err) {
        console.error("Calendar bookings error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load bookings",
          );
          if (!cache.has(k)) setAllBookings([]);
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

  // Bookings within the visible window (YYYY-MM-DD strings compare lexically).
  const bookings = useMemo(
    () => allBookings.filter((b) => b.date >= startDate && b.date <= endDate),
    [allBookings, startDate, endDate],
  );

  const refetch = useCallback(() => sync({ force: true }), [sync]);

  // `bookings` is the visible window; `allBookings` is the full cached set,
  // handy for deriving stable filter options (e.g. the location list) that
  // shouldn't change as the user navigates between months.
  return { bookings, allBookings, loading, error, refetch };
}
