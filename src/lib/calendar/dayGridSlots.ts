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

export const OCCUPYING_STATUSES = new Set([
  "confirmed",
  "checked-in",
  "pending",
]);

const FALLBACK_INTERVAL = 15;

export type ColumnSchedule = {
  open: number | null;
  close: number | null;
  closedAllDay: boolean;
  bookable: boolean;
  windowKnown: boolean;
  reason: string | null;
  turnaround: number;
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
    return dayWindow.packages.filter((p) =>
      p.room_ids.includes(column.roomId!),
    );
  }
  const packageId = Number(column.key.replace("pkg-", ""));
  if (!Number.isInteger(packageId) || packageId <= 0) return [];
  return dayWindow.packages.filter((p) => p.package_id === packageId);
};

const toRanges = (
  ranges: {
    start_minutes: number;
    end_minutes: number;
    reason: string | null;
  }[] = [],
): TimeRange[] =>
  ranges.map((r) => ({
    startMinutes: r.start_minutes,
    endMinutes: r.end_minutes,
    reason: r.reason ?? "Closed",
  }));

export const packageIntervalFor = (
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
    const interval = packageIntervalFor(column, dayWindow);

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
    if (!schedule) continue;
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

export function usableFreeUntil({
  schedule,
  occupancy,
  hardBlocks,
  minute,
}: {
  schedule: Pick<ColumnSchedule, "open" | "close" | "turnaround">;
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
    untilBooking >= close
      ? untilBooking
      : Math.max(minute, untilBooking - turnaround);
  return Math.min(bookingCap, untilHard);
}

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
      (entry) => ids.has(entry.package_id) && (entry.duration_minutes ?? 0) > 0,
    )
    .sort((a, b) => (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0))[0];
  return {
    minutes: shortest?.duration_minutes ?? null,
    name: shortest?.name ?? null,
  };
}

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
    autoSelect:
      lone ?? (offering.length === 0 && ids.length === 1 ? ids[0] : null),
  };
}

export function resolveSlotMinute({
  column,
  schedule,
  dayWindow,
  blocked,
  rawMinute,
}: {
  column: ScheduleColumn;
  schedule: Pick<ColumnSchedule, "open" | "close" | "interval">;
  dayWindow: ScheduleDayWindow | null;
  blocked: TimeRange[];
  rawMinute: number;
}): number | null {
  const { open, close, interval } = schedule;
  if (open == null || close == null || close <= open) return null;

  const probe = Math.min(Math.max(rawMinute, open), close - 1);
  const shortest = shortestDurationAt({
    column,
    dayWindow,
    minute: probe,
  }).minutes;
  const latestStart = Math.max(
    open,
    close - (shortest ?? WALK_IN_SNAP_MINUTES),
  );

  // Every start the space's own packages offer today, not just whichever
  // package happens to be active at this one minute — including ones earlier
  // than now, so clicking an already-passed start records it rather than
  // snapping forward to the next one.
  const offered = columnStarts(column, dayWindow).filter(
    (start) => start >= open && start <= latestStart,
  );
  const onGrid =
    offered.length > 0 ? snapToOfferedStart(offered, rawMinute, open) : null;
  const snapped = onGrid ?? snapToInterval(rawMinute, interval, open);

  const clamped = Math.min(Math.max(snapped, open), latestStart);
  const free = nextFreeMinute(open, close, blocked, clamped);
  if (free === null) return null;
  if (free === clamped) return clamped;

  const freeOffered =
    onGrid === null
      ? undefined
      : offered.find(
          (start) =>
            start >= free &&
            nextFreeMinute(open, close, blocked, start) === start,
        );
  const fromFree = freeOffered ?? snapToInterval(free, interval, free);

  return fromFree > latestStart ? null : fromFree;
}

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
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  rawMinute: number;
  isToday: boolean;
}): SlotTap | null {
  if (!schedule.bookable) return null;

  const blocked = blockedRangesFor(occupancy, hardBlocks);
  const minute = resolveSlotMinute({
    column,
    schedule,
    dayWindow,
    blocked,
    rawMinute,
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

    walkIn: isToday || !columnStarts(column, dayWindow).includes(minute),
    locationId: schedule.locationId,
  };
}

/**
 * A walk-in starts at the minute the guests are actually standing there, not
 * at one of the package's own start times — so it deliberately skips the
 * snapping every other tap goes through. The header only offers it while the
 * space is free now; how long that lasts travels with `freeUntilMinute`, and
 * the booking form is the one that refuses a package too long to fit it.
 */
export function resolveWalkInTap({
  column,
  schedule,
  dayWindow,
  occupancy,
  hardBlocks,
  minute,
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  minute: number;
}): SlotTap | null {
  if (!schedule.bookable) return null;

  const { open, close } = schedule;
  if (open == null || close == null) return null;
  // Past closing there is no walk-in left to start, and before opening the
  // space is not this screen's to hand out.
  if (minute < open || minute >= close) return null;

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
    walkIn: true,
    locationId: schedule.locationId,
  };
}

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
  schedule: Pick<ColumnSchedule, "open" | "close" | "turnaround">;
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

    const until = usableFreeUntil({
      schedule,
      occupancy,
      hardBlocks,
      minute: start,
    });
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
}): {
  fits: boolean;
  freeFor: number;
  shortest: number | null;
  packageName: string | null;
} {
  const until = usableFreeUntil({
    schedule,
    occupancy,
    hardBlocks,
    minute: nowMinutes,
  });
  const freeFor = Math.max(
    0,
    (until ?? schedule.close ?? nowMinutes) - nowMinutes,
  );
  const shortestEntry = shortestDurationAt({
    column,
    dayWindow,
    minute: nowMinutes,
  });
  const shortest = shortestEntry.minutes;

  return {
    fits: shortest !== null && shortest <= freeFor,
    freeFor,
    shortest,
    packageName: shortestEntry.name,
  };
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
  return next === null
    ? { kind: "no-starts" }
    : { kind: "free", atMinute: next };
}
