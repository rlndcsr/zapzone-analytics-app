import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bandGeometry,
  conflictsWith,
  freeState,
  freeUntilMinute,
  minuteAtOffset,
  nextFreeMinute,
  snapToInterval,
  snapToOfferedStart,
  type Occupant,
  type TimeRange,
} from "./freeTime.ts";

describe("snapToInterval", () => {
  it("floors to the nearest interval", () => {
    assert.equal(snapToInterval(615, 30), 600);
    assert.equal(snapToInterval(629, 30), 600);
    assert.equal(snapToInterval(630, 30), 630);
  });

  it("clamps up to floorMinute — the today walk-in guard", () => {
    assert.equal(snapToInterval(600, 30, 643), 660);
    assert.equal(snapToInterval(700, 30, 643), 690);
  });

  it("never goes negative", () => {
    assert.equal(snapToInterval(-10, 15), 0);
  });
});

describe("minuteAtOffset", () => {
  it("adds the pixel offset scaled by px-per-minute to the band's own origin", () => {
    assert.equal(minuteAtOffset(600, 60, 2), 630);
  });

  it("never crosses the whole-timeline anchor bug — origin is the band's top, not 0", () => {
    const result = minuteAtOffset(18 * 60, 10, 2);
    assert.ok(Math.abs(result - 18 * 60) < 10);
  });

  it("falls back to the origin when scale is non-positive", () => {
    assert.equal(minuteAtOffset(600, 100, 0), 600);
  });
});

describe("bandGeometry", () => {
  const window = { start: 600, end: 1320, total: 720 };

  it("returns null when open/close is unknown", () => {
    assert.equal(bandGeometry(null, 1000, window, 1), null);
    assert.equal(bandGeometry(900, null, window, 1), null);
  });

  it("clips to the visible time window", () => {
    const band = bandGeometry(500, 1400, window, 1);
    assert.deepEqual(band, { top: 0, height: 720 });
  });

  it("returns null when the room's window doesn't intersect what's visible", () => {
    assert.equal(bandGeometry(1400, 1450, window, 1), null);
  });
});

describe("nextFreeMinute", () => {
  it("returns the cursor unchanged when nothing is busy", () => {
    assert.equal(nextFreeMinute(600, 1320, [], 650), 650);
  });

  it("walks past back-to-back bookings instead of stopping at the first", () => {
    const busy: TimeRange[] = [
      { startMinutes: 360, endMinutes: 420 },
      { startMinutes: 420, endMinutes: 480 },
    ];
    assert.equal(nextFreeMinute(0, 1440, busy, 380), 480);
  });

  it("uses a booking's real end minute even past the visible grid, never snapping backward", () => {
    const busy: TimeRange[] = [{ startMinutes: 1300, endMinutes: 1410 }];
    assert.equal(nextFreeMinute(0, 1440, busy, 1305), 1410);
  });

  it("returns null once the close time is reached", () => {
    const busy: TimeRange[] = [{ startMinutes: 600, endMinutes: 1320 }];
    assert.equal(nextFreeMinute(600, 1320, busy, 600), null);
  });
});

describe("freeState", () => {
  it("reports closed for an unknown/failed window regardless of bookable", () => {
    assert.deepEqual(freeState(null, null, [], 600, true), { kind: "closed" });
  });

  it("reports closed when bookable is false — an out-of-service room", () => {
    assert.deepEqual(freeState(600, 1320, [], 700, false), { kind: "closed" });
  });

  it("reports free with the current moment when nothing is booked yet", () => {
    assert.deepEqual(freeState(600, 1320, [], 650), {
      kind: "free",
      atMinute: 650,
    });
  });

  it("reports free at the moment a booking ends", () => {
    const busy: TimeRange[] = [{ startMinutes: 600, endMinutes: 660 }];
    assert.deepEqual(freeState(600, 1320, busy, 600), {
      kind: "free",
      atMinute: 660,
    });
  });

  it("reports booked when back-to-back bookings run to close", () => {
    const busy: TimeRange[] = [
      { startMinutes: 600, endMinutes: 900 },
      { startMinutes: 900, endMinutes: 1320 },
    ];
    assert.deepEqual(freeState(600, 1320, busy, 600), { kind: "booked" });
  });

  it("reports blocked with the closure's reason when a break/closure runs to close", () => {
    const busy: TimeRange[] = [
      { startMinutes: 600, endMinutes: 1320, reason: "On break" },
    ];
    assert.deepEqual(freeState(600, 1320, busy, 600), {
      kind: "blocked",
      reason: "On break",
    });
  });

  it("reports day-over once past close for today", () => {
    assert.deepEqual(freeState(600, 1320, [], 1350), { kind: "day-over" });
  });
});

