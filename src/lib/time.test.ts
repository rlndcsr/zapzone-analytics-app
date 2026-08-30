import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scheduleWindowMinutes } from "./time.ts";

describe("measuring a schedule window", () => {
  it("measures a normal daytime window", () => {
    assert.equal(scheduleWindowMinutes("09:00", "17:00"), 480);
  });

  it("reports identical times as zero, not as a full day", () => {
    assert.equal(scheduleWindowMinutes("09:00", "09:00"), 0);
  });

  it("wraps a window that runs past midnight", () => {
    assert.equal(scheduleWindowMinutes("20:00", "02:00"), 360);
    assert.equal(scheduleWindowMinutes("09:00", "00:00"), 900);
  });

  it("is null when either side is missing", () => {
    assert.equal(scheduleWindowMinutes("", "17:00"), null);
    assert.equal(scheduleWindowMinutes("09:00", ""), null);
    assert.equal(scheduleWindowMinutes(null, undefined), null);
  });

  it("is null when either side is unparseable", () => {
    assert.equal(scheduleWindowMinutes("nine", "17:00"), null);
    assert.equal(scheduleWindowMinutes("09:00", "17"), null);
  });

  it("tolerates HH:mm:ss times from the API", () => {
    assert.equal(scheduleWindowMinutes("09:00:00", "17:30:00"), 510);
  });
});
