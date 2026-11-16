import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BREAKDOWN_PALETTE,
  breakdownRows,
  metricLine,
} from "./performanceDisplay.ts";

describe("metricLine", () => {
  it("turns a rise into a green delta measured against the previous period", () => {
    assert.deepEqual(metricLine({ change: "+12.5%", info: null }), {
      delta: { text: "+12.5%", tone: "up" },
      hint: "vs previous period",
    });
  });

  it("turns a fall into a red delta", () => {
    assert.deepEqual(metricLine({ change: "-3.0%", info: null }), {
      delta: { text: "-3.0%", tone: "down" },
      hint: "vs previous period",
    });
  });

  it("keeps a zero change grey, whatever its sign", () => {
    for (const change of ["0%", "+0.0%", "-0.0%"]) {
      assert.equal(metricLine({ change, info: null }).delta?.tone, "neutral", change);
    }
  });

  it("reads thousands commas from number_format", () => {
    assert.deepEqual(metricLine({ change: "+1,250.0%", info: null }).delta, {
      text: "+1,250.0%",
      tone: "up",
    });
  });

  it("uses the words after the percentage as the hint", () => {
    assert.deepEqual(
      metricLine({ change: "+12.5% vs last period", info: null }),
      { delta: { text: "+12.5%", tone: "up" }, hint: "vs last period" },
    );
  });

  it("shows a non-percentage change as a plain note", () => {
    assert.deepEqual(metricLine({ change: "3 of 5 active", info: "ignored" }), {
      hint: "3 of 5 active",
    });
  });

  it("falls back to info, then to nothing", () => {
    assert.deepEqual(metricLine({ change: null, info: "2 new packages" }), {
      hint: "2 new packages",
    });
    assert.deepEqual(metricLine({ change: null, info: null }), { hint: "" });
    assert.deepEqual(metricLine({ change: "  ", info: null }), { hint: "" });
  });

  it("takes a custom comparison", () => {
    assert.equal(metricLine({ change: "+1%", info: null }, "vs last week").hint, "vs last week");
  });
});

describe("breakdownRows", () => {
  it("drops zero parts and shares the rest of the total", () => {
    const rows = breakdownRows([
      { label: "Confirmed", value: 3 },
      { label: "Pending", value: 0 },
      { label: "Cancelled", value: 1 },
    ]);
    assert.deepEqual(
      rows.map((r) => [r.label, r.value, r.share, r.percent]),
      [
        ["Confirmed", 3, 0.75, 75],
        ["Cancelled", 1, 0.25, 25],
      ],
    );
  });

  it("returns nothing when every part is zero", () => {
    assert.deepEqual(breakdownRows([{ label: "A", value: 0 }]), []);
    assert.deepEqual(breakdownRows([]), []);
  });

  it("uses the backend colour when valid, else the palette by position", () => {
    const rows = breakdownRows([
      { label: "A", value: 1, color: "#ef4444" },
      { label: "B", value: 1, color: "red" },
      { label: "C", value: 1, color: null },
    ]);
    assert.deepEqual(
      rows.map((r) => r.color),
      ["#ef4444", BREAKDOWN_PALETTE[1], BREAKDOWN_PALETTE[2]],
    );
  });

  it("keeps keys unique when labels repeat", () => {
    const rows = breakdownRows([
      { label: "Kiosk", value: 1 },
      { label: "Kiosk", value: 2 },
    ]);
    assert.equal(new Set(rows.map((r) => r.key)).size, 2);
  });
});
