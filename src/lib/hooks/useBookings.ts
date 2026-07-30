import { useCallback, useEffect, useRef, useState } from "react";
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

// The booking list itself lives in the shared bookingListCache, so the Manage
// Bookings screen and the calendars never sync the same data twice.
export {
  consumeBookingsStale,
  markBookingsStale,
} from "../bookings/bookingListCache";

type UseBookingsParams = { locationId?: number };

/** Loads + caches the full booking list, with pull-to-refresh (`refetch`). */
export function useBookings({ locationId }: UseBookingsParams = {}) {
  const cached = getCachedBookings(bookingCacheKey(locationId));

  const [bookings, setBookings] = useState<CalendarBooking[]>(
    cached?.data ?? [],
  );
  const [loading, setLoading] = useState(!isBookingCacheFresh(cached));
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = bookingCacheKey(locationId);
      const entry = readBookingCache(k, "useBookings");

      if (isBookingCacheFresh(entry) && !force) {
        setBookings(entry!.data);
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
        setBookings(entry.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await syncBookingList({ token, locationId, force });
        if (isCurrent()) {
          setBookings(data);
          setError(null);
        }
      } catch (err) {
        console.error("Bookings error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load bookings",
          );
          if (!hasCachedBookings(k)) setBookings([]);
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
