import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildColumns } from "../bookings/spaceScheduleGrid.ts";
import {
  assignSlotLanes,
  computeSlotWindow,
  distinctStartMinutes,
  placeByColumn,
  SLOT_MINUTES,
  type SlotPlacement,
} from "./dayGrid.ts";

const booking = (
  over: Partial<{
    id: number;
    roomId: number | null;
    packageId: number | null;
    packageName: string;
    time: string | null;
    durationMinutes: number;
  }> = {},
) => ({
  id: 1,
  roomId: null,
  packageId: null,
  packageName: "Airlock",
  time: "17:30",
  durationMinutes: 60,
  ...over,
});

describe("the slot window a day's grid is drawn in", () => {
  it("snaps outwards to whole slots around the day's bookings", () => {
    const window = computeSlotWindow([
      booking({ time: "17:35", durationMinutes: 50 }),
    ]);
    assert.equal(window.start, 17 * 60 + 30);
    assert.equal(window.end, 18 * 60 + 30);
    assert.equal(window.slots, 4);
  });

  it("spans from the earliest start to the latest end", () => {
    const window = computeSlotWindow([
      booking({ time: "17:30", durationMinutes: 60 }),
      booking({ time: "09:00", durationMinutes: 30 }),
      booking({ time: "12:00", durationMinutes: 240 }),
    ]);
    assert.equal(window.start, 9 * 60);
    assert.equal(window.end, 18 * 60 + 30);
  });

  it("falls back to a plain daytime frame when nothing is booked", () => {
    const window = computeSlotWindow([]);
    assert.equal(window.start, 10 * 60);
    assert.equal(window.end, 22 * 60);
    assert.equal(window.slots, 48);
  });

  it("spans the day's operating hours even when nothing is booked", () => {
    const window = computeSlotWindow([], { start: 16 * 60, end: 20 * 60 });
    assert.equal(window.start, 16 * 60);
    assert.equal(window.end, 20 * 60);
  });

  it("covers the operating hours and the bookings together", () => {
    const window = computeSlotWindow(
      [booking({ time: "21:00", durationMinutes: 120 })],
      { start: 16 * 60, end: 20 * 60 },
    );
    assert.equal(window.start, 16 * 60);
    assert.equal(window.end, 23 * 60);
  });

  it("ignores operating hours it was not given", () => {
    const window = computeSlotWindow([booking({ time: "17:00" })], {
      start: null,
      end: null,
    });
    assert.equal(window.start, 17 * 60);
    assert.equal(window.end, 18 * 60);
  });

  it("never gives a zero-height window to a booking with no duration", () => {
    const window = computeSlotWindow([booking({ time: "17:00", durationMinutes: 0 })]);
    assert.equal(window.end - window.start, SLOT_MINUTES);
  });
});

