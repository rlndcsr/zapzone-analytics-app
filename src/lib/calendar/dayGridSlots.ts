// Schedule-aware slot math for the Calendar tab's Day grid.
//
// The Day grid draws one column per space. This module answers, for each of
// them, the two questions the web admin's DayScheduleGrid answers: what the
// column header should say about the next start ("Free 4:00 PM", "Booked until
// close", "No package scheduled", …), and what minute a tap on the empty
// availability band actually means.
//
// The Space Schedule screen carries an equivalent of this reasoning inline. It
// is deliberately not shared: that screen folds in day-offs it fetches from
// /day-offs for one concrete location, which the company-wide Calendar tab
// never loads — here the closures come straight off the day window, exactly as
// the web grid reads them.

import type {
  ScheduleDayWindow,
  SchedulePackageWindow,
} from "../../services/scheduleWindowService";
import {
  freeState,
  freeUntilMinute,
  nextFreeMinute,
  snapToInterval,
  snapToOfferedStart,
  WALK_IN_SNAP_MINUTES,
  type TimeRange,
} from "../bookings/freeTime.ts";
import { packagesValidForSlot } from "../bookings/packageCandidates.ts";
import {
  columnKeyFor,
  timeToMinutes,
  type ScheduleColumn,
} from "../bookings/spaceScheduleGrid.ts";
import { SLOT_MINUTES } from "./dayGrid.ts";

/** Only these statuses hold a space — the rest leave it free to rebook. */
export const OCCUPYING_STATUSES = new Set([
  "confirmed",
  "checked-in",
  "pending",
]);

/** Fallback snapping grid when the day window says nothing about intervals. */
const FALLBACK_INTERVAL = 15;

/**
 * One column's operating window, resolved once so the header label, the
 * availability band and the tap handler can never disagree.
 *
 * A column whose room is missing from the day window (the request failed, or
 * hasn't landed) stays `windowKnown: false`: drawn if there is anything to
 * draw, but never bookable, so a slow request can only make the grid inert,
 * never wrong.
 */
export type ColumnSchedule = {
  open: number | null;
  close: number | null;
  closedAllDay: boolean;
  bookable: boolean;
  windowKnown: boolean;
  /** Why it is shut, when the server says so ("No package scheduled", …). */
  reason: string | null;
  /** The space's turnaround — owed to the next BOOKING, never to a closure. */
  turnaround: number;
  /** The customer-facing grid, used to snap a tap that matches no real start. */
  interval: number;
  closedRanges: TimeRange[];
  locationId: number | null;
};

const packagesForColumn = (
  column: ScheduleColumn,
  dayWindow: ScheduleDayWindow | null,
): SchedulePackageWindow[] => {
  if (!dayWindow) return [];
  if (column.roomId != null) {
    return dayWindow.packages.filter((p) => p.room_ids.includes(column.roomId!));
  }
  const packageId = Number(column.key.replace("pkg-", ""));
  if (!Number.isInteger(packageId) || packageId <= 0) return [];
  return dayWindow.packages.filter((p) => p.package_id === packageId);
};

const toRanges = (
  ranges: { start_minutes: number; end_minutes: number; reason: string | null }[] = [],
): TimeRange[] =>
  ranges.map((r) => ({
    startMinutes: r.start_minutes,
    endMinutes: r.end_minutes,
    reason: r.reason ?? "Closed",
  }));

/** The smallest interval any package serving this column runs on. */
const intervalFor = (
  column: ScheduleColumn,
  dayWindow: ScheduleDayWindow | null,
): number => {
  const intervals = packagesForColumn(column, dayWindow)
    .map((p) => p.interval_minutes)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (intervals.length > 0) return Math.min(...intervals);
  const dayInterval = dayWindow?.interval_minutes ?? 0;
  return dayInterval > 0 ? dayInterval : FALLBACK_INTERVAL;
};

