import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ScheduleDayWindow,
  SchedulePackageWindow,
  ScheduleRoomWindow,
} from "../../services/scheduleWindowService.ts";
import type { ScheduleColumn } from "../bookings/spaceScheduleGrid.ts";
import {
  buildColumnSchedules,
  buildOccupancy,
  columnStatusFor,
  hardBlocksFor,
  nextBookableFrom,
  packageIntervalFor,
  resolveSlotTap,
  resolveWalkInTap,
  usableFreeUntil,
} from "./dayGridSlots.ts";

const AT = (hour: number, minute = 0) => hour * 60 + minute;

const room = (over: Partial<ScheduleRoomWindow> = {}): ScheduleRoomWindow => ({
  room_id: 1,
  location_id: 3,
  interval_minutes: 15,
  open_minutes: AT(16),
  close_minutes: AT(20),
  closed_all_day: false,
  closed_ranges: [],
  bookable: true,
  reason: null,
  ...over,
});

const pkg = (
  over: Partial<SchedulePackageWindow> = {},
): SchedulePackageWindow => ({
  package_id: 7,
  name: "Escape Room",
  location_id: 3,
  open_minutes: AT(16),
  close_minutes: AT(20),
  interval_minutes: 60,
  duration_minutes: 60,
  start_minutes: [AT(16), AT(17), AT(18), AT(19)],
  closed_ranges: [],
  room_ids: [1],
  ...over,
});

const window = (over: Partial<ScheduleDayWindow> = {}): ScheduleDayWindow => ({
  date: "2026-09-17",
  weekday: "thursday",
  location_id: 3,
  open_minutes: AT(16),
  close_minutes: AT(20),
  interval_minutes: 60,
  has_schedule: true,
  location_closed: false,
  rooms: [room()],
  packages: [pkg()],
  ...over,
});

const airlock: ScheduleColumn = {
  key: "room-1",
  name: "Airlock",
  capacity: 8,
  roomId: 1,
  virtual: false,
};

const booking = (
  time: string,
  durationMinutes = 60,
  over: { roomId?: number | null; packageId?: number | null } = {},
) => ({
  time,
  durationMinutes,
  roomId: 1,
  packageId: 7,
  ...over,
});

/** The whole per-column setup, the way the screen assembles it. */
const setup = (
  dayWindow: ScheduleDayWindow | null,
  bookings: ReturnType<typeof booking>[] = [],
  breaks: { start: number; end: number }[] = [],
  column: ScheduleColumn = airlock,
) => {
  const schedules = buildColumnSchedules({ columns: [column], dayWindow });
  const schedule = schedules.get(column.key)!;
  const occupancy =
    buildOccupancy({
      bookings,
      schedules,
      knownRoomIds: new Set([1]),
    }).get(column.key) ?? [];
  return {
    column,
    schedule,
    dayWindow,
    occupancy,
    hardBlocks: hardBlocksFor(schedule, breaks),
  };
};

describe("resolving a space column's operating window", () => {
  it("takes open, close and turnaround from the day window", () => {
    const { schedule } = setup(window());
    assert.equal(schedule.open, AT(16));
    assert.equal(schedule.close, AT(20));
    assert.equal(schedule.turnaround, 15);
    assert.equal(schedule.bookable, true);
    assert.equal(schedule.windowKnown, true);
    assert.equal(schedule.locationId, 3);
  });

  it("snaps to the package interval, not the space's turnaround", () => {
    const { schedule } = setup(window());
    assert.equal(schedule.interval, 60);
  });

  it("keeps a space set to no gap at zero, never the default", () => {
    const { schedule } = setup(
      window({ rooms: [room({ interval_minutes: 0 })] }),
    );
    assert.equal(schedule.turnaround, 0);
    // The turnaround is not a grid: a zero there must not pull the snapping
    // interval down with it, nor be mistaken for an unset one.
    assert.equal(schedule.interval, 60);
  });

  it("frees the space the moment a no-gap booking ends", () => {
    const occupancy = buildOccupancy({
      bookings: [booking("16:00", 60)],
      schedules: buildColumnSchedules({
        columns: [airlock],
        dayWindow: window({ rooms: [room({ interval_minutes: 0 })] }),
      }),
      knownRoomIds: new Set([1]),
    }).get("room-1");
    assert.deepEqual(occupancy, [{ startMinutes: AT(16), endMinutes: AT(17) }]);
  });

  it("is never bookable while the day window is unknown", () => {
    const { schedule } = setup(null);
    assert.equal(schedule.windowKnown, false);
    assert.equal(schedule.bookable, false);
  });

  it("carries the server's own reason for a space with no schedule", () => {
    const { schedule } = setup(
      window({
        rooms: [
          room({
            open_minutes: null,
            close_minutes: null,
            bookable: false,
            reason: "No package scheduled",
          }),
        ],
      }),
    );
    assert.equal(schedule.bookable, false);
    assert.equal(schedule.reason, "No package scheduled");
  });

  it("gives a roomless package column that package's own window", () => {
    const { schedule } = setup(window(), [], [], {
      key: "pkg-7",
      name: "Escape Room",
      capacity: null,
      roomId: null,
      virtual: true,
    });
    assert.equal(schedule.open, AT(16));
    assert.equal(schedule.close, AT(20));
    assert.equal(schedule.turnaround, 0);
    assert.equal(schedule.bookable, true);
  });
});

