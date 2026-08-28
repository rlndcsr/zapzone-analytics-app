import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clampAmount, clampAmountText } from "./orderAmounts.ts";

describe("clamping a money field", () => {
  it("leaves a value inside the range alone", () => {
    assert.equal(clampAmount("25.50", 100), 25.5);
  });

  it("floors a negative amount at zero", () => {
    assert.equal(clampAmount("-5", 100), 0);
    assert.equal(clampAmount(-0.01, 100), 0);
  });

  it("caps an amount above the order total", () => {
    assert.equal(clampAmount("500", 100), 100);
  });

  it("reads a blank or unparseable field as zero", () => {
    assert.equal(clampAmount("", 100), 0);
    assert.equal(clampAmount("abc", 100), 0);
    assert.equal(clampAmount(".", 100), 0);
    assert.equal(clampAmount(null, 100), 0);
    assert.equal(clampAmount(undefined, 100), 0);
  });

  it("leaves the value uncapped when there is no maximum", () => {
    assert.equal(clampAmount("500", null), 500);
    assert.equal(clampAmount("500"), 500);
  });

  it("clamps to zero when the order total is itself zero", () => {
    assert.equal(clampAmount("40", 0), 0);
  });

  it("never returns a negative cap on a negative total", () => {
    assert.equal(clampAmount("40", -10), 0);
  });
});

describe("rendering a clamped amount back into the field", () => {
  it("keeps whole amounts free of trailing decimals", () => {
    assert.equal(clampAmountText("40", 100), "40");
    assert.equal(clampAmountText("", 100), "0");
  });

  it("renders a fractional amount to cents", () => {
    assert.equal(clampAmountText("25.5", 100), "25.50");
  });

  it("renders the cap when the typed amount exceeds it", () => {
    assert.equal(clampAmountText("999", 12.75), "12.75");
  });
});