export function buildColumnSchedules({
  columns,
  dayWindow,
}: {
  columns: ScheduleColumn[];
  dayWindow: ScheduleDayWindow | null;
}): Map<string, ColumnSchedule> {
  const rooms = new Map(
    (dayWindow?.rooms ?? []).map((room) => [room.room_id, room]),
  );
  const map = new Map<string, ColumnSchedule>();

  for (const column of columns) {
    const interval = intervalFor(column, dayWindow);

    if (column.roomId != null) {
      const entry = rooms.get(column.roomId);
      const windowKnown = dayWindow != null && entry !== undefined;
      map.set(column.key, {
        open: entry?.open_minutes ?? null,
        close: entry?.close_minutes ?? null,
        closedAllDay: entry?.closed_all_day ?? false,
        bookable:
          windowKnown &&
          !entry!.closed_all_day &&
          entry!.bookable !== false &&
          entry!.open_minutes != null &&
          entry!.close_minutes != null,
        windowKnown,
        reason: entry?.reason ?? null,
        turnaround: Math.max(0, entry?.interval_minutes ?? 0),
        interval,
        closedRanges: toRanges(entry?.closed_ranges),
        locationId: entry?.location_id ?? null,
      });
      continue;
    }

    // A roomless column stands for one package, so its window is that
    // package's own — and it is bookable only while the location is open.
    const entry = packagesForColumn(column, dayWindow)[0];
    map.set(column.key, {
      open: entry?.open_minutes ?? null,
      close: entry?.close_minutes ?? null,
      closedAllDay: false,
      bookable:
        dayWindow != null && !dayWindow.location_closed && entry !== undefined,
      windowKnown: dayWindow != null,
      reason: dayWindow?.location_closed ? "Location closed" : null,
      turnaround: 0,
      interval,
      closedRanges: toRanges(entry?.closed_ranges),
      locationId: entry?.location_id ?? null,
    });
  }

  return map;
}

/**
 * Booked ranges per column, each extended by the space's turnaround — a space
 * stays shut while it is reset, and the server's conflict check agrees. Built
 * from every occupying booking, never the filtered list, so a booking hidden
 * by a search or a category tab cannot make its own space look free.
 */
export function buildOccupancy({
  bookings,
  schedules,
  knownRoomIds,
}: {
  bookings: {
    time: string | null;
    durationMinutes: number;
    roomId: number | null;
    packageId: number | null;
  }[];
  schedules: Map<string, ColumnSchedule>;
  knownRoomIds: ReadonlySet<number>;
}): Map<string, TimeRange[]> {
  const map = new Map<string, TimeRange[]>();
  for (const booking of bookings) {
    const key = columnKeyFor(booking, knownRoomIds);
    const schedule = schedules.get(key);
    if (!schedule) continue; // Its column is hidden, so it blocks nothing here.
    const startMinutes = timeToMinutes(booking.time);
    const range: TimeRange = {
      startMinutes,
      endMinutes:
        startMinutes +
        Math.max(SLOT_MINUTES, booking.durationMinutes) +
        schedule.turnaround,
    };
    const list = map.get(key);
    if (list) list.push(range);
    else map.set(key, [range]);
  }
  return map;
}

/** Closures and breaks: blocked, but owed no turnaround of their own. */
export function hardBlocksFor(
  schedule: ColumnSchedule,
  breaks: { start: number; end: number }[],
): TimeRange[] {
  return [
    ...breaks.map((b) => ({
      startMinutes: b.start,
      endMinutes: b.end,
      reason: "On break",
    })),
    ...schedule.closedRanges,
  ];
}

/** Everything that keeps a booking out of this column. */
export function blockedRangesFor(
  occupancy: TimeRange[],
  hardBlocks: TimeRange[],
): TimeRange[] {
  return [...occupancy, ...hardBlocks];
}

/**
 * How long this column is really bookable from `minute`: a booking has to
 * clear the turnaround before the NEXT booking starts, but needs no such gap
 * ahead of a break or a closure — buffering there would hide starts the
 * booking form still accepts.
 */
