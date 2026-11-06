import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyticsViewState,
  exportBlockReason,
  formatClockTime,
  formatMoney,
  formatNumber,
  kpiDisplay,
  parseChangePercent,
  periodLabel,
  queryKey,
  rankedRows,
  segmentRows,
  sliceColor,
  statusRows,
} from "./customerAnalyticsDisplay.ts";
import { isLabelShown, labelStride, nearestIndex } from "../charts/chartAxis.ts";

describe("parseChangePercent", () => {
  it("reads the server's signed percentage strings", () => {
    assert.equal(parseChangePercent("+12.5%"), 12.5);
    assert.equal(parseChangePercent("-3%"), -3);
    assert.equal(parseChangePercent("+0%"), 0);
    assert.equal(parseChangePercent(" 7 % "), 7);
  });

  it("returns null for an empty or unreadable change", () => {
    assert.equal(parseChangePercent(""), null);
    assert.equal(parseChangePercent(undefined), null);
    assert.equal(parseChangePercent("n/a"), null);
  });
});

describe("kpiDisplay", () => {
  it("colours a like-for-like change by its sign", () => {
    assert.equal(kpiDisplay({ label: "Total Revenue", change: "+12.5%" }).tone, "up");
    assert.equal(kpiDisplay({ label: "Total Revenue", change: "-4%" }).tone, "down");
    assert.equal(kpiDisplay({ label: "Repeat Rate", change: "-1.2%" }).tone, "down");
  });

  it("keeps a 0% change neutral even though the server calls it 'up'", () => {
    assert.equal(kpiDisplay({ label: "Total Revenue", change: "+0%" }).tone, "neutral");
  });

  it("keeps changes that don't compare like with like neutral", () => {
    assert.equal(kpiDisplay({ label: "Total Customers", change: "+40%" }).tone, "neutral");
    assert.equal(kpiDisplay({ label: "Avg. Revenue/Customer", change: "-15%" }).tone, "neutral");
  });

  it("names the window each change is measured against", () => {
    assert.equal(kpiDisplay({ label: "Active Customers", change: "+5%" }).comparison, "vs prior 30 days");
    assert.equal(kpiDisplay({ label: "Repeat Rate", change: "+5%" }).comparison, "vs last month");
    assert.equal(kpiDisplay({ label: "Total Revenue", change: "+5%" }).comparison, "vs prev. period");
  });

  it("passes the server's change through untouched", () => {
    assert.equal(kpiDisplay({ label: "Total Revenue", change: "+12.5%" }).delta, "+12.5%");
  });

  it("handles a KPI it doesn't know without guessing", () => {
    const d = kpiDisplay({ label: "Something New", change: "+9%" });
    assert.equal(d.tone, "neutral");
    assert.equal(d.info, undefined);
    assert.equal(d.delta, "+9%");
  });

  it("says so when there is no change to show", () => {
    const d = kpiDisplay({ label: "Total Revenue", change: "" });
    assert.equal(d.delta, "");
    assert.equal(d.tone, "neutral");
    assert.equal(d.comparison, "No comparison");
  });

  it("explains every KPI the server sends today", () => {
    for (const label of [
      "Total Customers",
      "Active Customers",
      "Total Revenue",
      "Repeat Rate",
      "Avg. Revenue/Customer",
      "New Customers (30d)",
    ]) {
      assert.ok(kpiDisplay({ label, change: "+1%" }).info, `${label} has no explanation`);
    }
  });
});

describe("statusRows", () => {
  it("keeps each count as sent and never derives a share", () => {
    const rows = statusRows([
      { status: "active", count: 12, color: "#10b981" },
      { status: "inactive", count: 30, color: "#ef4444" },
      { status: "new", count: 12, color: "#3b82f6" },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.label, r.count]),
      [["Active", 12], ["Inactive", 30], ["New", 12]],
    );
    assert.ok(rows.every((r) => !("share" in r) && !("percent" in r)));
  });

  it("uses the server's colours, falling back when one is missing or junk", () => {
    const [active, inactive] = statusRows([
      { status: "active", count: 1, color: "#10b981" },
      { status: "inactive", count: 1, color: "red; drop" },
    ]);
    assert.equal(active.color, "#10b981");
    assert.equal(inactive.color, "#EF4444");
  });

  it("title-cases a status it doesn't know and gives no definition", () => {
    const [row] = statusRows([{ status: "at_risk", count: 3 }]);
    assert.equal(row.label, "At Risk");
    assert.equal(row.description, undefined);
  });
});

describe("segmentRows", () => {
  it("shows the server's percentages as sent, with the documented spend bands", () => {
    const rows = segmentRows([
      { segment: "High Value", value: 10 },
      { segment: "Medium Value", value: 23 },
      { segment: "Low Value", value: 67 },
    ]);
    assert.deepEqual(rows.map((r) => r.percent), [10, 23, 67]);
    assert.equal(rows[0].threshold, "$1,000 or more spent");
    assert.equal(rows[2].threshold, "Under $500 spent");
  });

  it("sizes the bar from the values even when rounding misses 100", () => {
    const rows = segmentRows([
      { segment: "High Value", value: 33 },
      { segment: "Low Value", value: 33 },
    ]);
    assert.equal(rows[0].share, 0.5);
  });

  it("invents no band for an unknown segment and handles all zeros", () => {
    const [row] = segmentRows([{ segment: "VIP", value: 0 }]);
    assert.equal(row.threshold, undefined);
    assert.equal(row.share, 0);
  });
});

