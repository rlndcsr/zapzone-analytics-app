import type { ScheduleBooking } from "../../services/bookingsService";
import type { DayOff } from "../../services/dayOffsService";
import { cellSpanHeight, guaranteedExtraLines } from "./bookingCell.ts";
import { guestNoteOf, staffNoteOf } from "./bookingNotes.ts";
import { conflictsWith } from "./freeTime.ts";
import type { MinuteScale, StretchSpan } from "./minuteScale.ts";

// even the tightest zoom has to leave a short booking room for its details rather than cut them
export const ZOOM_LEVELS = [2.4, 3.6, 5.2] as const;
export const DEFAULT_ZOOM_INDEX = 1;

/** A booking is placed as at least this long, however short it is. */
const MIN_PLACED_MINUTES = 15;

/** The minutes each booking occupies, each asking for room for its four lines and its extras. */
export function bookingStretchSpans(
  arranged: ReadonlyMap<string, readonly ArrangedBooking[]>,
): StretchSpan[] {
  const spans: StretchSpan[] = [];
  for (const list of arranged.values()) {
    for (const item of list) {
      const lines = guaranteedExtraLines({
        clashing: item.conflicts.length > 0,
        staffNote: staffNoteOf(item.booking),
        guestNote: guestNoteOf(item.booking),
      });
      spans.push({
        startMinutes: item.startMin,
        endMinutes: item.endMin,
        // room for the border too, since whether it shows changes with the clock
        minHeight: cellSpanHeight(lines, BLOCK_GAP + 2 * BLOCK_BORDER),
      });
    }
  }
  return spans;
}

