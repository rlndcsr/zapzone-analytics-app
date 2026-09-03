import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VISIT_PERIOD_OPTIONS,
  visitPeriodScope,
  type WaiverTimeframe,
} from "./visitPeriod.ts";

describe("the visit period dropdown", () => {
  it("offers exactly the web Records page's periods, in its order", () => {
    assert.deepEqual(
      VISIT_PERIOD_OPTIONS.map((o) => o.value),
      ["today", "last_24h", "last_7d", "last_30d", "all_time", "custom"],
    );
  });

  it("labels them the way the web labels them", () => {
    assert.deepEqual(
      VISIT_PERIOD_OPTIONS.map((o) => o.label),
      [
        "Today",
        "Last 24 Hours",
        "Last 7 Days",
        "Last 30 Days",
        "All Time",
        "Custom Range",
      ],
    );
  });

  it("keeps Today and Last 24 Hours as separate periods", () => {
    // They resolve differently server-side — a calendar day against a rolling
    // window — so collapsing them would silently change what is counted.
    const today = visitPeriodScope("today");
    const rolling = visitPeriodScope("last_24h");
    assert.notDeepEqual(today, rolling);
  });
});

describe("turning a chosen period into request fields", () => {
  it("sends a rolling window as its timeframe", () => {
    assert.deepEqual(visitPeriodScope("last_7d"), { timeframe: "last_7d" });
    assert.deepEqual(visitPeriodScope("last_30d"), { timeframe: "last_30d" });
    assert.deepEqual(visitPeriodScope("last_24h"), { timeframe: "last_24h" });
  });

  it("sends Today as a timeframe, not as a single date", () => {
    const scope = visitPeriodScope("today");
    assert.equal(scope.timeframe, "today");
    assert.equal("date" in scope, false);
  });

  it("sends All Time as all=1, the way the web does", () => {
    const scope = visitPeriodScope("all_time");
    assert.equal(scope.all, true);
    // Never both — `all` alone tells the server to apply no window.
    assert.equal(scope.timeframe, undefined);
  });

  it("carries both endpoints for a custom range", () => {
    assert.deepEqual(visitPeriodScope("custom", "2026-01-01", "2026-01-31"), {
      timeframe: "custom",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  });

  it("omits a missing endpoint rather than sending it blank", () => {
    assert.deepEqual(visitPeriodScope("custom", "2026-01-01", ""), {
      timeframe: "custom",
      startDate: "2026-01-01",
    });
    assert.deepEqual(visitPeriodScope("custom"), { timeframe: "custom" });
  });

  it("ignores custom endpoints for every other period", () => {
    const scope = visitPeriodScope("last_7d", "2026-01-01", "2026-01-31");
    assert.deepEqual(scope, { timeframe: "last_7d" });
  });

  it("never sets more than one of all / timeframe", () => {
    for (const option of VISIT_PERIOD_OPTIONS) {
      const scope = visitPeriodScope(option.value, "2026-01-01", "2026-01-31");
      assert.notEqual(
        !!scope.all && !!scope.timeframe,
        true,
        `${option.value} set both all and timeframe`,
      );
    }
  });

  it("resolves every option in the dropdown to something requestable", () => {
    for (const option of VISIT_PERIOD_OPTIONS) {
      const scope = visitPeriodScope(option.value, "2026-01-01", "2026-01-31");
      assert.ok(
        scope.all || scope.timeframe,
        `${option.value} produced no scope`,
      );
    }
  });

  it("covers every timeframe the backend accepts", () => {
    const backendTimeframes: WaiverTimeframe[] = [
      "today",
      "last_24h",
      "last_7d",
      "last_30d",
      "all_time",
      "custom",
    ];
    for (const t of backendTimeframes) {
      assert.ok(
        VISIT_PERIOD_OPTIONS.some((o) => o.value === t),
        `${t} is missing from the dropdown`,
      );
    }
  });
});
