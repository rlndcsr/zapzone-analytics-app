// Slot geometry for the Calendar tab's Day and Week grids.
//
// The Day grid lays spaces out as columns and 15-minute slots as rows, the same
// model the Space Schedule uses — so it reuses that screen's `buildColumns` /
// `columnKeyFor` and only adds the slot-based placement the timeline doesn't
// need. The Week grid is the transpose: one column per weekday, one row per
// distinct start time in the week.

import { conflictsWith } from "../bookings/freeTime.ts";
import {
  columnKeyFor,
  timeToMinutes,
  type ScheduleColumn,
} from "../bookings/spaceScheduleGrid.ts";

export const SLOT_MINUTES = 15;
export const MIN_PX_PER_MINUTE = 3;

export function daySlotHeight(slotMinutes: number, base: number): number {
  return Math.max(
    base,
    Math.ceil(MIN_PX_PER_MINUTE * Math.max(5, slotMinutes)),
  );
}

/** The window shown when the day holds nothing to size the grid around. */
const FALLBACK_START = 10 * 60;
const FALLBACK_END = 22 * 60;

export type SlotWindow = {
  /** Minutes past midnight at the top of the first row. */
  start: number;
  /** Minutes past midnight at the bottom of the last row. */
  end: number;
  /** How many rows that spans. */
  slots: number;
};

/** Anything the grids can place: a start time and a length. */
export type TimedItem = {
  time: string | null;
  durationMinutes: number;
};

/** Snap a minute-of-day down / up to a slot boundary. */
const floorSlot = (mins: number) =>
  Math.floor(mins / SLOT_MINUTES) * SLOT_MINUTES;
const ceilSlot = (mins: number) =>
  Math.ceil(mins / SLOT_MINUTES) * SLOT_MINUTES;

/**
 * The slot window that just contains `items` — snapped outwards to whole slots
 * and clamped to the day. An empty day falls back to a plain 10am–10pm frame so
 * the grid still has a shape to draw.
 *
 * `bounds` widens it to the day's operating window as well, so a space that is
 * open but unbooked still draws — and can be tapped — across the hours it is
 * actually free, rather than only around whatever happens to be booked.
 */
export function computeSlotWindow(
  items: TimedItem[],
  bounds?: { start: number | null; end: number | null },
): SlotWindow {
  let earliest = Infinity;
  let latest = -Infinity;
  if (bounds?.start != null && Number.isFinite(bounds.start)) {
    earliest = bounds.start;
  }
  if (bounds?.end != null && Number.isFinite(bounds.end)) {
    latest = bounds.end;
  }
  for (const item of items) {
    const start = timeToMinutes(item.time);
    const end = start + Math.max(SLOT_MINUTES, item.durationMinutes);
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return {
      start: FALLBACK_START,
      end: FALLBACK_END,
      slots: (FALLBACK_END - FALLBACK_START) / SLOT_MINUTES,
    };
  }
  const start = Math.max(0, floorSlot(earliest));
  const end = Math.min(
    24 * 60,
    Math.max(ceilSlot(latest), start + SLOT_MINUTES),
  );
  return { start, end, slots: (end - start) / SLOT_MINUTES };
}

export type ItemClash<T> = { item: T; overlapMinutes: number };

export type SlotPlacement<T> = {
  item: T;
  startMin: number;
  endMin: number;
  endMinRaw: number;
  slotIndex: number;
  slotSpan: number;
  lane: number;
  laneCount: number;
  clipped: boolean;
  conflicts: ItemClash<T>[];
};

export function assignSlotLanes<T>(
  items: SlotPlacement<T>[],
): SlotPlacement<T>[] {
  const list = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );
  let clusterStart = 0;
  let clusterMaxEnd = -Infinity;
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

export function placeByColumn<
  T extends TimedItem & {
    id: number;
    roomId: number | null;
    packageId: number | null;
  },
>({
  columns,
  items,
  window,
  knownRoomIds,
  activeItems = items,
  turnaroundFor = () => 0,
}: {
  columns: ScheduleColumn[];
  items: T[];
  window: SlotWindow;
  knownRoomIds: ReadonlySet<number>;
  activeItems?: T[];
  turnaroundFor?: (column: ScheduleColumn) => number;
}): Map<string, SlotPlacement<T>[]> {
  const map = new Map<string, SlotPlacement<T>[]>();
  for (const column of columns) map.set(column.key, []);

  for (const item of items) {
    const list = map.get(columnKeyFor(item, knownRoomIds));
    if (!list) continue; // Its column is hidden — e.g. empty spaces are off.
    const startMin = timeToMinutes(item.time);
    const rawEnd = startMin + Math.max(SLOT_MINUTES, item.durationMinutes);
    const endMin = Math.min(window.end, rawEnd);
    const slotIndex = Math.max(
      0,
      (floorSlot(startMin) - window.start) / SLOT_MINUTES,
    );
    list.push({
      item,
      startMin,
      endMin,
      endMinRaw: rawEnd,
      slotIndex,
      slotSpan: Math.max(
        1,
        (ceilSlot(endMin) - floorSlot(startMin)) / SLOT_MINUTES,
      ),
      lane: 0,
      laneCount: 1,
      clipped: rawEnd > window.end,
      conflicts: [],
    });
  }

  for (const column of columns) {
    const list = map.get(column.key);
    if (!list) continue;
    map.set(column.key, assignSlotLanes(list));

    const turnaround = turnaroundFor(column);
    const neighbours = activeItems
      .filter((it) => columnKeyFor(it, knownRoomIds) === column.key)
      .map((it) => {
        const start = timeToMinutes(it.time);
        return {
          id: it.id,
          startMinutes: start,
          endMinutes: start + Math.max(SLOT_MINUTES, it.durationMinutes),
          turnaroundMinutes: turnaround,
          item: it,
        };
      });

    for (const placement of map.get(column.key)!) {
      placement.conflicts = conflictsWith(
        {
          id: placement.item.id,
          startMinutes: placement.startMin,
          endMinutes: placement.endMinRaw,
          turnaroundMinutes: turnaround,
          item: placement.item,
        },
        neighbours,
      ).map((clash) => ({
        item: clash.occupant.item,
        overlapMinutes: clash.overlapMinutes,
      }));
    }
  }
  return map;
}

export function distinctStartMinutes(
  items: readonly Pick<TimedItem, "time">[],
): number[] {
  const seen = new Set<number>();
  for (const item of items) seen.add(timeToMinutes(item.time));
  return [...seen].sort((a, b) => a - b);
}
