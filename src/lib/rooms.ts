/**
 * Ordering for the spaces/rooms a package can be booked into.
 *
 * Names are overwhelmingly "Table 1", "Room 12" and the like, so a plain
 * alphabetical sort puts "Table 10" between "Table 1" and "Table 2". Sorting on
 * the digits inside the name keeps the chips in the order staff read them —
 * matching the web's Manual Booking.
 */
export function sortRoomsNumerically<T extends { name: string }>(
  rooms: T[],
): T[] {
  return [...rooms].sort((a, b) => {
    const numA = parseInt(a.name.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.name.replace(/\D/g, ""), 10) || 0;
    if (numA !== numB) return numA - numB;
    return a.name.localeCompare(b.name);
  });
}

/**
 * An edited space's turnaround. An empty box says nothing about what it should be, so it
 * leaves the stored value alone; anything else is saved as typed, 0 included.
 */
export function turnaroundUpdate(value: string): { booking_interval?: number } {
  const trimmed = value.trim();
  if (trimmed === "") return {};
  const minutes = Number.parseInt(trimmed, 10);
  return Number.isFinite(minutes) && minutes >= 0 ? { booking_interval: minutes } : {};
}

/** A cleared Area Group box ungroups the space, so it has to be sent as null, not dropped. */
export function areaGroupValue(value: string): string | null {
  return value.trim() || null;
}

/** Whether a space is bookable. `is_available` is the column; the others are older shapes. */
export function roomIsAvailable(raw: {
  is_available?: boolean | number | null;
  is_active?: boolean | number | null;
  status?: string | null;
}): boolean {
  if (raw.is_available != null) return raw.is_available === true || raw.is_available === 1;
  return (
    raw.is_active === true ||
    raw.is_active === 1 ||
    (raw.status ? raw.status.toLowerCase() === "active" : false) ||
    (raw.is_active == null && raw.status == null)
  );
}
