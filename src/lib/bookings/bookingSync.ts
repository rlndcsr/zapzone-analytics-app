import type { CalendarBooking } from "../../services/bookingsService";

/** Latest booking date first, then newest id — the order the plain index (booking_date desc) returned. */
export function newestFirst(bookings: CalendarBooking[]): CalendarBooking[] {
  return [...bookings].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
  );
}

/** Apply the `updated_since` change feed to a cached list: deleted ids leave, changed rows replace or join. */
export function applyBookingChanges(
  cached: CalendarBooking[],
  changed: CalendarBooking[],
  deletedIds: number[],
): CalendarBooking[] {
  if (changed.length === 0 && deletedIds.length === 0) return cached;
  const byId = new Map(cached.map((booking) => [booking.id, booking]));
  for (const id of deletedIds) byId.delete(id);
  for (const booking of changed) byId.set(booking.id, booking);
  return newestFirst([...byId.values()]);
}
