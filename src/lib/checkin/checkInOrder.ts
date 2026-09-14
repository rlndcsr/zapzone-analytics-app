/** The two fields the check-in desk's row order depends on. */
export type CheckInOrderable = {
  /** Zero-padded "HH:MM", or `null` when the booking has no time. */
  time: string | null;
  id: number;
};

/**
 * Row order for the check-in desk's day list: latest slot first, matching what
 * the web Check-In page shows.
 *
 * This exists because neither desk was ordering anything. `GET /api/bookings`
 * sorts by `booking_date DESC` with no secondary key, and the desk lists a
 * single day — so every row ties on the only sort key and the database is free
 * to return them however it likes. Both clients sent no sort params and both
 * assumed that made them agree; in practice they each got an arbitrary order
 * and the same guest sat on a different row in each.
 *
 * Times are already normalized to zero-padded "HH:MM", so comparing them as
 * strings is the same as comparing the clock — no Date parsing, no timezone.
 */
export function compareCheckInRows(
  a: CheckInOrderable,
  b: CheckInOrderable,
): number {
  if (a.time !== b.time) {
    // A booking with no time sinks to the bottom rather than jumping the queue.
    if (!a.time) return 1;
    if (!b.time) return -1;
    return b.time.localeCompare(a.time);
  }
  // Two bookings in the same slot must not swap rows between reloads.
  return b.id - a.id;
}

/** {@link compareCheckInRows} over a whole list, leaving the input untouched. */
export function sortForCheckIn<T extends CheckInOrderable>(rows: T[]): T[] {
  return [...rows].sort(compareCheckInRows);
}
