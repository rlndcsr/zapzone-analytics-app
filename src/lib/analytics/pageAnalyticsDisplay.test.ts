import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDuration,
  formatPercent,
  formatWhen,
  mergeAttribution,
  pageRange,
  shortDay,
} from "./pageAnalyticsDisplay.ts";

describe("mergeAttribution", () => {
  const t = (source: string | null, medium: string | null, campaign: string | null, revenue: number) => ({
    source,
    medium,
    campaign,
    revenue,
  });

  it("joins first and last touch per source and sorts by combined revenue", () => {
    const rows = mergeAttribution(
      [t("chatgpt.com", null, null, 170), t("google", "cpc", "spring", 40)],
      [t("google", "cpc", "spring", 60), t("facebook", "social", null, 20)],
    );
    assert.deepEqual(
      rows.map((r) => [r.label, r.firstTouch, r.lastTouch]),
      [
        ["chatgpt.com/—", 170, 0],
        ["google/cpc · spring", 40, 60],
        ["facebook/social", 0, 20],
      ],
    );
  });

  it("labels a missing source as direct, and keeps the top rows only", () => {
    const many = Array.from({ length: 12 }, (_, i) => t(`s${i}`, "m", null, i));
    assert.equal(mergeAttribution(many, []).length, 10);
    assert.equal(mergeAttribution([t(null, null, null, 5)], [])[0].label, "direct/—");
  });

  it("is empty when nothing converted", () => {
    assert.deepEqual(mergeAttribution([], []), []);
  });
});

describe("pageRange", () => {
  // Midday UTC, so the local and UTC calendar days agree in any timezone.
  const now = new Date(Date.UTC(2026, 10, 16, 12, 0, 0));

  it("counts today in, like the web's presets", () => {
    assert.deepEqual(pageRange({ dateRange: "7d" }, now), { from: "2026-11-10", to: "2026-11-16" });
    assert.deepEqual(pageRange({ dateRange: "30d" }, now), { from: "2026-10-18", to: "2026-11-16" });
    assert.deepEqual(pageRange({ dateRange: "90d" }, now), { from: "2026-08-19", to: "2026-11-16" });
    assert.deepEqual(pageRange({ dateRange: "1y" }, now), { from: "2025-11-17", to: "2026-11-16" });
  });

  it("sends a custom range's own dates", () => {
    assert.deepEqual(
      pageRange({ dateRange: "custom", start: "2026-01-01", end: "2026-01-31" }, now),
      { from: "2026-01-01", to: "2026-01-31" },
    );
  });
});

describe("formatDuration", () => {
  it("matches the web", () => {
    assert.equal(formatDuration(850), "850ms");
    assert.equal(formatDuration(0), "0ms");
    assert.equal(formatDuration(42_000), "42s");
    assert.equal(formatDuration(375_000), "6m 15s");
  });
});

describe("formatPercent", () => {
  it("keeps one decimal", () => {
    assert.equal(formatPercent(12), "12.0%");
    assert.equal(formatPercent(3.456), "3.5%");
    assert.equal(formatPercent(Number.NaN), "0.0%");
  });
});

describe("formatWhen", () => {
  const now = new Date(2026, 10, 16, 18, 0);
  it("says today / yesterday, else the date", () => {
    assert.equal(formatWhen(new Date(2026, 10, 16, 15, 5).toISOString(), now), "Today at 3:05 PM");
    assert.equal(formatWhen(new Date(2026, 10, 15, 0, 12).toISOString(), now), "Yesterday at 12:12 AM");
    assert.equal(formatWhen(new Date(2026, 10, 3, 14, 15).toISOString(), now), "Nov 3 at 2:15 PM");
    assert.equal(formatWhen(new Date(2025, 0, 2, 9, 0).toISOString(), now), "Jan 2, 2025 at 9:00 AM");
  });

  it("copes with missing or odd values", () => {
    assert.equal(formatWhen(null, now), "—");
    assert.equal(formatWhen("not a date", now), "not a date");
  });
});

describe("shortDay", () => {
  it("shortens dates and leaves anything else alone", () => {
    assert.equal(shortDay("2026-07-09"), "Jul 9");
    assert.equal(shortDay("2026-07-09T05:00:00Z"), "Jul 9");
    assert.equal(shortDay("14:00"), "14:00");
  });
});
