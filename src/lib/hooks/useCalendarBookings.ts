import { useCallback, useEffect, useRef, useState } from "react";
import { type CalendarBooking } from "../../services/bookingsService";
import {
  bookingCacheKey,
  bookingRangeKey,
  getCachedBookings,
  getCachedRange,
  isBookingCacheFresh,
  subscribeToBookingCache,
  syncBookingRange,
} from "../bookings/bookingListCache";
import { getToken } from "../session";

type UseCalendarBookingsParams = {
  /** Inclusive start of the visible window, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end of the visible window, YYYY-MM-DD. */
  endDate: string;
  locationId?: number;
};

/**
 * The bookings on screen, and only those.
 *
 * This used to pull the whole history through `syncBookingList` and filter it down to the visible
 * days on the device — up to a hundred pages of bookings to draw one day. The window is known
 * before the request is made, so it is asked for; a venue with years of bookings now costs the
 * same as a quiet one. A fresh full list, left behind by Manage Bookings, is still used as-is, so
 * moving between the two screens stays instant.
 */
export function useCalendarBookings({
  startDate,
  endDate,
  locationId,
}: UseCalendarBookingsParams) {
  /** Whatever is already held for this window — the full list if fresh, else the window itself. */
  const cachedFor = useCallback(
    (from: string, to: string): CalendarBooking[] | null => {
      const full = getCachedBookings(bookingCacheKey(locationId));
      if (isBookingCacheFresh(full)) {
        return full!.data.filter((b) => b.date >= from && b.date <= to);
      }
      const range = getCachedRange(bookingRangeKey(from, to, locationId));
      return isBookingCacheFresh(range) ? range!.data : (range?.data ?? null);
    },
    [locationId],
  );

  const [bookings, setBookings] = useState<CalendarBooking[]>(
    () => cachedFor(startDate, endDate) ?? [],
  );
  const [loading, setLoading] = useState(
    () => cachedFor(startDate, endDate) === null,
  );
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses, and against a fast
  // swipe through weeks landing an earlier window's rows on a later one).
  const requestIdRef = useRef(0);

  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
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

      // Paint what is held — even if stale — and refresh behind it; only a window we hold
      // nothing for gets the spinner.
      const held = force ? null : cachedFor(startDate, endDate);
      if (held) {
        setBookings(held);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await syncBookingRange({
          token,
          locationId,
          from: startDate,
          to: endDate,
          force,
        });
        if (isCurrent()) {
          setBookings(data);
          setError(null);
        }
      } catch (err) {
        console.error("Calendar bookings error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load bookings",
          );
          if (!held) setBookings([]);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [locationId, startDate, endDate, cachedFor],
  );

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  // A patch (e.g. an internal note just saved) rewrites the cached row; re-read it
  // so the schedule repaints without a refetch and without jumping the view.
  useEffect(
    () =>
      subscribeToBookingCache(() => {
        const held = cachedFor(startDate, endDate);
        if (held) setBookings(held);
      }),
    [cachedFor, startDate, endDate],
  );

  const refetch = useCallback(() => sync({ force: true }), [sync]);

  return { bookings, loading, error, refetch };
}
