import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dateKeyOf, formatDayMonth } from "./calendar.ts";

describe("dateKeyOf", () => {
  it("reads an event timestamp as the day it names", () => {
    assert.equal(dateKeyOf("2026-10-26T04:00:00.000000Z"), "2026-10-26");
    assert.equal(dateKeyOf("2026-10-26T23:30:00.000000Z"), "2026-10-26");
  });

  it("leaves a date-only value as it is", () => {
    assert.equal(dateKeyOf("2026-10-26"), "2026-10-26");
    assert.equal(dateKeyOf(" 2026-10-26 "), "2026-10-26");
  });

  it("is empty for a missing or unreadable value", () => {
    assert.equal(dateKeyOf(null), "");
    assert.equal(dateKeyOf(undefined), "");
    assert.equal(dateKeyOf(""), "");
    assert.equal(dateKeyOf("not a date"), "");
    assert.equal(dateKeyOf("2026-13-40"), "");
  });
});

describe("formatDayMonth", () => {
  it("reads a date as its calendar day", () => {
    assert.equal(formatDayMonth("2026-10-26"), "Mon, Oct 26");
    assert.equal(formatDayMonth("2026-01-05"), "Mon, Jan 5");
  });

  it("reads an event timestamp as the day it names, never shifted by the time zone", () => {
    assert.equal(formatDayMonth("2026-10-26T04:00:00.000000Z"), "Mon, Oct 26");
    assert.equal(formatDayMonth("2026-10-26T23:30:00.000000Z"), "Mon, Oct 26");
  });

  it("is empty for a missing or unreadable value", () => {
    assert.equal(formatDayMonth(null), "");
    assert.equal(formatDayMonth(undefined), "");
    assert.equal(formatDayMonth(""), "");
    assert.equal(formatDayMonth("not a date"), "");
  });
});
