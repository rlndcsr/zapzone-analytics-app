import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchesMonthlyPattern,
  monthlyPatternLabel,
  scheduleCoversDate,
  scheduleDayEntries,
} from "./scheduleDays.ts";

const on = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

describe("matchesMonthlyPattern — the same dates the server accepts", () => {
  // The server's PackageScheduleDaysTest table (backend 2d214e7).
  const cases: [string, string, boolean][] = [
    ["first-sunday", "2026-10-04", true],
    ["first-sunday", "2026-10-11", false],
    ["second-sunday", "2026-10-11", true],
    ["third-wednesday", "2026-10-21", true],
    ["third-wednesday", "2026-10-14", false],
    ["fourth-sunday", "2026-10-25", true],
    ["last-sunday", "2026-10-25", true],
    ["last-saturday", "2026-10-31", true],
    ["last-saturday", "2026-10-24", false],
    ["last-tuesday", "2026-11-24", true],
    ["first-saturday", "2026-10-03", true],
    ["first-saturday", "2026-10-10", false],
    ["fourth-saturday", "2026-10-31", false],
    ["sunday-first", "2026-10-04", false],
    ["First-Sunday", "2026-10-04", true],
    ["sunday", "2026-10-04", false],
    ["first-monday", "2026-10-04", false],
  ];

  for (const [pattern, date, expected] of cases) {
    it(`${pattern} on ${date} → ${expected}`, () => {
      assert.equal(matchesMonthlyPattern(pattern, on(date)), expected);
    });
  }

  it("never matches something that is not a string", () => {
    assert.equal(matchesMonthlyPattern(5, on("2026-10-04")), false);
    assert.equal(matchesMonthlyPattern(null, on("2026-10-04")), false);
  });
});

describe("scheduleCoversDate", () => {
  it("covers every date for a daily schedule", () => {
    assert.equal(scheduleCoversDate({ availabilityType: "daily" }, on("2026-10-04")), true);
  });

  it("finds a monthly-only package's dates", () => {
    const monthly = { availabilityType: "monthly", dayConfiguration: ["first-saturday"] };
    assert.equal(scheduleCoversDate(monthly, on("2026-10-03")), true);
    assert.equal(scheduleCoversDate(monthly, on("2026-10-10")), false);
  });

  it("matches weekly days in any case", () => {
    const weekly = { availabilityType: "weekly", dayConfiguration: ["Sunday"] };
    assert.equal(scheduleCoversDate(weekly, on("2026-10-04")), true);
    assert.equal(scheduleCoversDate(weekly, on("2026-10-05")), false);
  });

  it("ignores malformed stored days instead of failing", () => {
    const monthly = { availabilityType: "monthly", dayConfiguration: [5, ["x"], "first-sunday"] };
    const weekly = { availabilityType: "weekly", dayConfiguration: [5, ["x"], "Sunday"] };
    assert.equal(scheduleCoversDate(monthly, on("2026-10-04")), true);
    assert.equal(scheduleCoversDate(monthly, on("2026-10-11")), false);
    assert.equal(scheduleCoversDate(weekly, on("2026-10-04")), true);
    assert.equal(scheduleCoversDate(weekly, on("2026-10-05")), false);
  });

  it("reads a day list stored as an object", () => {
    const weekly = { availabilityType: "weekly", dayConfiguration: { 0: "sunday" } };
    assert.equal(scheduleCoversDate(weekly, on("2026-10-04")), true);
  });

  it("covers nothing for an unknown type", () => {
    assert.equal(scheduleCoversDate({ availabilityType: "yearly" }, on("2026-10-04")), false);
  });
});

describe("scheduleDayEntries", () => {
  it("keeps only the strings", () => {
    assert.deepEqual(scheduleDayEntries(["monday", 3, null, "friday"]), ["monday", "friday"]);
    assert.deepEqual(scheduleDayEntries({ a: "monday" }), ["monday"]);
    assert.deepEqual(scheduleDayEntries(null), []);
    assert.deepEqual(scheduleDayEntries("monday"), []);
  });
});

describe("monthlyPatternLabel", () => {
  it("reads a monthly day the way staff say it", () => {
    assert.equal(monthlyPatternLabel("first-saturday"), "First Saturday");
    assert.equal(monthlyPatternLabel("LAST-friday"), "Last Friday");
    assert.equal(monthlyPatternLabel("first-saturday", true), "First Sat");
  });

  it("leaves anything that is not a pattern as stored", () => {
    assert.equal(monthlyPatternLabel("saturday"), "saturday");
  });
});
