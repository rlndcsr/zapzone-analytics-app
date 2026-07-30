import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CalendarBooking } from "../../services/bookingsService";
import {
  bookingCacheKey,
  getCachedBookings,
  hasCachedBookings,
  isBookingCacheFresh,
  readBookingCache,
  syncBookingList,
} from "../bookings/bookingListCache";
import { getToken } from "../session";

type UseCalendarBookingsParams = {
  /** Inclusive start of the visible window, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end of the visible window, YYYY-MM-DD. */
  endDate: string;
  locationId?: number;
};

// The booking list lives in the shared bookingListCache — the same entries the
// Manage Bookings screen fills, so opening a calendar after it is a cache hit.
export function useCalendarBookings({
  startDate,
  endDate,
  locationId,
}: UseCalendarBookingsParams) {
  const cached = getCachedBookings(bookingCacheKey(locationId));

  const [allBookings, setAllBookings] = useState<CalendarBooking[]>(
    cached?.data ?? [],
  );
  const [loading, setLoading] = useState(!isBookingCacheFresh(cached));
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  // Fetch + cache this scope's list; `force` (pull-to-refresh) ignores the TTL.
  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = bookingCacheKey(locationId);
      const entry = readBookingCache(k, "useCalendarBookings");

      if (isBookingCacheFresh(entry) && !force) {
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
        const data = await syncBookingList({ token, locationId, force });
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
          if (!hasCachedBookings(k)) setAllBookings([]);
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
