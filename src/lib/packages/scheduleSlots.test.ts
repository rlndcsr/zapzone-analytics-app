import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fromMinutes,
  generateScheduleSlots,
  generateSpaceDrivenSlots,
  resolveScheduleSlots,
  spacesDriveStartTimes,
  toMinutes,
} from "./scheduleSlots.ts";

const label = (s: { start: string; end: string }) => `${s.start}-${s.end}`;
const starts = (slots: { start: string }[]) => slots.map((s) => s.start);

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

describe("deciding whether the spaces set the start times", () => {
  it("needs one space with an interval, like the server", () => {
    assert.equal(spacesDriveStartTimes([]), false);
    assert.equal(spacesDriveStartTimes([0, 0]), false);
    assert.equal(spacesDriveStartTimes([null, undefined]), false);
    assert.equal(spacesDriveStartTimes([30]), true);
    assert.equal(spacesDriveStartTimes([0, 30]), true);
  });
});

describe("generating the start times the spaces open up", () => {
  // The case from the web commit: three spaces on 30-min intervals running a
  // two-hour package. Each space opens 30 min after the last, then reopens only
  // after 2 h + 15 min cleanup — so the day reads 11:00, 11:30, 12:00 and then
  // jumps to 1:15, NOT a start every 30 min all afternoon.
  it("staggers the spaces then reopens after the session plus cleanup", () => {
    const slots = generateSpaceDrivenSlots({
      start: "11:00",
      end: "16:30",
      durationMinutes: 120,
      spaceIntervals: [30, 30, 30],
      cleanupMinutes: 15,
    });
    assert.deepEqual(slots?.map(label), [
      "11:00-13:00",
      "11:30-13:30",
      "12:00-14:00",
      "13:15-15:15",
      "13:45-15:45",
      "14:15-16:15",
    ]);
  });

  it("reopens one space on the session plus cleanup", () => {
    const slots = generateSpaceDrivenSlots({
      start: "09:00",
      end: "12:00",
      durationMinutes: 60,
      spaceIntervals: [30],
      cleanupMinutes: 15,
    });
    // 09:00-10:00, cleaned by 10:15, so the next start is 10:15 — not 09:30.
    assert.deepEqual(slots?.map(label), ["09:00-10:00", "10:15-11:15"]);
  });

  it("staggers on the shortest interval when the spaces disagree", () => {
    const slots = generateSpaceDrivenSlots({
      start: "09:00",
      end: "13:00",
      durationMinutes: 60,
      spaceIntervals: [45, 30],
      cleanupMinutes: 0,
    });
    assert.deepEqual(starts(slots ?? []), [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
    ]);
  });

  // The server staggers across EVERY attached room and only reads the non-zero
  // intervals to size the stagger, so a space with no interval of its own still
  // widens the cycle. Dropping it would invent start times.
  it("counts a space with no interval towards the cycle", () => {
    const base = {
      start: "09:00",
      end: "12:00",
      durationMinutes: 60,
      cleanupMinutes: 15,
    };
    assert.deepEqual(
      starts(
        generateSpaceDrivenSlots({ ...base, spaceIntervals: [30, 30] }) ?? [],
      ),
      ["09:00", "09:30", "10:15", "10:45"],
    );
    assert.deepEqual(
      starts(
        generateSpaceDrivenSlots({ ...base, spaceIntervals: [30, 30, 0] }) ?? [],
      ),
      ["09:00", "09:30", "10:00", "10:30", "11:00"],
    );
  });

  it("keeps an overnight window in chronological order", () => {
    const slots = generateSpaceDrivenSlots({
      start: "22:00",
      end: "01:00",
      durationMinutes: 60,
      spaceIntervals: [30, 30],
      cleanupMinutes: 0,
    });
    // Sorted on minutes from the window start, so 00:00 lands last rather than
    // leading the list the way an "HH:MM" sort would.
    assert.deepEqual(starts(slots ?? []), [
      "22:00",
      "22:30",
      "23:00",
      "23:30",
      "00:00",
    ]);
  });

  it("never offers a session that would run past the window", () => {
    const slots = generateSpaceDrivenSlots({
      start: "09:00",
      end: "11:00",
      durationMinutes: 90,
      spaceIntervals: [30, 30],
      cleanupMinutes: 0,
    });
    // 09:00-10:30 and 09:30-11:00 fit; 10:00-11:30 would overrun.
    assert.deepEqual(slots?.map(label), ["09:00-10:30", "09:30-11:00"]);
  });

  it("returns unique, strictly ascending starts", () => {
    const slots =
      generateSpaceDrivenSlots({
        start: "08:00",
        end: "22:00",
        durationMinutes: 45,
        spaceIntervals: [15, 15, 15, 15],
        cleanupMinutes: 10,
      }) ?? [];
    const minutes = slots.map((s) => toMinutes(s.start) ?? -1);
    assert.equal(new Set(minutes).size, minutes.length);
    assert.deepEqual(
      minutes,
      [...minutes].sort((a, b) => a - b),
    );
  });

  it("is null when the spaces cannot drive the grid", () => {
    const base = {
      start: "09:00",
      end: "17:00",
      durationMinutes: 60,
      spaceIntervals: [30],
    };
    assert.equal(generateSpaceDrivenSlots({ ...base, spaceIntervals: [] }), null);
    assert.equal(
      generateSpaceDrivenSlots({ ...base, spaceIntervals: [0, null] }),
      null,
    );
    assert.equal(generateSpaceDrivenSlots({ ...base, durationMinutes: 0 }), null);
    assert.equal(generateSpaceDrivenSlots({ ...base, start: "" }), null);
    assert.equal(generateSpaceDrivenSlots({ ...base, end: null }), null);
  });

  it("falls back to the default cleanup gap when the venue reports none", () => {
    const base = {
      start: "09:00",
      end: "12:00",
      durationMinutes: 60,
      spaceIntervals: [30],
    };
    const assumed = generateSpaceDrivenSlots(base);
    const explicit = generateSpaceDrivenSlots({ ...base, cleanupMinutes: 15 });
    assert.deepEqual(assumed, explicit);
  });

  it("stops at the cap rather than looping away on a tiny interval", () => {
    const slots = generateSpaceDrivenSlots({
      start: "00:00",
      end: "23:59",
      durationMinutes: 1,
      spaceIntervals: [1],
      cleanupMinutes: 0,
      maxSlots: 10,
    });
    assert.equal(slots?.length, 10);
    assert.equal(slots?.[0].start, "00:00");
  });
});

