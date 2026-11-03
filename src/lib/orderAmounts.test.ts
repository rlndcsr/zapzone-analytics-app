import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampAmount,
  clampAmountText,
  editBalance,
  editPaidCeiling,
} from "./orderAmounts.ts";

describe("amount paid on an edit after a reschedule", () => {
  it("a total that went up leaves the paid amount alone and shows the balance due", () => {
    // Paid $40; moved off the special day, the total is now $52.
    assert.equal(clampAmount(40, editPaidCeiling(52, 40)), 40);
    assert.deepEqual(editBalance(52, 40), { kind: "due", amount: 12 });
  });

  it("a total that went down never cuts the recorded payment — it's a credit", () => {
    // Paid $52; moved onto a special day, the total is now $39.
    assert.equal(clampAmount(52, editPaidCeiling(39, 52)), 52);
    assert.deepEqual(editBalance(39, 52), { kind: "credit", amount: 13 });
  });

  it("still won't let staff type more than the larger of the two", () => {
    assert.equal(clampAmount(500, editPaidCeiling(39, 52)), 52);
    assert.equal(clampAmount(500, editPaidCeiling(60, 0)), 60);
  });

  it("is fully paid only when nothing is owed either way (no false 'paid')", () => {
    assert.deepEqual(editBalance(40, 40), { kind: "paid", amount: 0 });
    assert.deepEqual(editBalance(40, 39.99), { kind: "due", amount: 0.01 });
    assert.deepEqual(editBalance(0.004, 0), { kind: "paid", amount: 0 });
  });
});

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
