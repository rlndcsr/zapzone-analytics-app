import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createdWithinTimeframe,
  filterNewBookings,
  timeframeLabel,
  venueTodayKey,
} from "./dashboardTimeframe.ts";

// 2026-09-22 12:00 in Michigan (EDT, UTC-4).
const NOON_ET = new Date("2026-09-22T16:00:00Z");
// 2026-09-23 00:30 UTC is still 2026-09-22 20:30 in Michigan.
const LATE_EVENING_ET = new Date("2026-09-23T00:30:00Z");

describe("venue today", () => {
  it("is the venue's date, not UTC's", () => {
    assert.equal(venueTodayKey(LATE_EVENING_ET), "2026-09-22");
  });
});

describe("createdWithinTimeframe", () => {
  it("counts today by the venue's calendar day", () => {
    // 03:30 UTC on the 22nd is 23:30 on the 21st in Michigan: yesterday.
    assert.equal(
      createdWithinTimeframe("2026-09-22T03:30:00Z", "today", undefined, undefined, NOON_ET),
      false,
    );
    assert.equal(
      createdWithinTimeframe("2026-09-22T04:30:00Z", "today", undefined, undefined, NOON_ET),
      true,
    );
  });

  it("keeps a booking made late in the venue's evening on that day", () => {
    assert.equal(
      createdWithinTimeframe("2026-09-23T00:10:00Z", "today", undefined, undefined, LATE_EVENING_ET),
      true,
    );
  });

  it("treats a custom range as inclusive venue days on both ends", () => {
    const within = (iso: string) =>
      createdWithinTimeframe(iso, "custom", "2026-09-20", "2026-09-21", NOON_ET);
    assert.equal(within("2026-09-20T05:00:00Z"), true);
    assert.equal(within("2026-09-22T03:59:00Z"), true); // 23:59 on the 21st, ET
    assert.equal(within("2026-09-22T04:01:00Z"), false); // 00:01 on the 22nd, ET
    assert.equal(within("2026-09-20T03:00:00Z"), false); // 23:00 on the 19th, ET
  });

  it("measures rolling windows in exact hours", () => {
    assert.equal(
      createdWithinTimeframe("2026-09-21T16:30:00Z", "last_24h", undefined, undefined, NOON_ET),
      true,
    );
    assert.equal(
      createdWithinTimeframe("2026-09-21T15:30:00Z", "last_24h", undefined, undefined, NOON_ET),
      false,
    );
  });

  it("lets everything through for all time, and nothing without a date", () => {
    assert.equal(createdWithinTimeframe(null, "all_time"), true);
    assert.equal(createdWithinTimeframe(null, "today"), false);
    assert.equal(createdWithinTimeframe("not a date", "last_7d"), false);
  });
});

describe("filterNewBookings", () => {
  it("drops cancelled bookings", () => {
    const rows = [
      { id: 1, createdAt: "2026-09-22T14:00:00Z", status: "confirmed" },
      { id: 2, createdAt: "2026-09-22T14:00:00Z", status: "cancelled" },
      { id: 3, createdAt: "2026-09-22T14:00:00Z", status: "Cancelled" },
    ];
    assert.deepEqual(
      filterNewBookings(rows, "today", undefined, undefined, NOON_ET).map((r) => r.id),
      [1],
    );
  });
});

describe("timeframeLabel", () => {
  it("names every timeframe the picker offers", () => {
    assert.equal(timeframeLabel("today"), "Today");
    assert.equal(timeframeLabel("custom"), "Custom Range");
  });
});
