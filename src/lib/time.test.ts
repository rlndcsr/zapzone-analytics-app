import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDuration, scheduleWindowMinutes } from "./time.ts";

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

describe("wording a booking's duration the way the web admin words it", () => {
  it("reads whole hours in words, singular and plural", () => {
    assert.equal(formatDuration(11, "hours"), "11 hours");
    assert.equal(formatDuration(1, "hours"), "1 hour");
    assert.equal(formatDuration(2, "hours"), "2 hours");
  });

  it("keeps a fractional hour as a decimal, not as hours and minutes", () => {
    assert.equal(formatDuration(1.5, "hours"), "1.5 hours");
    assert.equal(formatDuration(2.25, "hours"), "2.25 hours");
  });

  it("splits 'hours and minutes' into both parts", () => {
    assert.equal(formatDuration(1.5, "hours and minutes"), "1 hr 30 min");
    assert.equal(formatDuration(2, "hours and minutes"), "2 hours");
    assert.equal(formatDuration(0.75, "hours and minutes"), "45 min");
  });

  it("rolls minutes up into hours past the hour mark", () => {
    assert.equal(formatDuration(45, "minutes"), "45 min");
    assert.equal(formatDuration(60, "minutes"), "1 hour");
    assert.equal(formatDuration(90, "minutes"), "1 hr 30 min");
    assert.equal(formatDuration(120, "minutes"), "2 hours");
  });

  it("calls a zero-length booking Unlimited, the way the backend means it", () => {
    assert.equal(formatDuration(0, "hours"), "Unlimited");
    assert.equal(formatDuration(0, "minutes"), "Unlimited");
  });

  it("says so plainly when there is no duration at all", () => {
    assert.equal(formatDuration(null, "hours"), "Not specified");
    assert.equal(formatDuration(undefined, "hours"), "Not specified");
    assert.equal(formatDuration(NaN, "hours"), "Not specified");
  });

  it("defaults a missing unit to hours", () => {
    assert.equal(formatDuration(3, null), "3 hours");
    assert.equal(formatDuration(1, undefined), "1 hour");
  });

  it("keeps an unknown unit verbatim rather than guessing", () => {
    assert.equal(formatDuration(3, "days"), "3 days");
  });
});
