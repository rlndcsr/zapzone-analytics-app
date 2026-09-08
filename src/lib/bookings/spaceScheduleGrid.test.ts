import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ScheduleBooking } from "../../services/bookingsService.ts";
import {
  assignLanes,
  buildColumns,
  closureBoundaryMinutes,
  closureLabel,
  columnKeyFor,
  computeCategoryOptions,
  computeDaySummary,
  computeSpaceClosures,
  computeTimeWindow,
  hourMarks,
  minutesToLabel,
  nowLineTop,
  positionBookingsByColumn,
  timeToMinutes,
  type PositionedBooking,
  type ScheduleColumn,
} from "./spaceScheduleGrid.ts";

let nextId = 1;
function makeBooking(
  overrides: Partial<ScheduleBooking> = {},
): ScheduleBooking {
  return {
    id: nextId++,
    roomId: null,
    packageId: null,
    packageCategory: "",
    referenceNumber: `REF${nextId}`,
    status: "confirmed",
    time: "10:00",
    durationMinutes: 60,
    participants: 2,
    totalAmount: 100,
    amountPaid: 100,
    paymentStatus: "paid",
    packageName: "Test Package",
    customerName: "Jane Doe",
    ...overrides,
  };
}

describe("timeToMinutes / minutesToLabel", () => {
  it("parses HH:MM into minutes since midnight", () => {
    assert.equal(timeToMinutes("10:30"), 630);
    assert.equal(timeToMinutes("00:00"), 0);
    assert.equal(timeToMinutes(null), 0);
    assert.equal(timeToMinutes(""), 0);
  });

  it("formats minutes back into a 12-hour label, dropping :00", () => {
    assert.equal(minutesToLabel(600), "10 AM");
    assert.equal(minutesToLabel(630), "10:30 AM");
    assert.equal(minutesToLabel(0), "12 AM");
    assert.equal(minutesToLabel(12 * 60), "12 PM");
    assert.equal(minutesToLabel(13 * 60 + 5), "1:05 PM");
  });
});

describe("columnKeyFor — roomless routing", () => {
  const knownRoomIds = new Set([1, 2]);

  it("routes to the room column when the room is known", () => {
    assert.equal(
      columnKeyFor({ roomId: 1, packageId: 5 }, knownRoomIds),
      "room-1",
    );
  });

  it("routes a booking with an unknown room to its package's virtual column", () => {
    assert.equal(
      columnKeyFor({ roomId: 999, packageId: 5 }, knownRoomIds),
      "pkg-5",
    );
  });

  it("routes a booking with no room at all to its package's virtual column", () => {
    assert.equal(
      columnKeyFor({ roomId: null, packageId: 5 }, knownRoomIds),
      "pkg-5",
    );
  });

  it("falls back to a single 'unassigned' column with neither a room nor a package", () => {
    assert.equal(
      columnKeyFor({ roomId: null, packageId: null }, knownRoomIds),
      "unassigned",
    );
  });
});