export function usableFreeUntil({
  schedule,
  occupancy,
  hardBlocks,
  minute,
}: {
  schedule: ColumnSchedule;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  minute: number;
}): number | null {
  const { open, close, turnaround } = schedule;
  if (open == null || close == null) return null;

  const untilBooking = freeUntilMinute(open, close, occupancy, minute);
  const untilHard = freeUntilMinute(open, close, hardBlocks, minute);
  if (untilBooking === null || untilHard === null) return null;

  const bookingCap =
    untilBooking >= close ? untilBooking : Math.max(minute, untilBooking - turnaround);
  return Math.min(bookingCap, untilHard);
}

/** Package ids the booking form will accept for this column at this minute. */
export function packageIdsForSlot({
  column,
  dayWindow,
  minute,
}: {
  column: ScheduleColumn;
  dayWindow: ScheduleDayWindow | null;
  minute: number;
}): number[] {
  if (column.roomId == null) {
    const entry = packagesForColumn(column, dayWindow)[0];
    return entry ? [entry.package_id] : [];
  }
  const candidates = (dayWindow?.packages ?? []).map((entry) => ({
    packageId: entry.package_id,
    roomIds: entry.room_ids,
    openMinutes: entry.open_minutes,
    closeMinutes: entry.close_minutes,
    closedRanges: (entry.closed_ranges ?? []).map((r) => ({
      startMinutes: r.start_minutes,
      endMinutes: r.end_minutes,
    })),
  }));
  return packagesValidForSlot(candidates, column.roomId, minute);
}

/** Every start time offered anywhere in this column today, ascending. */
export function columnStarts(
  column: ScheduleColumn,
  dayWindow: ScheduleDayWindow | null,
): number[] {
  const starts = new Set<number>();
  for (const entry of packagesForColumn(column, dayWindow)) {
    for (const start of entry.start_minutes ?? []) starts.add(start);
  }
  return [...starts].sort((a, b) => a - b);
}

/** The starts of just the packages bookable at `minute`. */
function startsForSlot({
  column,
  dayWindow,
  minute,
}: {
  column: ScheduleColumn;
  dayWindow: ScheduleDayWindow | null;
  minute: number;
}): number[] {
  const ids = new Set(packageIdsForSlot({ column, dayWindow, minute }));
  const starts = new Set<number>();
  for (const entry of dayWindow?.packages ?? []) {
    if (!ids.has(entry.package_id)) continue;
    for (const start of entry.start_minutes ?? []) starts.add(start);
  }
  return [...starts].sort((a, b) => a - b);
}

/** The shortest package that can start at `minute` here, in minutes. */
function shortestDurationAt({
  column,
  dayWindow,
  minute,
}: {
  column: ScheduleColumn;
  dayWindow: ScheduleDayWindow | null;
  minute: number;
}): { minutes: number | null; name: string | null } {
  const ids = new Set(packageIdsForSlot({ column, dayWindow, minute }));
  const shortest = (dayWindow?.packages ?? [])
    .filter(
      (entry) =>
        ids.has(entry.package_id) && (entry.duration_minutes ?? 0) > 0,
    )
    .sort((a, b) => (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0))[0];
  return {
    minutes: shortest?.duration_minutes ?? null,
    name: shortest?.name ?? null,
  };
}

/**
 * Auto-select a package only when one really starts at this minute — anything
 * else arrives at the booking form as a time it goes on to refuse. The wider
 * list still travels, so staff can pick.
 */
function packageOfferFor({
  column,
  dayWindow,
  minute,
}: {
  column: ScheduleColumn;
  dayWindow: ScheduleDayWindow | null;
  minute: number;
}): { ids: number[]; autoSelect: number | null } {
  const ids = packageIdsForSlot({ column, dayWindow, minute });
  const offering = ids.filter((id) => {
    const entry = (dayWindow?.packages ?? []).find((p) => p.package_id === id);
    return entry?.start_minutes ? entry.start_minutes.includes(minute) : true;
  });
  const lone = offering.length === 1 ? offering[0] : null;
  return {
    ids,
    autoSelect: lone ?? (offering.length === 0 && ids.length === 1 ? ids[0] : null),
  };
}

