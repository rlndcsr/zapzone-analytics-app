import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCheckInEligible, outstandingBalanceOf } from "./bookingCheckIn.ts";

describe("isCheckInEligible", () => {
  it("allows only confirmed bookings, whatever their payment", () => {
    assert.equal(isCheckInEligible({ status: "confirmed" }), true);
    assert.equal(isCheckInEligible({ status: "Confirmed" }), true);
    assert.equal(isCheckInEligible({ status: "pending" }), false);
    assert.equal(isCheckInEligible({ status: "checked-in" }), false);
    assert.equal(isCheckInEligible({ status: "completed" }), false);
    assert.equal(isCheckInEligible({ status: "cancelled" }), false);
    assert.equal(isCheckInEligible({ status: null }), false);
  });
});

describe("outstandingBalanceOf", () => {
  it("is what is still owed on an unpaid or partly paid booking", () => {
    assert.equal(
      outstandingBalanceOf({ payment_status: "pending", total_amount: 100, amount_paid: 0 }),
      100,
    );
    assert.equal(
      outstandingBalanceOf({ payment_status: "partial", total_amount: "100.00", amount_paid: "40.50" }),
      59.5,
    );
  });

  it("is null when nothing is owed", () => {
    assert.equal(
      outstandingBalanceOf({ payment_status: "paid", total_amount: 100, amount_paid: 100 }),
      null,
    );
    assert.equal(
      outstandingBalanceOf({ payment_status: "partial", total_amount: 100, amount_paid: 99.999 }),
      null,
    );
    assert.equal(
      outstandingBalanceOf({ payment_status: "paid", total_amount: 100, amount_paid: 120 }),
      null,
    );
  });

  it("is null for refunded or voided bookings", () => {
    assert.equal(
      outstandingBalanceOf({ payment_status: "refunded", total_amount: 100, amount_paid: 0 }),
      null,
    );
    assert.equal(
      outstandingBalanceOf({ payment_status: "voided", total_amount: 100, amount_paid: 20 }),
      null,
    );
  });

  it("never invents a balance when the amounts are unknown", () => {
    assert.equal(outstandingBalanceOf({ payment_status: "pending" }), null);
    assert.equal(outstandingBalanceOf({ payment_status: "partial", total_amount: 100 }), null);
  });
});
