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
  nextBookingMinuteFrom,
  resolveSlotTap,
  resolveWalkInTap,
  usableFreeUntil,
  walkInFit,
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

  it("keeps a space set to no gap at zero, never the default", () => {
    const { schedule } = setup(
      window({ rooms: [room({ interval_minutes: 0 })] }),
    );
    assert.equal(schedule.turnaround, 0);
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

describe("offering the packages a space serves, not just whichever is active at the tap", () => {
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

  it("keeps the tapped minute inside the first package's own window and offers that package", () => {
    const tap = resolveSlotTap({
      ...setup(twoPackageWindow),
      rawMinute: AT(16, 40),
      isToday: false,
    });
    assert.equal(tap?.minute, AT(16, 40));
    assert.deepEqual(tap?.packageIds, [20]);
  });

  it("keeps the tapped minute inside the second package's own window and offers that package", () => {
    const tap = resolveSlotTap({
      ...setup(twoPackageWindow),
      rawMinute: AT(18, 20),
      isToday: false,
    });
    assert.equal(tap?.minute, AT(18, 20));
    assert.deepEqual(tap?.packageIds, [21]);
  });

  it("still hands back the tapped minute in the gap between two packages' windows, with no package to offer", () => {
    const tap = resolveSlotTap({
      ...setup(twoPackageWindow),
      rawMinute: AT(17, 45),
      isToday: false,
    });
    // 17:45 is after the morning package closes and before the afternoon one
    // opens. Staff are not held to either package's grid, so the tap stands and
    // the booking form is where a package gets picked.
    assert.equal(tap?.minute, AT(17, 45));
    assert.deepEqual(tap?.packageIds, []);
    assert.equal(tap?.packageId, null);
  });
});

describe("keeping a walk-in inside its own package's hours", () => {
  const early = pkg({
    package_id: 30,
    name: "Early Slot",
    open_minutes: AT(16),
    close_minutes: AT(18),
    duration_minutes: 30,
    start_minutes: [AT(16), AT(17)],
  });
  const late = pkg({
    package_id: 31,
    name: "Late Slot",
    open_minutes: AT(16),
    close_minutes: AT(22),
    duration_minutes: 90,
    start_minutes: [AT(16), AT(17), AT(18), AT(19), AT(20)],
  });
  const twoPackageWindow = window({
    rooms: [room({ close_minutes: AT(22) })],
    packages: [early, late],
  });

  it("skips a short package that would finish after its own close, even though the room stays open for a neighbour", () => {
    const fit = walkInFit({ ...setup(twoPackageWindow), nowMinutes: AT(17, 50) });
    // Early Slot (30 min) would run to 18:20, past its own 18:00 close — Late Slot is what's actually offered.
    assert.equal(fit.shortest, 90);
    assert.equal(fit.packageName, "Late Slot");
  });

  it("still offers the short package once it actually finishes before its own close", () => {
    const fit = walkInFit({ ...setup(twoPackageWindow), nowMinutes: AT(17) });
    assert.equal(fit.shortest, 30);
    assert.equal(fit.packageName, "Early Slot");
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

describe("nextBookingMinuteFrom", () => {
  it("names the next booking's own raw start, not the turnaround-reduced cap", () => {
    const { occupancy } = setup(window(), [booking("18:00", 60)]);
    // usableFreeUntil would say 17:45 (turnaround already taken off); this
    // must still say 18:00 — the minute the next group actually arrives.
    assert.equal(nextBookingMinuteFrom({ occupancy, minute: AT(17) }), AT(18));
  });

  it("is null once nothing else is booked after the minute", () => {
    const { occupancy } = setup(window(), [booking("16:00", 60)]);
    assert.equal(
      nextBookingMinuteFrom({ occupancy, minute: AT(17, 30) }),
      null,
    );
  });

  it("picks the earliest of several later bookings", () => {
    const { occupancy } = setup(window(), [
      booking("19:00", 30),
      booking("18:00", 30),
    ]);
    assert.equal(nextBookingMinuteFrom({ occupancy, minute: AT(17) }), AT(18));
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
  it("keeps the minute tapped on a future day, on a 5-minute grid, and marks it off the customer grid", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 10),
      isToday: false,
    });
    assert.equal(tap?.minute, AT(17, 10));
    assert.equal(tap?.packageId, 7);
    assert.deepEqual(tap?.packageIds, [7]);
    assert.equal(tap?.freeUntilMinute, AT(20));
    // 17:10 is not one of this package's own start times, so the booking form
    // has to be told to keep it rather than hunt for an offered start.
    assert.equal(tap?.walkIn, true);
    assert.equal(tap?.locationId, 3);
  });

  it("lands on the customer's own start when the tap is on one, and says so", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 2),
      isToday: false,
    });
    assert.equal(tap?.minute, AT(17));
    assert.equal(tap?.walkIn, false);
  });

  it("walks a tap that lands on a break forward to the next free start", () => {
    const tap = resolveSlotTap({
      ...setup(window(), [], [{ start: AT(16), end: AT(17) }]),
      rawMinute: AT(16, 20),
      isToday: false,
    });
    assert.equal(tap?.minute, AT(17));
  });

  it("walks a tap that lands on a booking to the first free 5-minute mark past its turnaround", () => {
    const tap = resolveSlotTap({
      ...setup(window(), [booking("16:00", 60)]),
      rawMinute: AT(16, 30),
      isToday: false,
    });
    // 16:00 + an hour + the 15-minute reset. Staff start there, not at the
    // customer's next scheduled 18:00.
    assert.equal(tap?.minute, AT(17, 15));
  });

  it("keeps a tap moments after a scheduled start instead of pulling it back to one", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 10),
      isToday: true,
    });
    assert.equal(tap?.minute, AT(17, 10));
    assert.equal(tap?.walkIn, true);
    assert.equal(tap?.packageId, 7);
  });

  it("keeps a tap between two scheduled starts instead of rounding to the nearer one", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 40),
      isToday: true,
    });
    assert.equal(tap?.minute, AT(17, 40));
  });

  it("rounds to the nearest 5 minutes, never to the customer's interval", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(17, 43),
      isToday: true,
    });
    assert.equal(tap?.minute, AT(17, 45));
  });

  it("lets a tap land earlier than now instead of snapping forward — recording a group that already went in", () => {
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(16, 10),
      isToday: true,
    });
    assert.equal(tap?.minute, AT(16, 10));
    assert.equal(tap?.walkIn, true);
  });

  it("gives nothing back when the space is booked out to closing", () => {
    const tap = resolveSlotTap({
      ...setup(window(), [booking("16:00", 240)]),
      rawMinute: AT(17),
      isToday: false,
    });
    assert.equal(tap, null);
  });

  it("still finds the last fitting start even when the tap lands late in the day", () => {
    // 19:40 leaves no room for this package's hour before closing, so the tap
    // falls back to 19:00, the last start that still fits — never refused.
    const tap = resolveSlotTap({
      ...setup(window()),
      rawMinute: AT(19, 40),
      isToday: true,
    });
    assert.equal(tap?.minute, AT(19));
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
    });
    assert.equal(tap, null);
  });

  it("gives nothing back while the day window is still unknown", () => {
    const tap = resolveSlotTap({
      ...setup(null),
      rawMinute: AT(17),
      isToday: false,
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
    // the overlap warning needs the booking's own start, not the reduced cap
    assert.equal(tap?.nextBookingMinute, AT(19));
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
