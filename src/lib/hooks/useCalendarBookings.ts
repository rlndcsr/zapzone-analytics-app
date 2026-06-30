import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchBookingsInRange,
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

export function useCalendarBookings({
  startDate,
  endDate,
  locationId,
}: UseCalendarBookingsParams) {
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monotonic request token: only the latest load may write state, so a slow
  // earlier window can never clobber a newer selection. Bumped on cleanup so an
  // in-flight request is dropped once the deps change or the screen unmounts.
  const requestIdRef = useRef(0);

  const loadBookings = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    try {
      const token = getToken();
      if (!token) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const result = await fetchBookingsInRange({
        token,
        startDate,
        endDate,
        locationId,
      });
      if (isCurrent()) {
        setBookings(result);
        setError(null);
      }
    } catch (err) {
      console.error("Calendar bookings error:", err);
      if (isCurrent()) {
        setError(
          err instanceof Error ? err.message : "Failed to load bookings",
        );
        setBookings([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [startDate, endDate, locationId]);

  useEffect(() => {
    loadBookings();
    return () => {
      requestIdRef.current++;
    };
  }, [loadBookings]);

  return { bookings, loading, error, refetch: loadBookings };
}
