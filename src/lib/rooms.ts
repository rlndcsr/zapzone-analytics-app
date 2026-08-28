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