/**
 * The minute a tap means. A future day snaps to a real offered start, because
 * that is the grid the customer is sold; today snaps to five minutes instead —
 * a walk-in starts when the guests actually walk in, and 4:05 is a perfectly
 * good start for staff even when no package offers it.
 *
 * Returns null when the tap can find no start at all: the column is booked out
 * from here to closing, or nothing short enough is left to fit before it
 * closes. Never a minute the grid already knows is blocked.
 */
export function resolveSlotMinute({
  column,
  schedule,
  dayWindow,
  blocked,
  rawMinute,
  isToday,
  nowMinutes,
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  blocked: TimeRange[];
  rawMinute: number;
  isToday: boolean;
  nowMinutes: number;
}): number | null {
  const { open, close, interval } = schedule;
  if (open == null || close == null || close <= open) return null;

  const floor = isToday
    ? snapToInterval(Math.max(open, nowMinutes), WALK_IN_SNAP_MINUTES, open)
    : open;

  // A booking still has to finish before the space closes, so the last start
  // is a whole package back from closing — not one snapping step back.
  const probe = Math.min(Math.max(rawMinute, open), close - 1);
  const shortest = shortestDurationAt({ column, dayWindow, minute: probe }).minutes;
  const latestStart = Math.max(
    open,
    close - (shortest ?? WALK_IN_SNAP_MINUTES),
  );
  if (floor > latestStart) return null;

  const offered = startsForSlot({ column, dayWindow, minute: probe }).filter(
    (start) => start >= floor && start <= latestStart,
  );
  const onGrid =
    !isToday && offered.length > 0
      ? snapToOfferedStart(offered, rawMinute, floor)
      : null;

  const snapped =
    onGrid ??
    (isToday
      ? Math.max(
          snapToInterval(rawMinute, WALK_IN_SNAP_MINUTES),
          snapToInterval(nowMinutes, WALK_IN_SNAP_MINUTES),
        )
      : snapToInterval(rawMinute, interval, floor));

  const clamped = Math.min(Math.max(snapped, floor), latestStart);
  const free = nextFreeMinute(open, close, blocked, clamped);
  if (free === null) return null;
  if (free === clamped) return clamped;

  // The tap landed on a booking, a break or a closure — walk forward to the
  // first start that is genuinely free rather than handing back a blocked one.
  const freeOffered =
    onGrid === null
      ? undefined
      : offered.find(
          (start) =>
            start >= free &&
            nextFreeMinute(open, close, blocked, start) === start,
        );
  const fromFree =
    freeOffered ??
    snapToInterval(free, isToday ? WALK_IN_SNAP_MINUTES : interval, free);

  return fromFree > latestStart ? null : fromFree;
}

/** Everything the booking form needs to open on the tapped slot. */
export type SlotTap = {
  minute: number;
  packageId: number | null;
  packageIds: number[];
  freeUntilMinute: number | null;
  walkIn: boolean;
  locationId: number | null;
};

export function resolveSlotTap({
  column,
  schedule,
  dayWindow,
  occupancy,
  hardBlocks,
  rawMinute,
  isToday,
  nowMinutes,
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  rawMinute: number;
  isToday: boolean;
  nowMinutes: number;
}): SlotTap | null {
  if (!schedule.bookable) return null;

  const blocked = blockedRangesFor(occupancy, hardBlocks);
  const minute = resolveSlotMinute({
    column,
    schedule,
    dayWindow,
    blocked,
    rawMinute,
    isToday,
    nowMinutes,
  });
  if (minute === null) return null;

  const { ids, autoSelect } = packageOfferFor({ column, dayWindow, minute });

  return {
    minute,
    packageId: autoSelect,
    packageIds: ids,
    freeUntilMinute: usableFreeUntil({
      schedule,
      occupancy,
      hardBlocks,
      minute,
    }),
    // A start off the customer's own grid is staff's call, so the form has to
    // be told to keep it rather than round it away.
    walkIn: isToday || !columnStarts(column, dayWindow).includes(minute),
    locationId: schedule.locationId,
  };
}