describe("the grid a tap snaps to", () => {
  it("takes the smallest interval among the packages serving the space", () => {
    const dayWindow = window({
      packages: [
        pkg({ package_id: 7, interval_minutes: 60 }),
        pkg({ package_id: 8, interval_minutes: 30 }),
      ],
    });
    assert.equal(packageIntervalFor(airlock, dayWindow), 30);
  });

  it("ignores the space's turnaround entirely, zero or not", () => {
    const noGap = window({ rooms: [room({ interval_minutes: 0 })] });
    const bigGap = window({ rooms: [room({ interval_minutes: 45 })] });
    assert.equal(packageIntervalFor(airlock, noGap), 60);
    assert.equal(packageIntervalFor(airlock, bigGap), 60);
  });

  it("falls back to the day's interval, then to fifteen", () => {
    assert.equal(
      packageIntervalFor(
        airlock,
        window({ packages: [], interval_minutes: 20 }),
      ),
      20,
    );
    assert.equal(
      packageIntervalFor(
        airlock,
        window({ packages: [], interval_minutes: 0 }),
      ),
      15,
    );
    assert.equal(packageIntervalFor(airlock, null), 15);
  });
});

describe("offering starts from every package a space serves, not just whichever is active at the click", () => {
  const morning = pkg({
    package_id: 20,
    open_minutes: AT(16),
    close_minutes: AT(17, 30),
    interval_minutes: 30,
    duration_minutes: 30,
    start_minutes: [AT(16), AT(16, 30), AT(17)],
  });
  const afternoon = pkg({
    package_id: 21,
    open_minutes: AT(18),
    close_minutes: AT(20),
    interval_minutes: 60,
    duration_minutes: 60,
    start_minutes: [AT(18), AT(19)],
  });
  const twoPackageWindow = window({ packages: [morning, afternoon] });

  it("lands on the nearest real start even when the click falls in the gap between two packages' windows", () => {
    const tap = resolveSlotTap({
      ...setup(twoPackageWindow),
      rawMinute: AT(17, 45),
      isToday: false,
      nowMinutes: 0,
    });
    // 17:45 is after the morning package closes and before the afternoon one
    // opens; the old per-minute lookup found neither and fell back to a
    // generic interval guess. The real answer is 18:00.
    assert.equal(tap?.minute, AT(18));
  });

  it("still resolves inside the first package's own window", () => {
    const tap = resolveSlotTap({
      ...setup(twoPackageWindow),
      rawMinute: AT(16, 40),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap?.minute, AT(16, 30));
  });

  it("still resolves inside the second package's own window", () => {
    const tap = resolveSlotTap({
      ...setup(twoPackageWindow),
      rawMinute: AT(18, 20),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap?.minute, AT(18));
  });
});

describe("how long a booked space stays booked", () => {
  it("holds the space for its turnaround after the booking ends", () => {
    const occupancy = buildOccupancy({
      bookings: [booking("16:00", 60)],
      schedules: buildColumnSchedules({
        columns: [airlock],
        dayWindow: window(),
      }),
      knownRoomIds: new Set([1]),
    }).get("room-1");
    assert.deepEqual(occupancy, [
      { startMinutes: AT(16), endMinutes: AT(17, 15) },
    ]);
  });

  it("owes the turnaround to the next booking but not to a break", () => {
    const booked = setup(window(), [booking("18:00", 60)]);
    assert.equal(
      usableFreeUntil({ ...booked, minute: AT(17) }),
      AT(17, 45), // 18:00 less the 15-minute reset
    );

    const onBreak = setup(window(), [], [{ start: AT(18), end: AT(19) }]);
    assert.equal(usableFreeUntil({ ...onBreak, minute: AT(17) }), AT(18));
  });
});

describe("what a column header says about the rest of the day", () => {
  const status = (args: Parameters<typeof columnStatusFor>[0]) =>
    columnStatusFor(args);

  it("names the next offered start, not merely the next free minute", () => {
    const state = status({
      ...setup(window(), [booking("16:00", 60)]),
      isToday: false,
      nowMinutes: 0,
    });
    // Free again at 17:15 once the space is reset, but 18:00 is the next start
    // the booking form actually offers.
    assert.deepEqual(state, { kind: "free", atMinute: AT(18) });
  });

  it("reports a space booked to closing as booked, not free", () => {
    const state = status({
      ...setup(window(), [booking("16:00", 240)]),
      isToday: false,
      nowMinutes: 0,
    });
    assert.deepEqual(state, { kind: "booked" });
  });

  it("repeats the server's closure reason verbatim", () => {
    const state = status({
      ...setup(
        window({
          rooms: [
            room({
              open_minutes: null,
              close_minutes: null,
              bookable: false,
              reason: "No package scheduled",
            }),
          ],
        }),
      ),
      isToday: false,
      nowMinutes: 0,
    });
    assert.deepEqual(state, { kind: "closed", reason: "No package scheduled" });
  });

  it("says the day is over once closing has passed", () => {
    const state = status({
      ...setup(window()),
      isToday: true,
      nowMinutes: AT(21),
    });
    assert.deepEqual(state, { kind: "day-over" });
  });

  it("offers a walk-in when the space is free right now", () => {
    const state = status({
      ...setup(window()),
      isToday: true,
      nowMinutes: AT(17),
    });
    assert.deepEqual(state, { kind: "walk-in", fits: true, freeFor: 180 });
  });

  it("still offers the walk-in when nothing fits, but says how little is left", () => {
    const state = status({
      ...setup(window(), [booking("18:00", 60)]),
      isToday: true,
      nowMinutes: AT(17),
    });
    // 17:00 → 17:45 once the 15-minute reset is owed to the 18:00 booking, and
    // the only package here runs an hour.
    assert.deepEqual(state, { kind: "walk-in", fits: false, freeFor: 45 });
  });

  it("keeps offering the walk-in late in the day, free time and all", () => {
    const state = status({
      ...setup(window()),
      isToday: true,
      nowMinutes: AT(19, 30),
    });
    assert.deepEqual(state, { kind: "walk-in", fits: false, freeFor: 30 });
  });

  it("says so when the space is free but every remaining start is taken", () => {
    const state = status({
      ...setup(
        window({ packages: [pkg({ start_minutes: [AT(16), AT(19)] })] }),
        [booking("16:00", 60), booking("19:00", 60)],
      ),
      isToday: false,
      nowMinutes: 0,
    });
    // 17:15 onwards is free, but 19:00 is the only start left and it is booked.
    assert.deepEqual(state, { kind: "no-starts" });
  });
});

describe("naming a Free-header time staff can actually book", () => {
  it("skips the raw free minute for the next start a package here really offers", () => {
    const { column, dayWindow, occupancy, hardBlocks } = setup(window(), [
      booking("16:00", 60),
    ]);
    const next = nextBookableFrom({
      column,
      schedule: { open: AT(16), close: AT(20), turnaround: 15 },
      dayWindow,
      occupancy,
      hardBlocks,
      atMinute: AT(17, 15),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(next, AT(18));
  });

  it("gives nothing back once every later start is already taken", () => {
    const { column, dayWindow, occupancy, hardBlocks } = setup(
      window({ packages: [pkg({ start_minutes: [AT(16), AT(19)] })] }),
      [booking("16:00", 60), booking("19:00", 60)],
    );
    const next = nextBookableFrom({
      column,
      schedule: { open: AT(16), close: AT(20), turnaround: 15 },
      dayWindow,
      occupancy,
      hardBlocks,
      atMinute: AT(17, 15),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(next, null);
  });

  it("picks the earliest of several package start times, not just any later one", () => {
    const { column, dayWindow, occupancy, hardBlocks } = setup(
      window({
        packages: [
          pkg({ package_id: 7, start_minutes: [AT(16), AT(18, 30)] }),
          pkg({
            package_id: 8,
            start_minutes: [AT(17), AT(18)],
            room_ids: [1],
          }),
        ],
      }),
    );
    const next = nextBookableFrom({
      column,
      schedule: { open: AT(16), close: AT(20), turnaround: 15 },
      dayWindow,
      occupancy,
      hardBlocks,
      atMinute: AT(16, 40),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(next, AT(17));
  });
});

describe("what a tap on the free band means", () => {
  it("snaps a future day to the nearest start the booking form offers", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 10),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap?.minute, AT(17));
    assert.equal(tap?.packageId, 7);
    assert.deepEqual(tap?.packageIds, [7]);
    assert.equal(tap?.freeUntilMinute, AT(20));
    assert.equal(tap?.walkIn, false);
    assert.equal(tap?.locationId, 3);
  });

  it("walks a tap that lands on a break forward to the next free start", () => {
    const tap = resolveSlotTap({
      ...setup(window(), [], [{ start: AT(16), end: AT(17) }]),
      rawMinute: AT(16, 20),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap?.minute, AT(17));
  });

  it("walks a tap that lands on a booking past its turnaround", () => {
    const tap = resolveSlotTap({
      ...setup(window(), [booking("16:00", 60)]),
      rawMinute: AT(16, 30),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap?.minute, AT(18));
  });

  it("resolves today's tap to a real offered start even moments after now, never a five-minute grid", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 10),
      isToday: true,
      nowMinutes: AT(17, 2),
    });
    assert.equal(tap?.minute, AT(17));
    assert.equal(tap?.walkIn, true);
    assert.equal(tap?.packageId, 7);
  });

  it("resolves a click between offered starts on today to the nearest one, not an arbitrary five-minute time", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 40),
      isToday: true,
      nowMinutes: AT(17, 2),
    });
    assert.equal(tap?.minute, AT(18));
  });

  it("never hands back a minute earlier than now", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(16, 10),
      isToday: true,
      nowMinutes: AT(18, 3),
    });
    assert.equal(tap?.minute, AT(18));
  });

  it("gives nothing back when the space is booked out to closing", () => {
    const tap = resolveSlotTap({
      ...setup(window(), [booking("16:00", 240)]),
      rawMinute: AT(17),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap, null);
  });

  it("gives nothing back once nothing would still fit before closing", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(19, 40),
      isToday: true,
      nowMinutes: AT(19, 40),
    });
    assert.equal(tap, null);
  });

  it("gives nothing back for a space the day window says is shut", () => {
    const tap = resolveSlotTap({
      ...setup(
        window({
          rooms: [
            room({ closed_all_day: true, bookable: false, reason: "Closed" }),
          ],
        }),
      ),
      rawMinute: AT(17),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap, null);
  });

  it("gives nothing back while the day window is still unknown", () => {
    const tap = resolveSlotTap({
      ...setup(null),
      rawMinute: AT(17),
      isToday: false,
      nowMinutes: 0,
    });
    assert.equal(tap, null);
  });
});

