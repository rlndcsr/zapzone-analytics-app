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

// Session cache of the full booking list; views filter it client-side.
type BookingsCache = { key: string; fetchedAt: number; data: CalendarBooking[] };
let cache: BookingsCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

export function useCalendarBookings({
  startDate,
  endDate,
  locationId,
}: UseCalendarBookingsParams) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [allBookings, setAllBookings] = useState<CalendarBooking[]>(
    cache && cache.key === key ? cache.data : [],
  );
  const [loading, setLoading] = useState(!cacheFresh);
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  // Fetch + cache the full list; `force` (pull-to-refresh) ignores the TTL.
  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = cacheKey(locationId);
      const fresh =
        !!cache && cache.key === k && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

      if (fresh && !force) {
        setAllBookings(cache!.data);
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
        setAllBookings(cache.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchAllBookings({ token, locationId });
        cache = { key: k, fetchedAt: Date.now(), data };
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
          if (!cache) setAllBookings([]);
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
