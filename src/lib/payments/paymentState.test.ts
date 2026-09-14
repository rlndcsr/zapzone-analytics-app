import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  derivePaymentStatus,
  resolvePaymentState,
} from "./paymentState.ts";

describe("resolvePaymentState — the money cases", () => {
  it("calls a fully settled booking paid, in green", () => {
    const v = resolvePaymentState({ total_amount: 120, amount_paid: 120 });
    assert.equal(v.state, "paid");
    assert.equal(v.label, "Paid in Full");
    assert.equal(v.isSettled, true);
    assert.equal(v.balance, 0);
    assert.equal(v.balanceLabel, "Paid in Full");
    assert.match(v.pillClass, /green/);
  });

  it("calls a part payment partial, in red — not amber", () => {
    const v = resolvePaymentState({ total_amount: 120, amount_paid: 40 });
    assert.equal(v.state, "partial");
    assert.equal(v.label, "Partially Paid");
    assert.equal(v.balance, 80);
    assert.equal(v.balanceLabel, "Balance Due");
    assert.match(v.pillClass, /red/);
    assert.doesNotMatch(v.pillClass, /amber|yellow|orange/);
  });

  it("calls an untouched booking unpaid, in red — not grey", () => {
    const v = resolvePaymentState({ total_amount: 120, amount_paid: 0 });
    assert.equal(v.state, "pending");
    assert.equal(v.label, "Unpaid");
    assert.match(v.pillClass, /red/);
    assert.doesNotMatch(v.pillClass, /gray|grey|slate/);
  });

  it("settles a balance inside half a cent, which a bare >= would not", () => {
    // The case the old rule got wrong: JSON floats leave a fully paid booking
    // a hair short, and `amountPaid >= total` then reads partial forever.
    const v = resolvePaymentState({
      total_amount: 100.1,
      amount_paid: 100.09999999,
    });
    assert.equal(v.state, "paid");
  });

  it("still owes money one cent short", () => {
    const v = resolvePaymentState({ total_amount: 100, amount_paid: 99.99 });
    assert.equal(v.state, "partial");
    assert.equal(v.balance, 0.01);
  });

  it("treats a zero-total booking as paid, not pending", () => {
    // BookingsTable's old rule returned "pending" here (amountPaid <= 0),
    // painting a comped booking as though the desk still had to collect.
    const v = resolvePaymentState({ total_amount: 0, amount_paid: 0 });
    assert.equal(v.state, "paid");
    assert.equal(v.isSettled, true);
  });

  it("flags an overpayment as credit due rather than just paid", () => {
    const v = resolvePaymentState({ total_amount: 100, amount_paid: 130 });
    assert.equal(v.state, "paid");
    assert.equal(v.balance, -30);
    assert.equal(v.balanceLabel, "Credit Due");
  });
});

describe("resolvePaymentState — states the money cannot express", () => {
  it("keeps a refund refunded, whatever the amounts say", () => {
    const v = resolvePaymentState({
      payment_status: "refunded",
      total_amount: 120,
      amount_paid: 120,
    });
    assert.equal(v.state, "refunded");
    assert.equal(v.label, "Refunded");
    assert.equal(v.isTerminal, true);
    assert.equal(v.isSettled, true);
    assert.match(v.pillClass, /slate/);
  });

  it("keeps a void voided even with nothing paid", () => {
    const v = resolvePaymentState({
      payment_status: "voided",
      total_amount: 120,
      amount_paid: 0,
    });
    assert.equal(v.state, "voided");
    assert.equal(v.label, "Voided");
    assert.equal(v.isTerminal, true);
  });

  it("is case-insensitive about the stored status", () => {
    assert.equal(
      resolvePaymentState({ payment_status: "REFUNDED", total_amount: 1, amount_paid: 0 }).state,
      "refunded",
    );
  });
});

describe("resolvePaymentState — payloads with no amounts", () => {
  it("falls back to the stored status rather than reading absent as zero", () => {
    const v = resolvePaymentState({ payment_status: "paid" });
    assert.equal(v.state, "paid");
    assert.equal(v.label, "Paid in Full");
    assert.equal(v.isSettled, true);
    assert.match(v.pillClass, /green/);
  });

  it("keeps a stored partial partial", () => {
    const v = resolvePaymentState({ payment_status: "partial" });
    assert.equal(v.state, "partial");
    assert.equal(v.label, "Partially Paid");
  });

  it("defaults to pending when there is nothing to go on at all", () => {
    const v = resolvePaymentState({});
    assert.equal(v.state, "pending");
    assert.equal(v.label, "Unpaid");
  });

  it("a null amount counts as absent, not as zero", () => {
    const v = resolvePaymentState({ payment_status: "paid", total_amount: 80, amount_paid: null });
    assert.equal(v.state, "paid");
  });

  it("a terminal status still wins when the amounts are missing", () => {
    const v = resolvePaymentState({ payment_status: "voided" });
    assert.equal(v.state, "voided");
    assert.equal(v.isTerminal, true);
  });
});

describe("resolvePaymentState — money off the wire", () => {
  it("accepts the strings Laravel serializes decimals as", () => {
    const v = resolvePaymentState({ total_amount: "120.00", amount_paid: "60.00" });
    assert.equal(v.state, "partial");
    assert.equal(v.total, 120);
    assert.equal(v.balance, 60);
  });

  it("treats an unparseable amount as zero instead of NaN", () => {
    const v = resolvePaymentState({ total_amount: "abc", amount_paid: "oops" });
    assert.equal(v.total, 0);
    assert.equal(v.amountPaid, 0);
    assert.equal(v.state, "paid");
  });
});

describe("derivePaymentStatus", () => {
  it("agrees with resolvePaymentState on every ordinary case", () => {
    assert.equal(derivePaymentStatus(0, 100), "pending");
    assert.equal(derivePaymentStatus(50, 100), "partial");
    assert.equal(derivePaymentStatus(100, 100), "paid");
    assert.equal(derivePaymentStatus(0, 0), "paid");
  });
});
