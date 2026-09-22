import type { CalendarBooking } from "../../services/bookingsService";

/**
 * Merge a few fields into one booking in a cached list.
 *
 * MERGE, never replace. Callers hold a server response about one *part* of a booking — the
 * internal-notes endpoints answer with a note and the rebuilt digest, and nothing else. Writing
 * that object over the cached row would blank every field it does not mention: the customer's
 * name, the date, the package, all of it.
 *
 * A booking that is not in this list is left out rather than appended. A row absent here belongs
 * to a filter this scope never fetched, and inventing a partial one would put a booking with no
 * name and no date on someone's list.
 *
 * Returns the same array reference when nothing matched, so a caller can skip the write and the
 * re-render entirely.
 */
export function mergeBookingInto(
  bookings: CalendarBooking[],
  bookingId: number,
  patch: Partial<CalendarBooking>,
): CalendarBooking[] {
  let hit = false;

  const next = bookings.map((booking) => {
    if (booking.id !== bookingId) return booking;
    hit = true;
    return { ...booking, ...patch };
  });

  return hit ? next : bookings;
}
