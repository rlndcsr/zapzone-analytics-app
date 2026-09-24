import type { MinuteScale } from "./minuteScale";
import type { TimeWindow } from "./spaceScheduleGrid";

export type TimeRange = {
  startMinutes: number;
  endMinutes: number;
  reason?: string | null;
};

export type BandGeometry = { top: number; height: number };

export type FreeState =
  | { kind: "free"; atMinute: number }
  | { kind: "booked" }
  | { kind: "blocked"; reason: string }
  | { kind: "closed" }
  | { kind: "day-over" };

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export const WALK_IN_SNAP_MINUTES = 5;

export function snapToInterval(
  minute: number,
  intervalMinutes: number,
  floorMinute?: number,
): number {
  const interval = Math.max(1, Math.round(intervalMinutes) || 15);
  const safe = Number.isFinite(minute) ? minute : 0;
  let snapped = Math.floor(safe / interval) * interval;
  if (
    floorMinute !== undefined &&
    Number.isFinite(floorMinute) &&
    snapped < floorMinute
  ) {
    snapped = Math.ceil(floorMinute / interval) * interval;
  }
  return Math.max(0, snapped);
}

export function snapToOfferedStart(
  starts: number[],
  minute: number,
  floorMinute?: number,
): number | null {
  const usable =
    floorMinute === undefined
      ? starts
      : starts.filter((start) => start >= floorMinute);
  if (usable.length === 0) return null;

  return usable.reduce((best, start) =>
    Math.abs(start - minute) < Math.abs(best - minute) ? start : best,
  );
}

export function minuteAtOffset(
  originMinute: number,
  offsetPx: number,
  scale: MinuteScale,
): number {
  const origin = finite(originMinute, 0);
  const offset = finite(offsetPx, 0);
  // the rate is not a straight line, so walk back through the scale from where the element starts
  return scale.minuteAt(scale.at(origin) + offset);
}

export function bandGeometry(
  openMinutes: number | null,
  closeMinutes: number | null,
  timeWindow: TimeWindow,
  scale: MinuteScale,
): BandGeometry | null {
  if (openMinutes == null || closeMinutes == null) return null;
  const from = Math.max(openMinutes, timeWindow.start);
  const to = Math.min(closeMinutes, timeWindow.end);
  if (to <= from) return null;
  return { top: scale.at(from), height: scale.spanHeight(from, to) };
}

export function nextFreeMinute(
  openMinutes: number | null,
  closeMinutes: number | null,
  busy: TimeRange[],
  from: number,
): number | null {
  if (
    openMinutes == null ||
    closeMinutes == null ||
    closeMinutes <= openMinutes
  )
    return null;
  const floor = Math.max(openMinutes, from);
  if (floor >= closeMinutes) return null;

  let cursor = floor;
  for (const range of [...busy].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  )) {
    if (range.endMinutes <= cursor) continue;
    if (range.startMinutes > cursor) break;
    cursor = Math.max(cursor, range.endMinutes);
  }
  return cursor < closeMinutes ? cursor : null;
}

// Assumes `from` is itself free; answers how long that stays true — the
// gap length a walk-in package has to fit inside, not just whether `from`
// is free at all.
export function freeUntilMinute(
  openMinutes: number | null,
  closeMinutes: number | null,
  busy: TimeRange[],
  from: number,
): number | null {
  if (
    openMinutes == null ||
    closeMinutes == null ||
    !Number.isFinite(from) ||
    closeMinutes <= openMinutes
  ) {
    return null;
  }

  let end = closeMinutes;
  for (const range of busy) {
    if (
      !Number.isFinite(range.startMinutes) ||
      !Number.isFinite(range.endMinutes)
    )
      continue;
    if (range.endMinutes <= range.startMinutes) continue;
    if (range.endMinutes <= from) continue;
    if (range.startMinutes <= from) return from;
    if (range.startMinutes < end) end = range.startMinutes;
  }
  return end;
}

export function freeState(
  openMinutes: number | null,
  closeMinutes: number | null,
  busy: TimeRange[],
  from: number,
  bookable = true,
): FreeState {
  if (
    !bookable ||
    openMinutes == null ||
    closeMinutes == null ||
    closeMinutes <= openMinutes
  ) {
    return { kind: "closed" };
  }
  if (from >= closeMinutes) return { kind: "day-over" };

  const floor = Math.max(openMinutes, from);
  let cursor = floor;
  let lastReason: string | null = null;

  for (const range of [...busy].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  )) {
    if (range.endMinutes <= cursor) continue;
    if (range.startMinutes > cursor) break;
    lastReason = range.reason ?? null;
    cursor = Math.max(cursor, range.endMinutes);
  }

  if (cursor < closeMinutes) return { kind: "free", atMinute: cursor };
  return lastReason
    ? { kind: "blocked", reason: lastReason }
    : { kind: "booked" };
}

export type Occupant = {
  id: number;
  startMinutes: number;
  endMinutes: number;
  turnaroundMinutes: number;
};

/** A real overlap is a double booking; zero minutes means only the turnaround is missing. */
export type Clash<T> = { occupant: T; overlapMinutes: number };

// Two bookings clash when either one starts before the other's turnaround has
// cleared — the same test the server's own conflict check applies. The actual
// (turnaround-free) overlap tells the caller whether that's a true double
// booking or merely back-to-back with no time to reset the space.
export function conflictsWith<T extends Occupant>(
  target: T,
  candidates: T[],
): Clash<T>[] {
  return candidates
    .filter(
      (other) =>
        other.id !== target.id &&
        target.startMinutes < other.endMinutes + other.turnaroundMinutes &&
        target.endMinutes + target.turnaroundMinutes > other.startMinutes,
    )
    .map((other) => ({
      occupant: other,
      overlapMinutes: Math.max(
        0,
        Math.min(target.endMinutes, other.endMinutes) -
          Math.max(target.startMinutes, other.startMinutes),
      ),
    }));
}
