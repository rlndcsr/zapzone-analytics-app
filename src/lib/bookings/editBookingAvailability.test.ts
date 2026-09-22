import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bookingDurationMinutes,
  bookingWindowEndKey,
  dayOffAppliesToPackage,
  isDateSelectable,
  isSlotClosed,
  packageClosures,
  withCurrentTimeSlot,
} from "./editBookingAvailability.ts";

import type { AvailableSlot } from "../../services/bookingsService.ts";
import type { DayOff } from "../../services/dayOffsService.ts";

const dayOff = (over: Partial<DayOff>): DayOff => ({
  id: 1,
  locationId: 3,
  locationName: "Farmington",
  date: "2026-09-25",
  timeStart: null,
  timeEnd: null,
  reason: null,
  isRecurring: false,
  packageIds: [],
  roomIds: [],
  attractionIds: [],
  eventIds: [],
  isLocationWide: true,
  scopeLabel: "Entire Location",
  durationLabel: "Full Day",
  ...over,
});

const slot = (startTime: string, endTime: string): AvailableSlot => ({
  startTime,
  endTime,
  roomId: 7,
  roomName: "Lane 1",
  availableRoomIds: [7],
  remainingTickets: null,
  minParticipants: null,
});

const TODAY = "2026-09-20";

describe("dayOffAppliesToPackage", () => {
  it("a closure naming packages reaches only those packages", () => {
    const off = { packageIds: [4, 9], roomIds: [] };
    assert.equal(dayOffAppliesToPackage(off, 9), true);
    assert.equal(dayOffAppliesToPackage(off, 5), false);
    assert.equal(dayOffAppliesToPackage(off, null), false);
  });

  it("a closure naming only spaces never blocks a package", () => {
    assert.equal(dayOffAppliesToPackage({ packageIds: [], roomIds: [2] }, 9), false);
  });

  it("a closure naming neither covers the whole location", () => {
    assert.equal(dayOffAppliesToPackage({ packageIds: [], roomIds: [] }, 9), true);
  });
});

describe("packageClosures", () => {
  it("takes a location-wide full day off the calendar", () => {
    const { fullDayKeys, closuresByDate } = packageClosures(
      [dayOff({ date: "2026-12-25" })],
      4,
      TODAY,
    );
    assert.deepEqual([...fullDayKeys], ["2026-12-25"]);
    assert.deepEqual(closuresByDate, {});
  });

  it("keeps a part-day closure as a slot trim, not a blocked date", () => {
    const { fullDayKeys, closuresByDate } = packageClosures(
      [dayOff({ date: "2026-10-01", timeStart: "17:00", timeEnd: null })],
      4,
      TODAY,
    );
    assert.equal(fullDayKeys.size, 0);
    assert.deepEqual(closuresByDate["2026-10-01"], [
      { timeStart: "17:00", timeEnd: null },
    ]);
  });

  it("a package-scoped whole day trims that package's times only", () => {
    const offs = [dayOff({ date: "2026-10-02", packageIds: [4] })];
    assert.deepEqual(packageClosures(offs, 4, TODAY).closuresByDate["2026-10-02"], [
      { timeStart: null, timeEnd: null },
    ]);
    assert.deepEqual(packageClosures(offs, 5, TODAY).closuresByDate, {});
    // …and never removes the date itself, which other packages still run on.
    assert.equal(packageClosures(offs, 4, TODAY).fullDayKeys.size, 0);
  });

  it("drops a closure that has already passed", () => {
    const { fullDayKeys } = packageClosures(
      [dayOff({ date: "2026-09-19" })],
      4,
      TODAY,
    );
    assert.equal(fullDayKeys.size, 0);
  });

  it("expands a recurring closure onto this year and the next", () => {
    const { fullDayKeys } = packageClosures(
      [dayOff({ date: "2019-12-25", isRecurring: true })],
      4,
      TODAY,
    );
    assert.deepEqual([...fullDayKeys].sort(), ["2026-12-25", "2027-12-25"]);
  });

  it("skips this year's occurrence of a recurring closure once it is past", () => {
    const { fullDayKeys } = packageClosures(
      [dayOff({ date: "2019-07-04", isRecurring: true })],
      4,
      TODAY,
    );
    assert.deepEqual([...fullDayKeys], ["2027-07-04"]);
  });

  it("ignores a closure aimed only at attractions or events", () => {
    const offs = [
      dayOff({ date: "2026-10-05", attractionIds: [1] }),
      dayOff({ date: "2026-10-06", eventIds: [2] }),
    ];
    const { fullDayKeys, closuresByDate } = packageClosures(offs, 4, TODAY);
    assert.equal(fullDayKeys.size, 0);
    assert.deepEqual(closuresByDate, {});
  });

  it("honours a closure that names an attraction AND this package", () => {
    const offs = [
      dayOff({ date: "2026-10-07", attractionIds: [1], packageIds: [4] }),
    ];
    assert.deepEqual(packageClosures(offs, 4, TODAY).closuresByDate["2026-10-07"], [
      { timeStart: null, timeEnd: null },
    ]);
  });

  it("collects several closures on one date", () => {
    const offs = [
      dayOff({ date: "2026-10-08", timeStart: "18:00" }),
      dayOff({ date: "2026-10-08", timeEnd: "10:00" }),
    ];
    assert.equal(packageClosures(offs, 4, TODAY).closuresByDate["2026-10-08"].length, 2);
  });
});