describe("snapToOfferedStart", () => {
  it("picks the closest real offered start to the raw minute", () => {
    assert.equal(snapToOfferedStart([600, 645, 690], 620), 600);
    assert.equal(snapToOfferedStart([600, 645, 690], 660), 645);
  });

  it("ignores offered starts before floorMinute — the walk-in guard", () => {
    assert.equal(snapToOfferedStart([600, 645, 690], 610, 640), 645);
  });

  it("returns null when nothing is offered at or after the floor", () => {
    assert.equal(snapToOfferedStart([600, 615], 610, 700), null);
    assert.equal(snapToOfferedStart([], 610), null);
  });
});

describe("freeUntilMinute", () => {
  it("runs to close when nothing is booked after `from`", () => {
    assert.equal(freeUntilMinute(600, 1320, [], 700), 1320);
  });

  it("stops at the next booking after `from`", () => {
    const busy: TimeRange[] = [{ startMinutes: 780, endMinutes: 840 }];
    assert.equal(freeUntilMinute(600, 1320, busy, 700), 780);
  });

  it("returns `from` itself when already inside a busy range", () => {
    const busy: TimeRange[] = [{ startMinutes: 690, endMinutes: 750 }];
    assert.equal(freeUntilMinute(600, 1320, busy, 700), 700);
  });

  it("ignores a busy range that already ended before `from`", () => {
    const busy: TimeRange[] = [{ startMinutes: 600, endMinutes: 660 }];
    assert.equal(freeUntilMinute(600, 1320, busy, 700), 1320);
  });

  it("is null for an unknown or inverted window", () => {
    assert.equal(freeUntilMinute(null, 1320, [], 700), null);
    assert.equal(freeUntilMinute(600, 500, [], 700), null);
  });
});

describe("conflictsWith", () => {
  const occupant = (over: Partial<Occupant> & { id: number }): Occupant => ({
    startMinutes: 600,
    endMinutes: 660,
    turnaroundMinutes: 0,
    ...over,
  });

  it("reports a real time overlap with the actual overlap minutes", () => {
    const target = occupant({ id: 1, startMinutes: 600, endMinutes: 660 });
    const other = occupant({ id: 2, startMinutes: 630, endMinutes: 690 });
    const clashes = conflictsWith(target, [other]);
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0].occupant.id, 2);
    assert.equal(clashes[0].overlapMinutes, 30);
  });

  it("flags a back-to-back pair with a missing turnaround as zero overlap minutes", () => {
    const target = occupant({
      id: 1,
      startMinutes: 600,
      endMinutes: 660,
      turnaroundMinutes: 15,
    });
    const other = occupant({ id: 2, startMinutes: 670, endMinutes: 730 });
    const clashes = conflictsWith(target, [other]);
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0].overlapMinutes, 0);
  });

  it("does not flag a back-to-back pair at all once no turnaround is required — the escape-room case", () => {
    const target = occupant({
      id: 1,
      startMinutes: 600,
      endMinutes: 660,
      turnaroundMinutes: 0,
    });
    const other = occupant({
      id: 2,
      startMinutes: 660,
      endMinutes: 720,
      turnaroundMinutes: 0,
    });
    assert.deepEqual(conflictsWith(target, [other]), []);
  });

  it("never matches itself", () => {
    const target = occupant({ id: 1 });
    assert.deepEqual(conflictsWith(target, [target]), []);
  });
});
