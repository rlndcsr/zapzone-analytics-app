import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { seedDuration } from "./durationEditor.ts";

describe("seeding the Edit Duration form", () => {
  it("keeps whole hours as hours", () => {
    assert.deepEqual(seedDuration(11, "hours"), { value: 11, unit: "hours" });
    assert.deepEqual(seedDuration(1, "hours"), { value: 1, unit: "hours" });
  });

  it("keeps minutes as minutes", () => {
    assert.deepEqual(seedDuration(90, "minutes"), {
      value: 90,
      unit: "minutes",
    });
  });

  it("presents a fractional hour as exact minutes, never rounded hours", () => {
    assert.deepEqual(seedDuration(1.5, "hours"), {
      value: 90,
      unit: "minutes",
    });
    assert.deepEqual(seedDuration(2.25, "hours"), {
      value: 135,
      unit: "minutes",
    });
  });

  it("presents 'hours and minutes' as exact minutes", () => {
    assert.deepEqual(seedDuration(1.5, "hours and minutes"), {
      value: 90,
      unit: "minutes",
    });
    assert.deepEqual(seedDuration(2, "hours and minutes"), {
      value: 120,
      unit: "minutes",
    });
  });

  it("defaults to the web's 2 hours when there is nothing usable", () => {
    const fallback = { value: 2, unit: "hours" };
    assert.deepEqual(seedDuration(null, "hours"), fallback);
    assert.deepEqual(seedDuration(undefined, null), fallback);
    assert.deepEqual(seedDuration(NaN, "hours"), fallback);
    // 0 means "Unlimited" on a package, which this editor cannot express.
    assert.deepEqual(seedDuration(0, "hours"), fallback);
    assert.deepEqual(seedDuration(-3, "hours"), fallback);
  });

  it("treats a missing unit as hours", () => {
    assert.deepEqual(seedDuration(3, null), { value: 3, unit: "hours" });
    assert.deepEqual(seedDuration(3, undefined), { value: 3, unit: "hours" });
  });

  it("rounds a fractional minute value to a whole minute", () => {
    assert.deepEqual(seedDuration(45.4, "minutes"), {
      value: 45,
      unit: "minutes",
    });
  });

  it("never seeds a value the form would reject as below 1", () => {
    for (const [duration, unit] of [
      [0.004, "hours"],
      [0, "minutes"],
      [null, "minutes"],
    ] as const) {
      assert.equal(seedDuration(duration, unit).value >= 1, true);
    }
  });
});
