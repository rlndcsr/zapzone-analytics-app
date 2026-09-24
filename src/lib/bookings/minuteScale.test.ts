import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMinuteScale } from "./minuteScale.ts";

const span = (startMinutes: number, endMinutes: number, minHeight = 54) => ({
  startMinutes,
  endMinutes,
  minHeight,
});

describe("buildMinuteScale", () => {
  it("is a straight line with nothing to stretch", () => {
    const scale = buildMinuteScale(600, 780, 3);
    assert.equal(scale.height, 180 * 3);
    assert.equal(scale.at(660), 180);
    assert.equal(scale.minuteAt(180), 660);
  });

  it("grows only the minutes a short span covers", () => {
    const scale = buildMinuteScale(600, 780, 3, [span(660, 675)]);
    assert.equal(scale.spanHeight(600, 660), 180);
    assert.equal(scale.spanHeight(660, 675), 54);
    assert.equal(scale.spanHeight(675, 780), 315);
    assert.equal(scale.height, 180 + 54 + 315);
  });

  it("leaves a span alone when the base rate already gives it room", () => {
    const scale = buildMinuteScale(600, 780, 3, [span(660, 690)]);
    assert.equal(scale.height, 180 * 3);
  });

  it("lets the span needing more room set the rate where two overlap", () => {
    const scale = buildMinuteScale(600, 780, 3, [span(660, 675), span(670, 690)]);
    assert.ok(scale.spanHeight(660, 675) >= 54);
    assert.ok(scale.spanHeight(670, 690) >= 54);
    assert.equal(scale.spanHeight(600, 660), 180);
  });

  it("clips a span to the drawn day", () => {
    const scale = buildMinuteScale(600, 780, 3, [span(590, 605)]);
    assert.equal(scale.spanHeight(600, 605), 54);
  });

  it("keeps the base rate outside the drawn day", () => {
    const scale = buildMinuteScale(600, 780, 3, [span(660, 675)]);
    assert.equal(scale.at(590), -30);
    assert.equal(scale.at(790), scale.height + 30);
    assert.equal(scale.minuteAt(-30), 590);
  });

  it("is monotonic and inverts itself everywhere", () => {
    const scale = buildMinuteScale(600, 1200, 2.4, [
      span(630, 645),
      span(700, 705),
      span(702, 720),
      span(900, 1000, 400),
    ]);
    let previous = -Infinity;
    for (let m = 600; m <= 1200; m += 0.5) {
      const px = scale.at(m);
      assert.ok(px >= previous);
      assert.ok(Math.abs(scale.minuteAt(px) - m) < 1e-9);
      previous = px;
    }
    assert.ok(Math.abs(scale.at(1200) - scale.height) < 1e-9);
  });
});
