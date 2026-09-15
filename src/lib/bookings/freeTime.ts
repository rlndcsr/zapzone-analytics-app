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

export function minuteAtOffset(
  originMinute: number,
  offsetPx: number,
  pxPerMinute: number,
): number {
  const origin = finite(originMinute, 0);
  const offset = finite(offsetPx, 0);
  const scale = finite(pxPerMinute, 0);
  if (scale <= 0) return origin;
  return origin + offset / scale;
}

export function bandGeometry(
  openMinutes: number | null,
  closeMinutes: number | null,
  timeWindow: TimeWindow,
  pxPerMinute: number,
): BandGeometry | null {
  if (openMinutes == null || closeMinutes == null) return null;
  const from = Math.max(openMinutes, timeWindow.start);
  const to = Math.min(closeMinutes, timeWindow.end);
  if (to <= from) return null;
  return {
    top: (from - timeWindow.start) * pxPerMinute,
    height: (to - from) * pxPerMinute,
  };
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
