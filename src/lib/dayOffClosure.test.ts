import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  closureRangeIsValid,
  describeClosure,
  isFullDayClosure,
  isSlotBlockedByClosure,
  isSpanBlockedByClosure,
  type Closure,
} from "./dayOffClosure.ts";

const closure = (timeStart: string | null, timeEnd: string | null): Closure => ({
  timeStart,
  timeEnd,
});

/** Whether the venue is shut at one start minute (no end). */
const shutAt = (clock: string, c: Closure) =>
  isSlotBlockedByClosure(clock, null, [c]);

describe("a closure with both times", () => {
  const c = closure("10:00", "14:00");

  it("blocks only the window between them, not the whole day", () => {
    assert.equal(shutAt("09:59", c), false);
    assert.equal(shutAt("10:00", c), true);
    assert.equal(shutAt("12:00", c), true);
    assert.equal(shutAt("13:59", c), true);
    assert.equal(shutAt("14:00", c), false);
    assert.equal(shutAt("18:00", c), false);
  });

  it("blocks a booking that overlaps the window and leaves one either side", () => {
    assert.equal(isSlotBlockedByClosure("09:00", "10:00", [c]), false);
    assert.equal(isSlotBlockedByClosure("09:30", "10:30", [c]), true);
    assert.equal(isSlotBlockedByClosure("13:00", "15:00", [c]), true);
    assert.equal(isSlotBlockedByClosure("14:00", "15:00", [c]), false);
  });

  it("leaves most of a Saturday bookable instead of none of it", () => {
    const starts = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);
    const open = starts.filter((s) => !shutAt(s, c));
    assert.deepEqual(open, ["09:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"]);
  });
});

describe("a closure with only a start", () => {
  const c = closure("10:00", null);

  it("closes from that time for the rest of the day", () => {
    assert.equal(shutAt("09:59", c), false);
    assert.equal(shutAt("10:00", c), true);
    assert.equal(shutAt("23:00", c), true);
  });

  it("also refuses a booking that would still be running when it closes", () => {
    assert.equal(isSlotBlockedByClosure("09:00", "10:00", [c]), false);
    assert.equal(isSlotBlockedByClosure("09:30", "10:30", [c]), true);
  });
});

describe("a closure with only an end", () => {
  const c = closure(null, "14:00");

  it("is closed until it reopens", () => {
    assert.equal(shutAt("00:00", c), true);
    assert.equal(shutAt("13:59", c), true);
    assert.equal(shutAt("14:00", c), false);
  });
});

describe("a backwards closure", () => {
  const c = closure("14:00", "10:00");

  it("blocks nothing at all", () => {
    for (const clock of ["00:00", "09:00", "10:00", "12:00", "14:00", "23:59"]) {
      assert.equal(shutAt(clock, c), false, clock);
    }
    assert.equal(isSlotBlockedByClosure("09:00", "15:00", [c]), false);
  });

  it("is the one shape that is not a valid range", () => {
    assert.equal(closureRangeIsValid(c), false);
    assert.equal(closureRangeIsValid(closure("10:00", "10:00")), false);
    assert.equal(closureRangeIsValid(closure("10:00", "14:00")), true);
    assert.equal(closureRangeIsValid(closure("10:00", null)), true);
    assert.equal(closureRangeIsValid(closure(null, "14:00")), true);
    assert.equal(closureRangeIsValid(closure(null, null)), true);
  });
});

describe("a closure with no times", () => {
  it("closes the whole day", () => {
    const c = closure(null, null);
    assert.equal(isFullDayClosure(c), true);
    assert.equal(shutAt("00:00", c), true);
    assert.equal(shutAt("23:59", c), true);
  });
});

describe("several closures on one day", () => {
  it("blocks wherever any one of them does", () => {
    const closures = [closure(null, "10:00"), closure("15:00", "16:00")];
    assert.equal(isSlotBlockedByClosure("09:00", null, closures), true);
    assert.equal(isSlotBlockedByClosure("12:00", null, closures), false);
    assert.equal(isSlotBlockedByClosure("15:30", null, closures), true);
  });

  it("reads minutes the same as clock times, seconds and all", () => {
    const closures = [closure("10:00:00", "14:00:00")];
    assert.equal(isSpanBlockedByClosure(600, 660, closures), true);
    assert.equal(isSpanBlockedByClosure(840, 900, closures), false);
  });
});

describe("describeClosure", () => {
  it("says what is closed in the web's words", () => {
    assert.equal(describeClosure(closure(null, null)), "Closed all day");
    assert.equal(describeClosure(closure("16:00", null)), "Closed from 4:00 PM");
    assert.equal(describeClosure(closure(null, "12:00")), "Closed until 12:00 PM");
    assert.equal(
      describeClosure(closure("10:00", "14:30")),
      "Closed 10:00 AM - 2:30 PM",
    );
    assert.equal(describeClosure(closure("00:15:00", null)), "Closed from 12:15 AM");
  });
});