describe("resolving which rule a schedule previews", () => {
  const window = {
    start: "09:00",
    end: "12:00",
    intervalMinutes: 60,
    durationMinutes: 60,
  };

  it("lets the spaces override the schedule interval", () => {
    const resolved = resolveScheduleSlots({
      ...window,
      spaceIntervals: [30, 30],
      cleanupMinutes: 15,
    });
    assert.equal(resolved.drivenBySpaces, true);
    assert.equal(resolved.staggerMinutes, 30);
    assert.equal(resolved.spaceCount, 2);
    // Nothing like the hourly grid the interval alone would have produced.
    assert.deepEqual(starts(resolved.slots), [
      "09:00",
      "09:30",
      "10:15",
      "10:45",
    ]);
  });

  it("uses the schedule interval when no space sets one", () => {
    const resolved = resolveScheduleSlots({
      ...window,
      spaceIntervals: [0, null],
    });
    assert.equal(resolved.drivenBySpaces, false);
    assert.equal(resolved.staggerMinutes, null);
    assert.equal(resolved.spaceCount, 0);
    assert.deepEqual(starts(resolved.slots), ["09:00", "10:00", "11:00"]);
  });

  it("uses the schedule interval when the spaces cannot drive the grid", () => {
    // Spaces have intervals, but with no duration there is nothing to stagger.
    const resolved = resolveScheduleSlots({
      ...window,
      durationMinutes: null,
      spaceIntervals: [30, 30],
    });
    assert.equal(resolved.drivenBySpaces, false);
    assert.deepEqual(resolved.slots, []);
  });

  it("keeps the interval path's duration clipping", () => {
    const resolved = resolveScheduleSlots({
      start: "12:00",
      end: "14:00",
      intervalMinutes: 60,
      durationMinutes: 90,
      spaceIntervals: [],
    });
    // 13:00-14:30 would overrun, exactly as the server's interval path clips it.
    assert.deepEqual(resolved.slots.map(label), ["12:00-13:30"]);
  });
});