/**
 * The next minute staff can actually START a booking here — not merely the
 * next unoccupied minute. A start counts only when the space is free at it and
 * a package that runs then still fits before the next booking; otherwise the
 * header would advertise a time the booking form goes on to refuse.
 */
export function nextBookableFrom({
  column,
  schedule,
  dayWindow,
  occupancy,
  hardBlocks,
  atMinute,
  isToday,
  nowMinutes,
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  atMinute: number;
  isToday: boolean;
  nowMinutes: number;
}): number | null {
  const { open, close } = schedule;
  if (open == null || close == null) return null;
  const blocked = blockedRangesFor(occupancy, hardBlocks);

  for (const start of columnStarts(column, dayWindow)) {
    if (start < atMinute) continue;
    // A start that has gone by is still drawn, but it is never the NEXT one.
    if (isToday && start < nowMinutes) continue;
    if (nextFreeMinute(open, close, blocked, start) !== start) continue;

    const shortest = shortestDurationAt({
      column,
      dayWindow,
      minute: start,
    }).minutes;
    if (shortest === null) continue;

    const until = usableFreeUntil({ schedule, occupancy, hardBlocks, minute: start });
    if (until !== null && start + shortest > until) continue;

    return start;
  }

  return null;
}

/** Whether a walk-in starting now would fit before whatever is next. */
export function walkInFit({
  column,
  schedule,
  dayWindow,
  occupancy,
  hardBlocks,
  nowMinutes,
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  nowMinutes: number;
}): { fits: boolean; freeFor: number; shortest: number | null } {
  const until = usableFreeUntil({
    schedule,
    occupancy,
    hardBlocks,
    minute: nowMinutes,
  });
  const freeFor = Math.max(0, (until ?? schedule.close ?? nowMinutes) - nowMinutes);
  const shortest = shortestDurationAt({
    column,
    dayWindow,
    minute: nowMinutes,
  }).minutes;

  return { fits: shortest !== null && shortest <= freeFor, freeFor, shortest };
}

/** What one column header says under the space's name. */
export type ColumnStatus =
  | { kind: "closed"; reason: string }
  | { kind: "booked" }
  | { kind: "blocked"; reason: string }
  | { kind: "day-over" }
  | { kind: "walk-in"; fits: boolean; freeFor: number }
  | { kind: "free"; atMinute: number }
  | { kind: "no-starts" };

export function columnStatusFor({
  column,
  schedule,
  dayWindow,
  occupancy,
  hardBlocks,
  isToday,
  nowMinutes,
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  isToday: boolean;
  nowMinutes: number;
}): ColumnStatus {
  if (!schedule.windowKnown) {
    return { kind: "closed", reason: "Schedule unavailable" };
  }

  const from = isToday ? nowMinutes : (schedule.open ?? 0);
  const state = freeState(
    schedule.open,
    schedule.close,
    blockedRangesFor(occupancy, hardBlocks),
    from,
    schedule.bookable,
  );

  switch (state.kind) {
    case "closed":
      return { kind: "closed", reason: schedule.reason ?? "Not bookable" };
    case "booked":
      return { kind: "booked" };
    case "blocked":
      return { kind: "blocked", reason: state.reason };
    case "day-over":
      return { kind: "day-over" };
    case "free":
      break;
  }

  if (isToday && state.atMinute <= nowMinutes) {
    const fit = walkInFit({
      column,
      schedule,
      dayWindow,
      occupancy,
      hardBlocks,
      nowMinutes,
    });
    return { kind: "walk-in", fits: fit.fits, freeFor: fit.freeFor };
  }

  const next = nextBookableFrom({
    column,
    schedule,
    dayWindow,
    occupancy,
    hardBlocks,
    atMinute: state.atMinute,
    isToday,
    nowMinutes,
  });
  return next === null ? { kind: "no-starts" } : { kind: "free", atMinute: next };
}