describe("placing a day's bookings into their space columns", () => {
  const spaces = [
    { id: 1, name: "Airlock", capacity: 8 },
    { id: 2, name: "Bank Heist", capacity: 6 },
  ];
  const knownRoomIds = new Set([1, 2]);

  it("puts a booking in its room's column and a roomless one in its own", () => {
    const items = [
      booking({ id: 1, roomId: 1 }),
      booking({ id: 2, roomId: null, packageId: 7, packageName: "Airlock" }),
    ];
    const columns = buildColumns({
      spaces,
      bookings: items,
      hideEmptySpaces: false,
      knownRoomIds,
    });
    const placed = placeByColumn({
      columns,
      items,
      window: computeSlotWindow(items),
      knownRoomIds,
    });
    assert.deepEqual(
      placed.get("room-1")?.map((p) => p.item.id),
      [1],
    );
    assert.deepEqual(placed.get("room-2"), []);
    assert.deepEqual(
      placed.get("pkg-7")?.map((p) => p.item.id),
      [2],
    );
  });

  it("measures a booking's position and height in whole slots", () => {
    const items = [booking({ id: 1, roomId: 1, time: "18:00", durationMinutes: 90 })];
    const window = computeSlotWindow([
      ...items,
      booking({ id: 9, time: "17:00", durationMinutes: 15 }),
    ]);
    const placed = placeByColumn({
      columns: buildColumns({ spaces, bookings: items, hideEmptySpaces: false, knownRoomIds }),
      items,
      window,
      knownRoomIds,
    });
    const [entry] = placed.get("room-1")!;
    assert.equal(window.start, 17 * 60);
    assert.equal(entry.slotIndex, 4); // 17:00 → 18:00 is four slots down.
    assert.equal(entry.slotSpan, 6); // 90 minutes is six slots tall.
    assert.equal(entry.clipped, false);
  });

  it("drops bookings whose column is hidden rather than misplacing them", () => {
    const items = [booking({ id: 1, roomId: 1 })];
    const columns = buildColumns({
      spaces,
      bookings: items,
      hideEmptySpaces: true,
      knownRoomIds,
    });
    const placed = placeByColumn({
      columns,
      items,
      window: computeSlotWindow(items),
      knownRoomIds,
    });
    assert.deepEqual([...placed.keys()], ["room-1"]);
    assert.equal(placed.get("room-1")?.length, 1);
  });

  it("marks a booking that runs past the bottom of the window as clipped", () => {
    const items = [booking({ id: 1, roomId: 1, time: "23:30", durationMinutes: 120 })];
    const placed = placeByColumn({
      columns: buildColumns({ spaces, bookings: items, hideEmptySpaces: false, knownRoomIds }),
      items,
      window: { start: 23 * 60, end: 24 * 60, slots: 4 },
      knownRoomIds,
    });
    const [entry] = placed.get("room-1")!;
    assert.equal(entry.clipped, true);
    assert.equal(entry.endMin, 24 * 60);
  });

  it("flags two directly overlapping bookings as a true double booking, with the overlap minutes", () => {
    const items = [
      booking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 60 }),
      booking({ id: 2, roomId: 1, time: "10:30", durationMinutes: 60 }),
    ];
    const placed = placeByColumn({
      columns: buildColumns({ spaces, bookings: items, hideEmptySpaces: false, knownRoomIds }),
      items,
      window: computeSlotWindow(items),
      knownRoomIds,
    });
    const [a, b] = placed.get("room-1")!;
    assert.deepEqual(a.conflicts.map((c) => c.item.id), [2]);
    assert.equal(a.conflicts[0].overlapMinutes, 30);
    assert.deepEqual(b.conflicts.map((c) => c.item.id), [1]);
    assert.equal(b.conflicts[0].overlapMinutes, 30);
  });

  it("flags a clash that only exists inside the turnaround gap as zero-minute — a missing reset, not a double booking", () => {
    const items = [
      booking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 60 }),
      booking({ id: 2, roomId: 1, time: "11:10", durationMinutes: 60 }),
    ];
    const placed = placeByColumn({
      columns: buildColumns({ spaces, bookings: items, hideEmptySpaces: false, knownRoomIds }),
      items,
      window: computeSlotWindow(items),
      knownRoomIds,
      turnaroundFor: () => 15,
    });
    const [a, b] = placed.get("room-1")!;
    assert.deepEqual(a.conflicts.map((c) => c.item.id), [2]);
    assert.equal(a.conflicts[0].overlapMinutes, 0);
    assert.deepEqual(b.conflicts.map((c) => c.item.id), [1]);
    assert.equal(b.conflicts[0].overlapMinutes, 0);
  });

  it("does not invent a clash for back-to-back bookings when the space needs no turnaround at all", () => {
    // A roomless package gets no turnaround from the server, so consecutive
    // games must never be flagged as double-booked.
    const items = [
      booking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 60 }),
      booking({ id: 2, roomId: 1, time: "11:00", durationMinutes: 60 }),
    ];
    const placed = placeByColumn({
      columns: buildColumns({ spaces, bookings: items, hideEmptySpaces: false, knownRoomIds }),
      items,
      window: computeSlotWindow(items),
      knownRoomIds,
      turnaroundFor: () => 0,
    });
    const [a, b] = placed.get("room-1")!;
    assert.deepEqual(a.conflicts, []);
    assert.deepEqual(b.conflicts, []);
  });

  it("still finds a conflict against a booking a display filter has hidden", () => {
    const shown = booking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 60 });
    const hidden = booking({ id: 2, roomId: 1, time: "10:30", durationMinutes: 60 });
    const placed = placeByColumn({
      columns: buildColumns({ spaces, bookings: [shown], hideEmptySpaces: false, knownRoomIds }),
      items: [shown],
      activeItems: [shown, hidden],
      window: computeSlotWindow([shown]),
      knownRoomIds,
    });
    const [a] = placed.get("room-1")!;
    assert.deepEqual(a.conflicts.map((c) => c.item.id), [2]);
  });
});

describe("laning bookings that clash in one column", () => {
  const place = (
    id: number,
    startMin: number,
    endMin: number,
  ): SlotPlacement<{ id: number }> => ({
    item: { id },
    startMin,
    endMin,
    endMinRaw: endMin,
    slotIndex: 0,
    slotSpan: 1,
    lane: 0,
    laneCount: 1,
    clipped: false,
    conflicts: [],
  });

  it("splits two overlapping bookings into two lanes", () => {
    const laned = assignSlotLanes([
      place(1, 600, 660),
      place(2, 630, 690),
    ]);
    assert.deepEqual(
      laned.map((p) => [p.item.id, p.lane, p.laneCount]),
      [
        [1, 0, 2],
        [2, 1, 2],
      ],
    );
  });

  it("leaves back-to-back bookings full width in the same lane", () => {
    const laned = assignSlotLanes([
      place(1, 600, 660),
      place(2, 660, 720),
    ]);
    assert.deepEqual(
      laned.map((p) => [p.item.id, p.lane, p.laneCount]),
      [
        [1, 0, 1],
        [2, 0, 1],
      ],
    );
  });
});

describe("the rows of the week grid", () => {
  it("is every distinct start time, ascending and de-duplicated", () => {
    assert.deepEqual(
      distinctStartMinutes([
        booking({ time: "14:00" }),
        booking({ time: "09:30" }),
        booking({ time: "14:00" }),
      ]),
      [9 * 60 + 30, 14 * 60],
    );
  });

  it("folds bookings with no time into a single midnight row", () => {
    assert.deepEqual(distinctStartMinutes([booking({ time: null })]), [0]);
  });
});
