import type {
  ScheduleDayWindow,
  SchedulePackageWindow,
} from "../../services/scheduleWindowService";
import {
  freeState,
  freeUntilMinute,
  nextFreeMinute,
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

export type ColumnSchedule = {
  open: number | null;
  close: number | null;
  closedAllDay: boolean;
  bookable: boolean;
  windowKnown: boolean;
  reason: string | null;
  turnaround: number;
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

/**
 * The next booking's own start after `minute`, never reduced by turnaround —
 * a walk-in overlap is measured against when the next group actually shows
 * up, not against the space's own reset buffer.
 */
export function nextBookingMinuteFrom({
  occupancy,
  minute,
}: {
  occupancy: TimeRange[];
  minute: number;
}): number | null {
  const starts = occupancy
    .filter((range) => range.endMinutes > minute)
    .map((range) => range.startMinutes);
  return starts.length > 0 ? Math.min(...starts) : null;
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

/**
 * The minute a tap on the schedule means.
 *
 * A package's interval is the CUSTOMER's grid — 4:00, 5:00, 6:00 for an hourly
 * package. Staff are not held to it: a walk-in starts when the guests actually
 * walk in, so a tap here lands on a 5-minute grid and 4:05 or 4:10 is an
 * ordinary start. The minute travels to the booking form as tapped, never
 * snapped forward to the next start a customer would have been offered.
 *
 * Null when there is no start left here at all: booked out to closing, or too
 * late for the shortest package to finish before the space shuts.
 */
export function resolveSlotMinute({
  column,
  schedule,
  dayWindow,
  blocked,
  rawMinute,
}: {
  column: ScheduleColumn;
  schedule: Pick<ColumnSchedule, "open" | "close">;
  dayWindow: ScheduleDayWindow | null;
  blocked: TimeRange[];
  rawMinute: number;
}): number | null {
  const { open, close } = schedule;
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

  const onFive = (minute: number) =>
    Math.round(minute / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES;
  const earliest = Math.ceil(open / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES;
  const latest = Math.max(
    earliest,
    Math.floor(latestStart / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES,
  );
  const snapped = Math.min(Math.max(onFive(rawMinute), earliest), latest);

  // only move off the tapped minute if it landed inside something already booked
  const free = nextFreeMinute(open, close, blocked, snapped);
  if (free === null) return null;
  if (free === snapped) return snapped;

  const fromFree = Math.ceil(free / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES;

  return fromFree > latestStart ? null : fromFree;
}

export type SlotTap = {
  minute: number;
  packageId: number | null;
  packageIds: number[];
  freeUntilMinute: number | null;
  nextBookingMinute: number | null;
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
    nextBookingMinute: nextBookingMinuteFrom({ occupancy, minute }),

    // the customer grid does not contain 4:05, so the booking form has to be
    // told to keep the minute instead of hunting for an offered start
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
    nextBookingMinute: nextBookingMinuteFrom({ occupancy, minute }),
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

/** The least a booking has to say for the area-stagger rule to be applied to it. */
export type StaggerBooking = {
  roomId: number | null;
  time: string | null;
};

/**
 * Spaces in one area group have to start far enough apart for staff to run both, and the server
 * refuses a booking that does not. The schedule has to know about it too, or staff are only told
 * after the click — by a refusal they could have been warned about before it.
 *
 * `bookings` is the day's occupying bookings across EVERY space, never the filtered list: the
 * clash is with a neighbour, which a category or search filter may well be hiding.
 *
 * The group is exactly the one the server builds (`roomIdsSharingStagger`): every space at THIS
 * venue carrying the same area name, this one included. Two venues may both call an area "Arena"
 * without their bookings having anything to do with each other.
 */
export function areaStaggerClash<B extends StaggerBooking>({
  column,
  dayWindow,
  bookings,
  minute,
}: {
  column: ScheduleColumn;
  dayWindow: ScheduleDayWindow | null;
  bookings: readonly B[];
  minute: number;
}): B | null {
  if (column.roomId == null) return null;

  const rooms = dayWindow?.rooms ?? [];
  const space = rooms.find((room) => room.room_id === column.roomId);
  const gap = space?.stagger_minutes ?? 0;

  if (!space?.area_group || gap <= 0) return null;

  const peers = new Set(
    rooms
      .filter(
        (room) =>
          room.area_group === space.area_group &&
          room.location_id === space.location_id,
      )
      .map((room) => room.room_id),
  );

  return (
    bookings.find(
      (booking) =>
        booking.roomId != null &&
        peers.has(booking.roomId) &&
        Math.abs(timeToMinutes(booking.time) - minute) < gap,
    ) ?? null
  );
}

/** Whether a walk-in starting now would fit before whatever is next. */
export function walkInFit<B extends StaggerBooking>({
  column,
  schedule,
  dayWindow,
  occupancy,
  hardBlocks,
  nowMinutes,
  bookings = [],
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  nowMinutes: number;
  /** The day's occupying bookings in every space, for the area-stagger rule. */
  bookings?: readonly B[];
}): {
  fits: boolean;
  freeFor: number;
  shortest: number | null;
  packageName: string | null;
  /** The neighbouring booking this walk-in would start too close to, if any. */
  areaClash: B | null;
  /** Packages do run here now, but every one of them would still be running at closing. */
  blockedByClose: boolean;
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

  const ids = new Set(packageIdsForSlot({ column, dayWindow, minute: nowMinutes }));
  const running = (dayWindow?.packages ?? []).filter(
    (entry) => ids.has(entry.package_id) && (entry.duration_minutes ?? 0) > 0,
  );
  const candidates = running
    // it must finish inside its OWN schedule — a room stays "open" only because a later package is
    .filter((entry) => nowMinutes + (entry.duration_minutes as number) <= entry.close_minutes)
    .sort((a, b) => (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0));
  const shortestEntry = candidates[0];
  // something runs here, but nothing short enough to finish before it closes
  const blockedByClose = running.length > 0 && candidates.length === 0;

  // measured at the minute a walk-in would actually be recorded at, not the raw clock
  const walkInMinute =
    Math.floor(nowMinutes / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES;
  const areaClash = areaStaggerClash({
    column,
    dayWindow,
    bookings,
    minute: walkInMinute,
  });

  return {
    fits:
      shortestEntry !== undefined &&
      (shortestEntry.duration_minutes as number) <= freeFor &&
      areaClash === null,
    freeFor,
    shortest: shortestEntry?.duration_minutes ?? null,
    packageName: shortestEntry?.name ?? null,
    areaClash,
    blockedByClose,
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
  bookings = [],
}: {
  column: ScheduleColumn;
  schedule: ColumnSchedule;
  dayWindow: ScheduleDayWindow | null;
  occupancy: TimeRange[];
  hardBlocks: TimeRange[];
  isToday: boolean;
  nowMinutes: number;
  /** The day's occupying bookings in every space, so the header agrees with the walk-in prompt. */
  bookings?: readonly StaggerBooking[];
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
      bookings,
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
