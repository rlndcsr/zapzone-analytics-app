import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shiftDateKey } from "../dashboard/activityCategories.ts";
import { deskDateLabel, deskTodayKey } from "./deskDate.ts";

describe("deskTodayKey", () => {
  it("is Michigan's day, not UTC's, after 8pm in the evening", () => {
    // 9:30pm EDT on Sept 24 is already Sept 25 in UTC.
    assert.equal(deskTodayKey(new Date("2026-09-25T01:30:00Z")), "2026-09-24");
    // 7pm EST on Jan 10 is already Jan 11 in UTC.
    assert.equal(deskTodayKey(new Date("2026-01-11T00:00:00Z")), "2026-01-10");
  });

  it("agrees with UTC once Michigan's day has caught up", () => {
    assert.equal(deskTodayKey(new Date("2026-09-25T12:00:00Z")), "2026-09-25");
  });
});

describe("deskDateLabel", () => {
  it("spells out the weekday, the web's way", () => {
    assert.equal(deskDateLabel("2026-09-24"), "Thu, September 24, 2026");
    assert.equal(deskDateLabel("2026-09-26"), "Sat, September 26, 2026");
  });

  it("says nothing for an unreadable day", () => {
    assert.equal(deskDateLabel(""), "");
  });
});

describe("stepping the desk's day", () => {
  it("moves one day either way across month and year ends", () => {
    assert.equal(shiftDateKey("2026-09-30", 1), "2026-10-01");
    assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
    // the day never slides across a DST change
    assert.equal(shiftDateKey("2026-03-08", 1), "2026-03-09");
    assert.equal(shiftDateKey("2026-11-01", -1), "2026-10-31");
  });
});
