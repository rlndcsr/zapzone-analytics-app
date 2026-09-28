import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DayOff } from "../../services/dayOffsService";
import {
  attractionEditDayOffs,
  availableTimeSlotsForDate,
  eventEditDayOffs,
} from "./dayOffAvailability.ts";

const TODAY = new Date(2026, 8, 1); // Sept 1, 2026, local midnight

const dayOff = (over: Partial<DayOff> = {}): DayOff => ({
  id: 1,
  locationId: 3,
  locationName: null,
  date: "2026-09-19",
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

describe("attractionEditDayOffs", () => {
  it("takes a full-day closure off the calendar", () => {
    const sets = attractionEditDayOffs({
      dayOffs: [dayOff()],
      attractionId: 9,
      today: TODAY,
    });
    assert.ok(sets.fullDayOffDates.has("2026-09-19"));
    assert.deepEqual(sets.partialClosuresByDate, {});
  });

  it("keeps a day with a timed closure pickable and hands back the closure", () => {
    const sets = attractionEditDayOffs({
      dayOffs: [dayOff({ timeStart: "10:00", timeEnd: "14:00" })],
      attractionId: 9,
      today: TODAY,
    });
    assert.equal(sets.fullDayOffDates.size, 0);
    assert.deepEqual(sets.partialClosuresByDate, {
      "2026-09-19": [{ timeStart: "10:00", timeEnd: "14:00" }],
    });
  });

  it("ignores a closure aimed at a different attraction", () => {
    const sets = attractionEditDayOffs({
      dayOffs: [dayOff({ isLocationWide: false, attractionIds: [4], timeStart: "10:00" })],
      attractionId: 9,
      today: TODAY,
    });
    assert.deepEqual(sets.partialClosuresByDate, {});
  });

  it("scopes an event's closures by event, the same way", () => {
    const sets = eventEditDayOffs({
      dayOffs: [
        dayOff({ isLocationWide: false, eventIds: [5], timeEnd: "12:00" }),
        dayOff({ id: 2, isLocationWide: false, eventIds: [6], date: "2026-09-20" }),
      ],
      eventId: 5,
      today: TODAY,
    });
    assert.deepEqual(Object.keys(sets.partialClosuresByDate), ["2026-09-19"]);
    assert.equal(sets.fullDayOffDates.size, 0);
  });
});

describe("availableTimeSlotsForDate", () => {
  it("trims only the hours inside a closure with both times", () => {
    const slots = availableTimeSlotsForDate(
      "2026-09-19", // a Saturday
      [{ days: ["saturday"], start_time: "09:00", end_time: "17:00" }],
      { "2026-09-19": [{ timeStart: "10:00", timeEnd: "14:00" }] },
    );
    assert.deepEqual(slots, ["09:00", "14:00", "15:00", "16:00"]);
  });

  it("leaves every hour for a backwards closure", () => {
    const slots = availableTimeSlotsForDate(
      "2026-09-19",
      [{ days: ["saturday"], start_time: "09:00", end_time: "12:00" }],
      { "2026-09-19": [{ timeStart: "14:00", timeEnd: "10:00" }] },
    );
    assert.deepEqual(slots, ["09:00", "10:00", "11:00"]);
  });
});