describe("buildColumns", () => {
  const spaces = [
    { id: 1, name: "Room A", capacity: 10 },
    { id: 2, name: "Room B", capacity: 20 },
  ];
  const knownRoomIds = new Set([1, 2]);

  it("shows every space when hideEmptySpaces is false, even with no bookings", () => {
    const columns = buildColumns({
      spaces,
      bookings: [],
      hideEmptySpaces: false,
      knownRoomIds,
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ["room-1", "room-2"],
    );
  });

  it("hides an empty space when hideEmptySpaces is true", () => {
    const bookings = [{ roomId: 1, packageId: null, packageName: "Party" }];
    const columns = buildColumns({
      spaces,
      bookings,
      hideEmptySpaces: true,
      knownRoomIds,
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ["room-1"],
    );
  });

  it("adds a virtual column for a roomless booking, unaffected by hideEmptySpaces", () => {
    const bookings = [{ roomId: null, packageId: 7, packageName: "Laser Tag" }];
    const columns = buildColumns({
      spaces,
      bookings,
      hideEmptySpaces: true,
      knownRoomIds,
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ["pkg-7"],
    );
    const virtual = columns.find((c) => c.key === "pkg-7")!;
    assert.equal(virtual.virtual, true);
    assert.equal(virtual.name, "Laser Tag");
    assert.equal(virtual.roomId, null);
  });

  it("groups multiple roomless bookings sharing a package into one virtual column", () => {
    const bookings = [
      { roomId: null, packageId: 7, packageName: "Laser Tag" },
      { roomId: null, packageId: 7, packageName: "Laser Tag" },
    ];
    const columns = buildColumns({
      spaces,
      bookings,
      hideEmptySpaces: false,
      knownRoomIds,
    });
    assert.equal(columns.filter((c) => c.key === "pkg-7").length, 1);
  });

  it("sorts virtual columns alphabetically after the real room columns", () => {
    const bookings = [
      { roomId: null, packageId: 9, packageName: "Zebra Party" },
      { roomId: null, packageId: 8, packageName: "Ant Party" },
    ];
    const columns = buildColumns({
      spaces,
      bookings,
      hideEmptySpaces: false,
      knownRoomIds,
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ["room-1", "room-2", "pkg-8", "pkg-9"],
    );
  });

  it("never drops a roomless booking with no package into the void", () => {
    const bookings = [{ roomId: null, packageId: null, packageName: "" }];
    const columns = buildColumns({
      spaces,
      bookings,
      hideEmptySpaces: true,
      knownRoomIds,
    });
    assert.deepEqual(
      columns.map((c) => c.key),
      ["unassigned"],
    );
  });
});

describe("assignLanes — overlap handling", () => {
  const pb = (id: number, top: number, height: number): PositionedBooking => ({
    booking: makeBooking({ id }),
    startMin: 0,
    endMin: 0,
    top,
    height,
    lane: 0,
    laneCount: 1,
    clipped: false,
  });

  it("gives non-overlapping bookings their own single lane each", () => {
    const result = assignLanes([pb(1, 0, 60), pb(2, 60, 60)]);
    assert.deepEqual(
      result.map((r) => [r.lane, r.laneCount]),
      [
        [0, 1],
        [0, 1],
      ],
    );
  });

  it("splits two overlapping bookings into two lanes", () => {
    const result = assignLanes([pb(1, 0, 60), pb(2, 30, 60)]);
    const byId = new Map(result.map((r) => [r.booking.id, r]));
    assert.equal(byId.get(1)!.lane, 0);
    assert.equal(byId.get(2)!.lane, 1);
    assert.equal(byId.get(1)!.laneCount, 2);
    assert.equal(byId.get(2)!.laneCount, 2);
  });

  it("splits three mutually-overlapping bookings into three lanes", () => {
    const result = assignLanes([pb(1, 0, 90), pb(2, 10, 90), pb(3, 20, 90)]);
    const lanes = result.map((r) => r.lane).sort();
    assert.deepEqual(lanes, [0, 1, 2]);
    assert.ok(result.every((r) => r.laneCount === 3));
  });

  it("resets lanes between two separate (non-touching) clusters", () => {
    const result = assignLanes([pb(1, 0, 60), pb(2, 30, 60), pb(3, 200, 30)]);
    const byId = new Map(result.map((r) => [r.booking.id, r]));
    assert.equal(byId.get(3)!.lane, 0);
    assert.equal(byId.get(3)!.laneCount, 1);
  });

  it("reuses a freed lane once an earlier item in the cluster has ended", () => {
    const result = assignLanes([pb(1, 0, 30), pb(2, 10, 90), pb(3, 40, 30)]);
    const byId = new Map(result.map((r) => [r.booking.id, r]));
    assert.equal(byId.get(1)!.lane, 0);
    assert.equal(byId.get(2)!.lane, 1);
    assert.equal(byId.get(3)!.lane, 0);
    assert.ok(result.every((r) => r.laneCount === 2));
  });

  it("is a pure function — does not mutate its input array or items", () => {
    const input = [pb(1, 0, 60), pb(2, 30, 60)];
    const snapshot = JSON.stringify(input);
    assignLanes(input);
    assert.equal(JSON.stringify(input), snapshot);
  });
});

describe("positionBookingsByColumn", () => {
  const columns: ScheduleColumn[] = [
    { key: "room-1", name: "Room A", capacity: 10, roomId: 1, virtual: false },
  ];
  const knownRoomIds = new Set([1]);
  const window = { start: 9 * 60, end: 17 * 60, total: 8 * 60 };

  it("positions a booking at the right pixel offset for the window and zoom", () => {
    const bookings = [
      makeBooking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 60 }),
    ];
    const map = positionBookingsByColumn({
      columns,
      bookings,
      timeWindow: window,
      pxPerMinute: 2,
      knownRoomIds,
    });
    const [placed] = map.get("room-1")!;
    assert.equal(placed.top, (10 * 60 - window.start) * 2);
    assert.equal(placed.height, 60 * 2 - 2);
    assert.equal(placed.clipped, false);
  });

  it("floors a very short booking's placement duration at 15 minutes", () => {
    const bookings = [
      makeBooking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 5 }),
    ];
    const map = positionBookingsByColumn({
      columns,
      bookings,
      timeWindow: window,
      pxPerMinute: 1,
      knownRoomIds,
    });
    const [placed] = map.get("room-1")!;
    assert.equal(placed.endMin - placed.startMin, 15);
  });

  it("never renders a block shorter than 24px even at low zoom", () => {
    const bookings = [
      makeBooking({ id: 1, roomId: 1, time: "10:00", durationMinutes: 15 }),
    ];
    const map = positionBookingsByColumn({
      columns,
      bookings,
      timeWindow: window,
      pxPerMinute: 0.5,
      knownRoomIds,
    });
    const [placed] = map.get("room-1")!;
    assert.equal(placed.height, 24);
  });

  it("clips a booking that runs past the visible window and flags it", () => {
    const bookings = [
      makeBooking({ id: 1, roomId: 1, time: "16:30", durationMinutes: 120 }),
    ];
    const map = positionBookingsByColumn({
      columns,
      bookings,
      timeWindow: window,
      pxPerMinute: 1,
      knownRoomIds,
    });
    const [placed] = map.get("room-1")!;
    assert.equal(placed.clipped, true);
    assert.equal(placed.endMin, window.end);
  });

  it("drops a booking whose resolved column key has no matching column into no column at all", () => {
    // Package 99 has no column (e.g. filtered out) — the booking is simply absent, not crashing.
    const bookings = [makeBooking({ id: 1, roomId: null, packageId: 99 })];
    const map = positionBookingsByColumn({
      columns,
      bookings,
      timeWindow: window,
      pxPerMinute: 1,
      knownRoomIds,
    });
    assert.equal(map.get("room-1")!.length, 0);
  });
});

