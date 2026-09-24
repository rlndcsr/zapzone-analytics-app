import { conflictsWith } from "../bookings/freeTime.ts";
import { cellSpanHeight, guaranteedExtraLines } from "../bookings/bookingCell.ts";
import {
  guestNoteOf,
  staffNoteOf,
  type NotedBooking,
} from "../bookings/bookingNotes.ts";
import type { StretchSpan } from "../bookings/minuteScale.ts";
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
  start: number;
  end: number;
  slots: number;
};

export type TimedItem = {
  time: string | null;
  durationMinutes: number;
};

/** Snap a minute-of-day down / up to a slot boundary. */
const floorSlot = (mins: number) =>
  Math.floor(mins / SLOT_MINUTES) * SLOT_MINUTES;
const ceilSlot = (mins: number) =>
  Math.ceil(mins / SLOT_MINUTES) * SLOT_MINUTES;

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

/** The whole slots a block is drawn across, in minutes of the day. */
export function placementMinutes(
  placement: Pick<SlotPlacement<unknown>, "slotIndex" | "slotSpan">,
  window: Pick<SlotWindow, "start">,
): { from: number; to: number } {
  const from = window.start + placement.slotIndex * SLOT_MINUTES;
  return { from, to: from + placement.slotSpan * SLOT_MINUTES };
}

/** What a day-grid block gives up to its slots: a 2px margin above and below. */
export const DAY_BLOCK_INSET = 4;

/** The slots each drawn booking covers, each asking for room for its four lines and its extras. */
export function placementStretchSpans<T extends NotedBooking>(
  byColumn: ReadonlyMap<string, readonly SlotPlacement<T>[]>,
  window: Pick<SlotWindow, "start">,
): StretchSpan[] {
  const spans: StretchSpan[] = [];
  for (const placements of byColumn.values()) {
    for (const placement of placements) {
      const { from, to } = placementMinutes(placement, window);
      const lines = guaranteedExtraLines({
        clashing: placement.conflicts.length > 0,
        staffNote: staffNoteOf(placement.item),
        guestNote: guestNoteOf(placement.item),
      });
      spans.push({
        startMinutes: from,
        endMinutes: to,
        minHeight: cellSpanHeight(lines, DAY_BLOCK_INSET),
      });
    }
  }
  return spans;
}

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