export const UNCATEGORIZED_LABEL = "No category";

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToLabel(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = ((mins % 60) + 60) % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return m === 0
    ? `${h} ${ampm}`
    : `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/* --------------------------------------------------------------- columns -- */

export type ScheduleColumn = {
  key: string;
  name: string;
  capacity: number | null;
  /** Null for a virtual (roomless) column. */
  roomId: number | null;
  virtual: boolean;
};

export function columnKeyFor(
  booking: Pick<ScheduleBooking, "roomId" | "packageId">,
  knownRoomIds: ReadonlySet<number>,
): string {
  if (booking.roomId != null && knownRoomIds.has(booking.roomId)) {
    return `room-${booking.roomId}`;
  }
  return booking.packageId != null ? `pkg-${booking.packageId}` : "unassigned";
}

export function buildColumns({
  spaces,
  bookings,
  hideEmptySpaces,
  knownRoomIds,
}: {
  spaces: { id: number; name: string; capacity: number | null }[];
  bookings: Pick<ScheduleBooking, "roomId" | "packageId" | "packageName">[];
  hideEmptySpaces: boolean;
  knownRoomIds: ReadonlySet<number>;
}): ScheduleColumn[] {
  const roomBookingCount = new Map<number, number>();
  for (const b of bookings) {
    if (b.roomId != null && knownRoomIds.has(b.roomId)) {
      roomBookingCount.set(b.roomId, (roomBookingCount.get(b.roomId) ?? 0) + 1);
    }
  }
  const roomColumns: ScheduleColumn[] = spaces
    .filter((s) => !hideEmptySpaces || (roomBookingCount.get(s.id) ?? 0) > 0)
    .map((s) => ({
      key: `room-${s.id}`,
      name: s.name,
      capacity: s.capacity,
      roomId: s.id,
      virtual: false,
    }));

  const virtualMap = new Map<string, ScheduleColumn>();
  for (const b of bookings) {
    const key = columnKeyFor(b, knownRoomIds);
    if (key.startsWith("room-")) continue;
    if (!virtualMap.has(key)) {
      virtualMap.set(key, {
        key,
        name: b.packageName?.trim() || "Unassigned",
        capacity: null,
        roomId: null,
        virtual: true,
      });
    }
  }
  const virtualColumns = [...virtualMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return [...roomColumns, ...virtualColumns];
}

/** Whether the columns on screen span more than one venue, virtual columns included. */
export function columnsSpanVenues(
  locationIds: Iterable<number | null | undefined>,
): boolean {
  const ids = new Set<number>();
  for (const id of locationIds) if (id != null) ids.add(id);
  return ids.size > 1;
}

/* ------------------------------------------------------------- placement -- */

/** A real overlap is a double booking; zero minutes means only the turnaround is missing. */
export type BookingClash = { booking: ScheduleBooking; overlapMinutes: number };

/** A booking in its column, in minutes — its lane and clashes, before the day's scale exists. */
export type ArrangedBooking = {
  booking: ScheduleBooking;
  startMin: number;
  endMin: number;
  /** Unclamped end — the visible-window clip must never shrink a conflict. */
  endMinRaw: number;
  lane: number;
  laneCount: number;
  clipped: boolean;
  conflicts: BookingClash[];
};

export type PositionedBooking = ArrangedBooking & { top: number; height: number };

/** The gap left under each block, so it never touches the one below. */
export const BLOCK_GAP = 2;
/** The highlight border a block wears while clashing, running or awaiting check-in. */
export const BLOCK_BORDER = 2;
/** A turnaround strip at least this tall says when the space is free again. */
export const TURNAROUND_LABEL_MIN_HEIGHT = 12;

/** Lanes are worked out in minutes: a block's height depends on what it says, known only after the scale. */
export function assignLanes<T extends ArrangedBooking>(items: T[]): T[] {
  const list = [...items].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      b.endMin - a.endMin ||
      a.booking.id - b.booking.id,
  );
  let clusterStart = 0;
  let clusterMaxEnd = -1;
  let laneEnds: number[] = [];
  const finishCluster = (end: number) => {
    const laneCount = Math.max(1, laneEnds.length);
    for (let i = clusterStart; i < end; i++)
      list[i] = { ...list[i], laneCount };
  };
  list.forEach((item, index) => {
    if (index > 0 && item.startMin >= clusterMaxEnd) {
      finishCluster(index);
      clusterStart = index;
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = item.endMin;
    list[index] = { ...item, lane };
    clusterMaxEnd = Math.max(clusterMaxEnd, item.endMin);
  });
  finishCluster(list.length);
  return list;
}

type ArrangeArgs = {
  columns: ScheduleColumn[];
  bookings: ScheduleBooking[];
  timeWindow: TimeWindow;
  knownRoomIds: ReadonlySet<number>;
  /** Every live booking, unfiltered — a booking a filter hides can still clash. */
  activeBookings?: ScheduleBooking[];
  turnaroundFor?: (column: ScheduleColumn) => number;
};

/** Put each block on the day's scale, every column reading the same mapping. */
export function placeOnScale(
  arranged: ReadonlyMap<string, readonly ArrangedBooking[]>,
  scale: MinuteScale,
): Map<string, PositionedBooking[]> {
  const map = new Map<string, PositionedBooking[]>();
  for (const [key, list] of arranged) {
    map.set(
      key,
      list.map((item) => ({
        ...item,
        top: scale.at(item.startMin),
        height: Math.max(
          24,
          scale.spanHeight(item.startMin, item.endMin) - BLOCK_GAP,
        ),
      })),
    );
  }
  return map;
}

export function positionBookingsByColumn({
  scale,
  ...args
}: ArrangeArgs & { scale: MinuteScale }): Map<string, PositionedBooking[]> {
  return placeOnScale(arrangeBookingsByColumn(args), scale);
}

export function arrangeBookingsByColumn({
  columns,
  bookings,
  timeWindow,
  knownRoomIds,
  activeBookings = bookings,
  turnaroundFor = () => 0,
}: ArrangeArgs): Map<string, ArrangedBooking[]> {
  const map = new Map<string, ArrangedBooking[]>();
  for (const c of columns) map.set(c.key, []);
  for (const b of bookings) {
    const key = columnKeyFor(b, knownRoomIds);
    const list = map.get(key);
    if (!list) continue;
    const startMin = timeToMinutes(b.time);
    const rawEnd = startMin + Math.max(MIN_PLACED_MINUTES, b.durationMinutes);
    const endMin = Math.min(timeWindow.end, rawEnd);
    list.push({
      booking: b,
      startMin,
      endMin,
      endMinRaw: rawEnd,
      lane: 0,
      laneCount: 1,
      clipped: rawEnd > timeWindow.end,
      conflicts: [],
    });
  }
  for (const column of columns) {
    const list = map.get(column.key);
    if (!list) continue;
    map.set(column.key, assignLanes(list));

    const turnaround = turnaroundFor(column);
    const neighbours = activeBookings
      .filter((b) => columnKeyFor(b, knownRoomIds) === column.key)
      .map((b) => {
        const start = timeToMinutes(b.time);
        return {
          id: b.id,
          startMinutes: start,
          endMinutes: start + Math.max(15, b.durationMinutes),
          turnaroundMinutes: turnaround,
          booking: b,
        };
      });

    for (const item of map.get(column.key)!) {
      item.conflicts = conflictsWith(
        {
          id: item.booking.id,
          startMinutes: item.startMin,
          endMinutes: item.endMinRaw,
          turnaroundMinutes: turnaround,
          booking: item.booking,
        },
        neighbours,
      ).map((clash) => ({
        booking: clash.occupant.booking,
        overlapMinutes: clash.overlapMinutes,
      }));
    }
  }
  return map;
}

/* ---------------------------------------------------------------- window -- */

export type TimeWindow = { start: number; end: number; total: number };

export function computeTimeWindow({
  bookingRanges,
  breakRanges,
  closureBoundaries,
  isToday,
  nowMinutes,
  prevWindow,
}: {
  bookingRanges: { start: number; end: number }[];
  breakRanges: { start: number; end: number }[];
  closureBoundaries: number[];
  isToday: boolean;
  nowMinutes: number;
  prevWindow?: TimeWindow | null;
}): TimeWindow {
  let earliest = Infinity;
  let latest = -Infinity;
  for (const r of [...bookingRanges, ...breakRanges]) {
    if (r.start < earliest) earliest = r.start;
    if (r.end > latest) latest = r.end;
  }
  for (const t of closureBoundaries) {
    if (t < earliest) earliest = t;
    if (t > latest) latest = t;
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    earliest = 10 * 60;
    latest = 22 * 60;
  }
  if (isToday) {
    if (nowMinutes < earliest) earliest = nowMinutes;
    if (nowMinutes > latest) latest = nowMinutes;
  }
  let start = Math.max(0, Math.floor(earliest / 60) * 60 - 60);
  let end = Math.min(24 * 60, Math.ceil(latest / 60) * 60 + 60);
  if (prevWindow) {
    start = Math.min(start, prevWindow.start);
    end = Math.max(end, prevWindow.end);
  }
  return { start, end, total: end - start };
}

/** Hour marks (on the hour, inclusive of both ends) for the time-axis gutter. */
export function hourMarks(window: TimeWindow): number[] {
  const marks: number[] = [];
  for (let m = window.start; m <= window.end; m += 60) marks.push(m);
  return marks;
}

export function nowLineTop(
  nowMinutes: number,
  window: TimeWindow,
  scale: MinuteScale,
  isToday: boolean,
): number | null {
  if (!isToday || nowMinutes < window.start || nowMinutes > window.end)
    return null;
  return scale.at(nowMinutes);
}

/* -------------------------------------------------------------- filters -- */

export type CategoryOption = { value: string; label: string; count: number };

export function computeCategoryOptions(
  bookings: Pick<ScheduleBooking, "packageCategory">[],
  normalize: (raw: string) => string,
): CategoryOption[] {
  const counts = new Map<string, number>();
  for (const b of bookings) {
    const key = normalize(b.packageCategory) || UNCATEGORIZED_LABEL;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
    )
    .map(([value, count]) => ({ value, label: value, count }));
}

export type DaySummary = { count: number; guests: number; unassigned: number };

/** Bookings shown, total guests across them, and how many have no room. */
export function computeDaySummary(
  bookings: Pick<ScheduleBooking, "roomId" | "participants">[],
  knownRoomIds: ReadonlySet<number>,
): DaySummary {
  const guests = bookings.reduce(
    (sum, b) => sum + (Number(b.participants) || 0),
    0,
  );
  const unassigned = bookings.filter(
    (b) => b.roomId == null || !knownRoomIds.has(b.roomId),
  ).length;
  return { count: bookings.length, guests, unassigned };
}

/* -------------------------------------------------------------- closures -- */

export type SpaceClosure = {
  fullDay: boolean;
  ranges: { timeStart: string | null; timeEnd: string | null }[];
};

export function computeSpaceClosures({
  dayOffs,
  selectedDate,
  spaceIds,
}: {
  dayOffs: Pick<
    DayOff,
    | "date"
    | "isRecurring"
    | "timeStart"
    | "timeEnd"
    | "isLocationWide"
    | "roomIds"
  >[];
  selectedDate: Date;
  spaceIds: number[];
}): Map<number, SpaceClosure> {
  const map = new Map<number, SpaceClosure>();
  const selY = selectedDate.getFullYear();
  const selM = selectedDate.getMonth(); // 0-based
  const selD = selectedDate.getDate();

  const relevant = dayOffs.filter((d) => {
    const [y, m, day] = d.date.split("-").map(Number);
    if (!y || !m || !day) return false;
    const exact = y === selY && m - 1 === selM && day === selD;
    const recurring = d.isRecurring && m - 1 === selM && day === selD;
    return exact || recurring;
  });

  for (const spaceId of spaceIds) {
    const forSpace = relevant.filter(
      (d) => d.isLocationWide || d.roomIds.includes(spaceId),
    );
    if (forSpace.length === 0) continue;
    const fullDay = forSpace.some((d) => !d.timeStart && !d.timeEnd);
    const ranges = forSpace
      .filter((d) => d.timeStart || d.timeEnd)
      .map((d) => ({ timeStart: d.timeStart, timeEnd: d.timeEnd }));
    map.set(spaceId, { fullDay, ranges });
  }
  return map;
}

export function closureBoundaryMinutes(
  closure: SpaceClosure | undefined,
): number[] {
  if (!closure || closure.fullDay) return [];
  const out: number[] = [];
  for (const r of closure.ranges) {
    if (r.timeStart) out.push(timeToMinutes(r.timeStart));
    if (r.timeEnd) out.push(timeToMinutes(r.timeEnd));
  }
  return out;
}

/** Human label for a closure — "Closed all day" or the specific window(s). */
export function closureLabel(closure: SpaceClosure | undefined): string | null {
  if (!closure) return null;
  if (closure.fullDay) return "Closed all day";
  const parts = closure.ranges
    .map((r) => {
      if (r.timeStart && r.timeEnd)
        return `${minutesToLabel(timeToMinutes(r.timeStart))}–${minutesToLabel(timeToMinutes(r.timeEnd))}`;
      if (r.timeStart)
        return `after ${minutesToLabel(timeToMinutes(r.timeStart))}`;
      if (r.timeEnd) return `until ${minutesToLabel(timeToMinutes(r.timeEnd))}`;
      return "";
    })
    .filter(Boolean);
  return parts.length ? `Closed ${parts.join(", ")}` : "Closed";
}