describe("isSlotClosed", () => {
  it("is open when the date has no closure", () => {
    assert.equal(isSlotClosed(undefined, "12:00", "14:00"), false);
    assert.equal(isSlotClosed([], "12:00", "14:00"), false);
  });

  it("closing early blocks a start at or after it", () => {
    const closures = [{ timeStart: "17:00", timeEnd: null }];
    assert.equal(isSlotClosed(closures, "17:00", "19:00"), true);
    assert.equal(isSlotClosed(closures, "18:00", "20:00"), true);
  });

  it("closing early also blocks a booking that would run past it", () => {
    const closures = [{ timeStart: "17:00", timeEnd: null }];
    assert.equal(isSlotClosed(closures, "16:00", "18:00"), true);
    assert.equal(isSlotClosed(closures, "15:00", "17:00"), false);
  });

  it("opening late blocks a start before it", () => {
    const closures = [{ timeStart: null, timeEnd: "12:00" }];
    assert.equal(isSlotClosed(closures, "11:00", "13:00"), true);
    assert.equal(isSlotClosed(closures, "12:00", "14:00"), false);
  });

  it("a closure with no times closes the whole day", () => {
    assert.equal(
      isSlotClosed([{ timeStart: null, timeEnd: null }], "09:00", "10:00"),
      true,
    );
  });
});

describe("bookingWindowEndKey", () => {
  it("offers today plus the rest of the window", () => {
    assert.equal(bookingWindowEndKey(TODAY, 1), "2026-09-20");
    assert.equal(bookingWindowEndKey(TODAY, 7), "2026-09-26");
  });

  it("walks two years ahead when the package sets no window", () => {
    assert.equal(bookingWindowEndKey(TODAY, null), "2028-09-18");
  });

  it("treats a zero or negative window as one day", () => {
    assert.equal(bookingWindowEndKey(TODAY, 0), "2026-09-20");
  });
});

describe("isDateSelectable", () => {
  const base = {
    todayKey: TODAY,
    windowEndKey: "2026-10-20",
    runsOnDate: true,
    fullDayKeys: new Set<string>(),
    currentDateKey: null,
  };

  it("offers a day the package runs, inside the window", () => {
    assert.equal(isDateSelectable({ ...base, dateKey: "2026-09-25" }), true);
  });

  it("refuses a past date, a date past the window, and a closed date", () => {
    assert.equal(isDateSelectable({ ...base, dateKey: "2026-09-19" }), false);
    assert.equal(isDateSelectable({ ...base, dateKey: "2026-10-21" }), false);
    assert.equal(
      isDateSelectable({
        ...base,
        dateKey: "2026-09-25",
        fullDayKeys: new Set(["2026-09-25"]),
      }),
      false,
    );
  });

  it("refuses a day the package does not run", () => {
    assert.equal(
      isDateSelectable({ ...base, dateKey: "2026-09-25", runsOnDate: false }),
      false,
    );
  });

  it("always keeps the booking's own date selectable", () => {
    // A booking made long ago, on a day the package no longer runs, that the
    // venue has since closed: still editable.
    assert.equal(
      isDateSelectable({
        ...base,
        dateKey: "2025-01-02",
        runsOnDate: false,
        fullDayKeys: new Set(["2025-01-02"]),
        currentDateKey: "2025-01-02",
      }),
      true,
    );
  });
});

describe("withCurrentTimeSlot", () => {
  const current = { time: "12:00", durationMinutes: 660, roomId: 7 };

  it("puts the booking's own start back when availability dropped it", () => {
    const out = withCurrentTimeSlot([slot("14:00", "15:00")], "12:00", current);
    assert.deepEqual(
      out.map((s) => s.startTime),
      ["12:00", "14:00"],
    );
    assert.equal(out[0].endTime, "23:00");
    assert.equal(out[0].roomId, 7);
  });

  it("leaves the list alone when the start is already offered", () => {
    const slots = [slot("12:00", "23:00")];
    assert.equal(withCurrentTimeSlot(slots, "12:00", current), slots);
  });

  it("leaves the list alone once a different time is picked", () => {
    const slots = [slot("14:00", "15:00")];
    assert.equal(withCurrentTimeSlot(slots, "14:00", current), slots);
    assert.equal(withCurrentTimeSlot(slots, "", current), slots);
    assert.equal(withCurrentTimeSlot(slots, "12:00", null), slots);
  });

  it("wraps an end time past midnight", () => {
    const out = withCurrentTimeSlot([], "23:30", {
      time: "23:30",
      durationMinutes: 90,
      roomId: null,
    });
    assert.equal(out[0].endTime, "01:00");
  });
});

describe("bookingDurationMinutes", () => {
  it("reads each unit the booking can be saved in", () => {
    assert.equal(bookingDurationMinutes(2, "hours"), 120);
    assert.equal(bookingDurationMinutes(45, "minutes"), 45);
    assert.equal(bookingDurationMinutes(1.5, "hours and minutes"), 90);
    assert.equal(bookingDurationMinutes(null, null), 0);
  });
});