describe("rankedRows", () => {
  it("ranks by the server's order without re-sorting", () => {
    const rows = rankedRows([
      { name: "Pat", value: 3 },
      { name: "Sam", value: 5 },
    ]);
    assert.deepEqual(rows.map((r) => [r.rank, r.name]), [[1, "Pat"], [2, "Sam"]]);
  });

  it("sizes bars against the largest value", () => {
    const rows = rankedRows([
      { name: "A", value: 8 },
      { name: "B", value: 2 },
    ]);
    assert.deepEqual(rows.map((r) => r.share), [1, 0.25]);
    assert.deepEqual(rankedRows([]), []);
    assert.equal(rankedRows([{ name: "A", value: 0 }])[0].share, 0);
  });
});

describe("chart helpers", () => {
  it("thins labels without dropping points", () => {
    assert.equal(labelStride(24, 6), 4);
    assert.equal(labelStride(9, 9), 1);
    assert.equal(labelStride(9, 5), 2);
    assert.equal(labelStride(0, 5), 1);
    assert.deepEqual(
      Array.from({ length: 9 }, (_, i) => i).filter((i) => isLabelShown(i, 2)),
      [0, 2, 4, 6, 8],
    );
  });

  it("maps a tap to the nearest point and clamps outside the plot", () => {
    // 9 points across 0..240 → one every 30px, plot starting at x=34.
    assert.equal(nearestIndex(34, 9, 34, 240), 0);
    assert.equal(nearestIndex(34 + 44, 9, 34, 240), 1);
    assert.equal(nearestIndex(34 + 46, 9, 34, 240), 2);
    assert.equal(nearestIndex(0, 9, 34, 240), 0);
    assert.equal(nearestIndex(9999, 9, 34, 240), 8);
    assert.equal(nearestIndex(100, 1, 34, 240), 0);
  });

  it("formats readout values", () => {
    assert.equal(formatMoney(1234.5), "$1,234.50");
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(-12), "-$12.00");
    assert.equal(formatNumber(1234567), "1,234,567");
    assert.equal(formatNumber(12.345), "12.35");
  });
});

describe("period and stale data", () => {
  it("labels presets and custom ranges", () => {
    assert.equal(periodLabel({ dateRange: "30d" }), "Last 30 days");
    assert.equal(periodLabel({ dateRange: "1y" }), "Last year");
    assert.equal(
      periodLabel({ dateRange: "custom", start: "2026-03-01", end: "2026-03-31" }),
      "Mar 1, 2026 – Mar 31, 2026",
    );
    assert.equal(periodLabel({ dateRange: "custom" }), "Custom range");
  });

  it("keys a request by its period, dates and location", () => {
    assert.notEqual(queryKey({ dateRange: "30d" }), queryKey({ dateRange: "7d" }));
    assert.notEqual(queryKey({ dateRange: "30d" }), queryKey({ dateRange: "30d", locationId: 4 }));
    assert.notEqual(
      queryKey({ dateRange: "custom", start: "2026-01-01", end: "2026-01-31" }),
      queryKey({ dateRange: "custom", start: "2026-02-01", end: "2026-02-28" }),
    );
  });

  const base = { loading: false, error: null, hasData: true, loadedKey: "30d|all", currentKey: "30d|all" };

  it("shows the skeleton on first load and a full error only when nothing has loaded", () => {
    assert.equal(analyticsViewState({ ...base, hasData: false, loading: true }).body, "skeleton");
    assert.equal(analyticsViewState({ ...base, hasData: false, error: "boom" }).body, "error");
  });

  it("marks old figures stale while a new period loads", () => {
    const s = analyticsViewState({ ...base, loading: true, currentKey: "7d|all" });
    assert.deepEqual(s, { body: "content", stale: true, updating: true, banner: false });
  });

  it("keeps them marked stale, with a banner, when the new period fails", () => {
    const s = analyticsViewState({ ...base, error: "boom", currentKey: "7d|all" });
    assert.deepEqual(s, { body: "content", stale: true, updating: false, banner: true });
  });

  it("doesn't dim a same-period refresh, but still reports its failure", () => {
    assert.deepEqual(analyticsViewState({ ...base, loading: true }), {
      body: "content",
      stale: false,
      updating: true,
      banner: false,
    });
    assert.equal(analyticsViewState({ ...base, error: "boom" }).banner, true);
    assert.equal(analyticsViewState({ ...base, error: "boom" }).stale, false);
  });

  it("formats the updated time", () => {
    assert.equal(formatClockTime(new Date(2026, 0, 1, 0, 5)), "12:05 AM");
    assert.equal(formatClockTime(new Date(2026, 0, 1, 15, 30)), "3:30 PM");
  });
});

describe("exportBlockReason", () => {
  const ok = { sections: ["customers"], dateRange: "all", start: "", end: "" };

  it("allows a normal export", () => {
    assert.equal(exportBlockReason(ok), null);
  });

  it("blocks an export with no sections", () => {
    assert.equal(exportBlockReason({ ...ok, sections: [] }), "Select at least one section to export.");
  });

  it("blocks a custom range until both dates are picked", () => {
    assert.match(exportBlockReason({ ...ok, dateRange: "custom", start: "2026-01-01" }) ?? "", /start and end/);
    assert.equal(exportBlockReason({ ...ok, dateRange: "custom", start: "2026-01-01", end: "2026-01-31" }), null);
  });
});

describe("sliceColor", () => {
  it("accepts 3- and 6-digit hex only", () => {
    assert.equal(sliceColor("#abc", "#000"), "#abc");
    assert.equal(sliceColor(" #A1B2C3 ", "#000"), "#A1B2C3");
    assert.equal(sliceColor("blue", "#000"), "#000");
    assert.equal(sliceColor(undefined, "#000"), "#000");
  });
});
