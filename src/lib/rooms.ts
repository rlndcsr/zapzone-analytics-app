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

/**
 * What Area Group Settings opens with for one group — its real state, not a guess.
 * One shared turnaround fills the field; different ones leave it blank with the range;
 * the box is ticked only when every space has it ticked, and mixed when some do.
 * Web parity: Rooms.tsx `areaGroupSummary`.
 */
export function summarizeAreaGroup(
  rooms: { bookingInterval: number | null; areaAllowsSimultaneousStarts: boolean }[],
): {
  turnaround: string;
  turnaroundRange: string | null;
  largestTurnaround: number | null;
  startsTogether: boolean;
  startsTogetherMixed: boolean;
} {
  const turnarounds = [
    ...new Set(
      rooms
        .map((r) => r.bookingInterval)
        .filter((minutes): minutes is number => minutes != null),
    ),
  ].sort((a, b) => a - b);
  const together = rooms.map((r) => r.areaAllowsSimultaneousStarts === true);
  return {
    turnaround: turnarounds.length === 1 ? String(turnarounds[0]) : "",
    turnaroundRange:
      turnarounds.length > 1
        ? `${turnarounds[0]}–${turnarounds[turnarounds.length - 1]} min`
        : null,
    largestTurnaround:
      turnarounds.length > 0 ? turnarounds[turnarounds.length - 1] : null,
    startsTogether: together.length > 0 && together.every(Boolean),
    startsTogetherMixed: together.some(Boolean) && !together.every(Boolean),
  };
}

/**
 * What an Area Group Settings save sends: only the controls staff changed. An untouched
 * or cleared turnaround field is left out, so it never rewrites anyone's turnaround.
 * `invalid` when the typed turnaround isn't a number of 0 or more.
 * Web parity: Rooms.tsx `handleAreaGroupIntervalUpdate`.
 */
export function areaGroupChanges({
  interval,
  intervalTouched,
  startsTogether,
  startsTogetherTouched,
}: {
  interval: string;
  intervalTouched: boolean;
  startsTogether: boolean;
  startsTogetherTouched: boolean;
}):
  | { kind: "nothing" }
  | { kind: "invalid" }
  | {
      kind: "save";
      changes: { bookingInterval?: number; allowsSimultaneousStarts?: boolean };
    } {
  const sendInterval = intervalTouched && interval.trim() !== "";
  if (!sendInterval && !startsTogetherTouched) return { kind: "nothing" };
  const minutes = Number.parseInt(interval, 10);
  if (sendInterval && (Number.isNaN(minutes) || minutes < 0)) {
    return { kind: "invalid" };
  }
  return {
    kind: "save",
    changes: {
      ...(sendInterval ? { bookingInterval: minutes } : {}),
      ...(startsTogetherTouched ? { allowsSimultaneousStarts: startsTogether } : {}),
    },
  };
}

/**
 * Whether any picked space sits in an area that keeps its start times apart: an
 * available space with an area group shared by another space, where not every space in
 * that area may start at the same time. Web parity: CreatePackage/EditPackage
 * `selectedSpacesHoldStartsApart`.
 */
export function selectedSpacesHoldStartsApart(
  selectedIds: number[],
  rooms: {
    id: number;
    areaGroup: string | null;
    isAvailable: boolean;
    areaAllowsSimultaneousStarts: boolean;
  }[],
): boolean {
  return selectedIds.some((id) => {
    const room = rooms.find((candidate) => candidate.id === id);
    if (!room || room.isAvailable === false || !room.areaGroup) return false;
    const area = rooms.filter((candidate) => candidate.areaGroup === room.areaGroup);
    return (
      area.length > 1 &&
      !area.every((candidate) => candidate.areaAllowsSimultaneousStarts === true)
    );
  });
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
