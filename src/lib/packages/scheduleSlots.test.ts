import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fromMinutes,
  generateScheduleSlots,
  toMinutes,
} from "./scheduleSlots.ts";

const label = (s: { start: string; end: string }) => `${s.start}-${s.end}`;

describe("reading a time of day", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    assert.equal(toMinutes("12:30"), 750);
    assert.equal(toMinutes("09:05:00"), 545);
  });

  it("is null for anything unparseable", () => {
    assert.equal(toMinutes(""), null);
    assert.equal(toMinutes(null), null);
    assert.equal(toMinutes("nope"), null);
    assert.equal(toMinutes("25:00"), null);
    assert.equal(toMinutes("10:75"), null);
  });

  it("round-trips back to HH:MM", () => {
    assert.equal(fromMinutes(750), "12:30");
    assert.equal(fromMinutes(0), "00:00");
  });

  it("wraps a time past midnight", () => {
    assert.equal(fromMinutes(1440 + 90), "01:30");
  });
});

describe("generating a schedule's slots", () => {
  // The Friday schedule from the package form: 12:30–21:30, 90 min apart,
  // 1 hour each.
  it("starts a slot every interval and runs it for the duration", () => {
    const slots = generateScheduleSlots({
      start: "12:30",
      end: "21:30",
      intervalMinutes: 90,
      durationMinutes: 60,
    });
    assert.deepEqual(slots.map(label), [
      "12:30-13:30",
      "14:00-15:00",
      "15:30-16:30",
      "17:00-18:00",
      "18:30-19:30",
      "20:00-21:00",
    ]);
  });

  it("drops a slot that would run past the window", () => {
    const slots = generateScheduleSlots({
      start: "12:00",
      end: "14:00",
      intervalMinutes: 60,
      durationMinutes: 90,
    });
    // 12:00-13:30 fits; 13:00-14:30 would overrun.
    assert.deepEqual(slots.map(label), ["12:00-13:30"]);
  });

  it("treats an end at or before the start as running past midnight", () => {
    const slots = generateScheduleSlots({
      start: "22:00",
      end: "01:00",
      intervalMinutes: 60,
      durationMinutes: 60,
    });
    // 22:00 to 01:00 is a three-hour window, so it takes three hour-long slots.
    assert.deepEqual(slots.map(label), [
      "22:00-23:00",
      "23:00-00:00",
      "00:00-01:00",
    ]);
  });

  it("is empty when nothing can be generated", () => {
    const base = {
      start: "09:00",
      end: "17:00",
      intervalMinutes: 60,
      durationMinutes: 60,
    };
    assert.deepEqual(generateScheduleSlots({ ...base, start: "" }), []);
    assert.deepEqual(generateScheduleSlots({ ...base, end: null }), []);
    assert.deepEqual(generateScheduleSlots({ ...base, intervalMinutes: 0 }), []);
    assert.deepEqual(generateScheduleSlots({ ...base, durationMinutes: null }), []);
  });

  it("is empty when the session is longer than the window", () => {
    assert.deepEqual(
      generateScheduleSlots({
        start: "09:00",
        end: "10:00",
        intervalMinutes: 30,
        durationMinutes: 120,
      }),
      [],
    );
  });

  it("stops at the cap rather than looping away on a tiny interval", () => {
    const slots = generateScheduleSlots({
      start: "00:00",
      end: "23:59",
      intervalMinutes: 1,
      durationMinutes: 1,
      maxSlots: 10,
    });
    assert.equal(slots.length, 10);
  });
});