describe("what the header's walk-in action means", () => {
  it("keeps the minute the guests arrived instead of snapping to a package start", () => {
    const tap = resolveWalkInTap({
      ...setup(window()),
      minute: AT(17, 23),
    });
    assert.equal(tap?.minute, AT(17, 23));
    assert.equal(tap?.walkIn, true);
    assert.equal(tap?.packageId, 7);
    assert.deepEqual(tap?.packageIds, [7]);
    assert.equal(tap?.locationId, 3);
  });

  it("carries how long the space stays free, turnaround already taken off", () => {
    const tap = resolveWalkInTap({
      ...setup(window(), [booking("19:00", 60)]),
      minute: AT(17, 23),
    });
    // 19:00 booked, and the space needs its 15-minute turnaround before it.
    assert.equal(tap?.freeUntilMinute, AT(18, 45));
  });

  it("still opens the form when the gap is too short for anything, and says so with the gap", () => {
    const tap = resolveWalkInTap({
      ...setup(window(), [booking("18:00", 60)]),
      minute: AT(17, 30),
    });
    assert.equal(tap?.minute, AT(17, 30));
    // 30 minutes short of the shortest package here — the form refuses it,
    // never this grid in silence.
    assert.equal(tap?.freeUntilMinute, AT(17, 45));
  });

  it("gives nothing back once the space has closed", () => {
    assert.equal(
      resolveWalkInTap({ ...setup(window()), minute: AT(20) }),
      null,
    );
  });

  it("gives nothing back before the space opens", () => {
    assert.equal(
      resolveWalkInTap({ ...setup(window()), minute: AT(15, 30) }),
      null,
    );
  });

  it("gives nothing back for a space the day window says is shut", () => {
    const tap = resolveWalkInTap({
      ...setup(
        window({
          rooms: [
            room({ closed_all_day: true, bookable: false, reason: "Closed" }),
          ],
        }),
      ),
      minute: AT(17, 23),
    });
    assert.equal(tap, null);
  });

  it("gives nothing back while the day window is still unknown", () => {
    assert.equal(resolveWalkInTap({ ...setup(null), minute: AT(17) }), null);
  });
});