describe("computeTimeWindow", () => {
  it("pads an hour before the earliest and after the latest, rounded to the hour", () => {
    const w = computeTimeWindow({
      bookingRanges: [{ start: 9 * 60 + 15, end: 10 * 60 }],
      breakRanges: [],
      closureBoundaries: [],
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(w.start, 8 * 60); // floor(9:15 to hour) - 60 = 9:00 - 60 = 8:00
    assert.equal(w.end, 11 * 60); // ceil(10:00 to hour) + 60 = 10:00 + 60 = 11:00
  });

  it("falls back to a 10am-10pm default extent (then padded like any other window) when there is nothing to place", () => {
    const w = computeTimeWindow({
      bookingRanges: [],
      breakRanges: [],
      closureBoundaries: [],
      isToday: false,
      nowMinutes: 0,
    });
    // The same ±60min hour-padding applies to the fallback extent as to real data.
    assert.equal(w.start, 9 * 60);
    assert.equal(w.end, 23 * 60);
  });

  it("folds 'now' into the window on today so it's never out of view", () => {
    const w = computeTimeWindow({
      bookingRanges: [{ start: 9 * 60, end: 10 * 60 }],
      breakRanges: [],
      closureBoundaries: [],
      isToday: true,
      nowMinutes: 23 * 60,
    });
    assert.ok(w.end >= 23 * 60);
  });

  it("ignores 'now' when a different day is selected", () => {
    const w = computeTimeWindow({
      bookingRanges: [{ start: 9 * 60, end: 10 * 60 }],
      breakRanges: [],
      closureBoundaries: [],
      isToday: false,
      nowMinutes: 23 * 60,
    });
    assert.ok(w.end < 23 * 60);
  });

  it("only ever widens relative to the previous window for the same date/location", () => {
    const first = computeTimeWindow({
      bookingRanges: [{ start: 9 * 60, end: 10 * 60 }],
      breakRanges: [],
      closureBoundaries: [],
      isToday: false,
      nowMinutes: 0,
    });
    // the window must not shrink back.
    const second = computeTimeWindow({
      bookingRanges: [{ start: 11 * 60, end: 12 * 60 }],
      breakRanges: [],
      closureBoundaries: [],
      isToday: false,
      nowMinutes: 0,
      prevWindow: first,
    });
    assert.equal(second.start, first.start);
    assert.ok(second.end >= first.end);
  });

  it("clamps to the [0, 24h] day boundary", () => {
    const w = computeTimeWindow({
      bookingRanges: [{ start: 0, end: 30 }],
      breakRanges: [{ start: 23 * 60 + 30, end: 24 * 60 }],
      closureBoundaries: [],
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(w.start, 0);
    assert.equal(w.end, 24 * 60);
  });
});

describe("hourMarks / nowLineTop", () => {
  const window = { start: 9 * 60, end: 12 * 60, total: 3 * 60 };

  it("lists every hour mark from window start to end inclusive", () => {
    assert.deepEqual(hourMarks(window), [540, 600, 660, 720]);
  });

  it("places the now-line at the right pixel offset when today and in-window", () => {
    assert.equal(nowLineTop(10 * 60, window, 2, true), (10 * 60 - 9 * 60) * 2);
  });

  it("is null when a different day is selected", () => {
    assert.equal(nowLineTop(10 * 60, window, 2, false), null);
  });

  it("is null when now falls outside the visible window", () => {
    assert.equal(nowLineTop(8 * 60, window, 2, true), null);
    assert.equal(nowLineTop(13 * 60, window, 2, true), null);
  });
});

describe("computeCategoryOptions", () => {
  const identity = (s: string) => s;

  it("counts and sorts distinct categories alphabetically", () => {
    const bookings = [
      { packageCategory: "Escape Rooms" },
      { packageCategory: "Bowling" },
      { packageCategory: "Escape Rooms" },
    ];
    const options = computeCategoryOptions(bookings, identity);
    assert.deepEqual(options, [
      { value: "Bowling", label: "Bowling", count: 1 },
      { value: "Escape Rooms", label: "Escape Rooms", count: 2 },
    ]);
  });

  it("groups a blank category under the uncategorised label", () => {
    const options = computeCategoryOptions([{ packageCategory: "" }], identity);
    assert.deepEqual(options, [
      { value: "No category", label: "No category", count: 1 },
    ]);
  });

  it("groups by the caller's normalized value, not the raw string", () => {
    const upper = (s: string) => s.toUpperCase();
    const options = computeCategoryOptions(
      [{ packageCategory: "bowling" }, { packageCategory: "BOWLING" }],
      upper,
    );
    assert.deepEqual(options, [
      { value: "BOWLING", label: "BOWLING", count: 2 },
    ]);
  });
});

describe("computeDaySummary", () => {
  const knownRoomIds = new Set([1]);

  it("sums participants and counts unassigned bookings", () => {
    const bookings = [
      { roomId: 1, participants: 4 },
      { roomId: null, participants: 2 },
      { roomId: 999, participants: 1 }, // room not known on this screen → unassigned too
    ];
    const summary = computeDaySummary(bookings, knownRoomIds);
    assert.deepEqual(summary, { count: 3, guests: 7, unassigned: 2 });
  });

  it("is all zero for no bookings", () => {
    assert.deepEqual(computeDaySummary([], knownRoomIds), {
      count: 0,
      guests: 0,
      unassigned: 0,
    });
  });
});

describe("computeSpaceClosures", () => {
  const selectedDate = new Date(2026, 8, 15); // Sept 15, 2026

  it("applies a location-wide, exact-date, full-day closure to every space", () => {
    const dayOffs = [
      {
        date: "2026-09-15",
        isRecurring: false,
        timeStart: null,
        timeEnd: null,
        isLocationWide: true,
        roomIds: [],
      },
    ];
    const map = computeSpaceClosures({
      dayOffs,
      selectedDate,
      spaceIds: [1, 2],
    });
    assert.equal(map.get(1)?.fullDay, true);
    assert.equal(map.get(2)?.fullDay, true);
  });

  it("applies a room-scoped closure only to its own room", () => {
    const dayOffs = [
      {
        date: "2026-09-15",
        isRecurring: false,
        timeStart: null,
        timeEnd: null,
        isLocationWide: false,
        roomIds: [1],
      },
    ];
    const map = computeSpaceClosures({
      dayOffs,
      selectedDate,
      spaceIds: [1, 2],
    });
    assert.ok(map.has(1));
    assert.ok(!map.has(2));
  });

  it("matches a recurring closure by month+day regardless of year", () => {
    const dayOffs = [
      {
        date: "2020-09-15",
        isRecurring: true,
        timeStart: null,
        timeEnd: null,
        isLocationWide: true,
        roomIds: [],
      },
    ];
    const map = computeSpaceClosures({ dayOffs, selectedDate, spaceIds: [1] });
    assert.ok(map.has(1));
  });

  it("does not match a non-recurring closure from a different year", () => {
    const dayOffs = [
      {
        date: "2020-09-15",
        isRecurring: false,
        timeStart: null,
        timeEnd: null,
        isLocationWide: true,
        roomIds: [],
      },
    ];
    const map = computeSpaceClosures({ dayOffs, selectedDate, spaceIds: [1] });
    assert.ok(!map.has(1));
  });

  it("records partial-time ranges instead of a full-day closure", () => {
    const dayOffs = [
      {
        date: "2026-09-15",
        isRecurring: false,
        timeStart: "09:00",
        timeEnd: "11:00",
        isLocationWide: true,
        roomIds: [],
      },
    ];
    const map = computeSpaceClosures({ dayOffs, selectedDate, spaceIds: [1] });
    assert.equal(map.get(1)?.fullDay, false);
    assert.deepEqual(map.get(1)?.ranges, [
      { timeStart: "09:00", timeEnd: "11:00" },
    ]);
  });

  it("ignores a day-off that applies to a different date entirely", () => {
    const dayOffs = [
      {
        date: "2026-09-16",
        isRecurring: false,
        timeStart: null,
        timeEnd: null,
        isLocationWide: true,
        roomIds: [],
      },
    ];
    const map = computeSpaceClosures({ dayOffs, selectedDate, spaceIds: [1] });
    assert.equal(map.size, 0);
  });
});

describe("closureBoundaryMinutes / closureLabel", () => {
  it("contributes no boundaries for a full-day closure", () => {
    assert.deepEqual(closureBoundaryMinutes({ fullDay: true, ranges: [] }), []);
  });

  it("contributes both endpoints of a partial-range closure", () => {
    const boundaries = closureBoundaryMinutes({
      fullDay: false,
      ranges: [{ timeStart: "09:00", timeEnd: "11:00" }],
    });
    assert.deepEqual(boundaries, [540, 660]);
  });

  it("labels a full-day closure plainly", () => {
    assert.equal(closureLabel({ fullDay: true, ranges: [] }), "Closed all day");
  });

  it("labels a bounded range with both times", () => {
    assert.equal(
      closureLabel({
        fullDay: false,
        ranges: [{ timeStart: "09:00", timeEnd: "11:00" }],
      }),
      "Closed 9 AM–11 AM",
    );
  });

  it("labels an open-ended 'closes early' range", () => {
    assert.equal(
      closureLabel({
        fullDay: false,
        ranges: [{ timeStart: "17:00", timeEnd: null }],
      }),
      "Closed after 5 PM",
    );
  });

  it("labels a 'delayed opening' range", () => {
    assert.equal(
      closureLabel({
        fullDay: false,
        ranges: [{ timeStart: null, timeEnd: "09:00" }],
      }),
      "Closed until 9 AM",
    );
  });

  it("is null when there is no closure at all", () => {
    assert.equal(closureLabel(undefined), null);
  });
});
