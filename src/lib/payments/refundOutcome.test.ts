import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blockedPeriodWarning } from "../blockedPeriodPrompt.ts";
import { requiresChangeReason } from "../changeReasonPrompt.ts";
import {
  classifyRefundOutcome,
  parseAmount,
  refundAttemptFromError,
  refundOutcomeNotice,
  type RefundAttempt,
  type RefundOutcome,
} from "./refundOutcome.ts";

// Response shapes copied from zapzone-backend@2bbd0fa PaymentController::refund
// and the middleware in front of it (spec 002, contracts/refund-response.md).
const ok = (body: unknown): RefundAttempt => ({ kind: "ok", body });
const err = (status: number, body: unknown): RefundAttempt => ({ kind: "error", status, body });

const REFUNDED = {
  success: true,
  message: "Full refund processed successfully",
  data: { original_payment: { id: 9 }, refund_payment: { id: 41 } },
  refund_transaction_id: "60200000001",
  refund_amount: "50.00",
  total_refunded: "50.00",
  remaining_balance: 0,
  is_full_refund: true,
  payable_cancelled: true,
  payable: null,
};
const VOIDED = {
  success: true,
  message: "Transaction was unsettled — voided successfully instead of refunded",
  data: { original_payment: { id: 9 }, void_payment: { id: 42 } },
  void_amount: "50.00",
  was_void_fallback: true,
  payable_cancelled: true,
  payable: null,
};

/** Every status-bearing fixture, labelled with the row it must produce. */
const FIXTURES: [string, RefundAttempt][] = [
  ["S3", ok(REFUNDED)],
  ["S3", ok({ ...REFUNDED, data: {} })],
  ["S1", ok(VOIDED)],
  ["S2", ok({ ...VOIDED, payable_cancelled: false })],
  ["S2", ok({ ...VOIDED, payable_cancelled: undefined })],
  ["S2", ok({ ...VOIDED, payable_cancelled: "yes" })],
  ["F1", err(400, { success: false, message: "Only completed payments can be refunded" })],
  [
    "F1",
    err(400, {
      success: false,
      message: "Refund amount cannot exceed the remaining refundable balance of $10.00",
      data: { original_amount: 50, total_already_refunded: 40, max_refundable: 10 },
    }),
  ],
  [
    "F1",
    err(400, {
      success: false,
      message: "Unable to determine card details for this transaction.",
      error_code: "MISSING_CARD_LAST_FOUR",
    }),
  ],
  ["F1", err(400, { success: false, message: "This transaction cannot be refunded.", error_code: null })],
  [
    "F2",
    err(400, {
      success: false,
      message: "The referenced transaction does not meet the criteria for issuing a credit.",
      error_code: "E00040",
      transaction_error_code: "54",
      is_unsettled: false,
    }),
  ],
  ["F3", err(403, { success: false, message: "This area is for staff accounts only." })],
  ["F3", err(403, { success: false, message: "Forbidden: this payment is not linked to a location." })],
  ["F3", err(404, { message: "No query results for model [App\\Models\\Payment] 9" })],
  ["F3", err(422, { success: false, message: "This gift card no longer has enough balance." })],
  ["F3", err(422, { message: "The amount field must be at least 0.01.", errors: { amount: ["…"] } })],
  ["F4", err(503, { success: false, message: "No active Authorize.Net account found for this location" })],
  [
    "F5",
    err(500, {
      success: false,
      message: "Payment configuration error. Please contact support.",
      error_code: "DECRYPTION_FAILED",
    }),
  ],
  ["U2", err(502, null)],
  ["U2", err(504, null)],
  ["U2", err(503, null)],
  ["U3", err(500, { success: false, message: "Refund processing failed: SQLSTATE[HY000]" })],
  ["U3", err(500, { message: "Server Error" })],
  [
    "U4",
    err(400, {
      success: false,
      message: "Unknown error",
      error_code: null,
      transaction_error_code: null,
      is_unsettled: false,
    }),
  ],
  ["U4", err(400, { success: false, message: "Unknown error", is_unsettled: false })],
  [
    "U5",
    err(400, {
      success: false,
      message: "This transaction has not settled yet and could not be voided automatically.",
      error_code: "E00027",
      transaction_error_code: null,
      is_unsettled: true,
    }),
  ],
  ["U6", ok(null)],
  ["U6", ok([REFUNDED])],
  ["U6", ok({ ...REFUNDED, success: false })],
  ["U6", ok({ ...REFUNDED, success: "true" })],
  ["U6", ok({ ...VOIDED, was_void_fallback: false })],
  ["U6", ok({ ...VOIDED, was_void_fallback: "true" })],
  ["U6", err(400, { success: false, message: "x", is_unsettled: "no" })],
  ["U6", err(400, { success: false, message: "x", is_unsettled: false, error_code: "" })],
  ["U6", err(400, null)],
  ["U6", err(400, { message: "no success key" })],
  ["U6", err(403, null)],
  ["U6", err(403, { message: "Forbidden" })],
  ["U6", err(404, null)],
  ["U6", err(404, { success: false, message: "nope" })],
  ["U6", err(404, { message: 404 })],
  ["U6", err(422, null)],
  ["U6", err(422, { message: "Unprocessable" })],
  ["U6", err(401, { message: "Unauthenticated." })],
  ["U6", err(418, { success: false, message: "teapot" })],
  ["U6", err(409, { success: false, was_void_fallback: true })],
];

describe("classifyRefundOutcome — every outcome-table row", () => {
  for (const [row, attempt] of FIXTURES) {
    const label =
      attempt.kind === "error" ? `${attempt.status} ${JSON.stringify(attempt.body)}` : JSON.stringify(attempt);
    it(`${row} ← ${label.slice(0, 90)}`, () => {
      assert.equal(classifyRefundOutcome(attempt).row, row);
    });
  }

  it("U1: no answer at all is unknown", () => {
    assert.deepEqual(classifyRefundOutcome({ kind: "no_answer" }), { kind: "unknown", row: "U1" });
  });

  it("never treats an unknown row as a confirmed failure", () => {
    for (const [row, attempt] of FIXTURES) {
      if (row.startsWith("U")) assert.equal(classifyRefundOutcome(attempt).kind, "unknown");
    }
  });

  it("S1/S2 report cancellation only when payable_cancelled === true", () => {
    const s1 = classifyRefundOutcome(ok(VOIDED));
    const s2 = classifyRefundOutcome(ok({ ...VOIDED, payable_cancelled: 1 }));
    assert.equal(s1.kind === "voided" && s1.cancelled, true);
    assert.equal(s2.kind === "voided" && s2.cancelled, false);
  });

  it("S3 carries the refund record number only when it is a positive integer", () => {
    const withId = classifyRefundOutcome(ok(REFUNDED));
    const noId = classifyRefundOutcome(ok({ ...REFUNDED, data: { refund_payment: { id: "41" } } }));
    assert.equal(withId.kind === "refunded" && withId.refundPaymentId, 41);
    assert.equal(noId.kind === "refunded" && noId.refundPaymentId, null);
  });

  it("a confirmed failure carries the server message, or a plain fallback", () => {
    const withMessage = classifyRefundOutcome(err(503, { success: false, message: "No active account" }));
    const noMessage = classifyRefundOutcome(err(403, { success: false }));
    assert.deepEqual(withMessage, { kind: "failed", row: "F4", message: "No active account" });
    assert.deepEqual(noMessage, { kind: "failed", row: "F3", message: "The refund was not processed." });
  });
});

describe("refundAttemptFromError", () => {
  it("a transport failure (status 0) is no answer", () => {
    assert.deepEqual(refundAttemptFromError({ status: 0, body: new Error("timeout") }), { kind: "no_answer" });
  });
  it("an answered error keeps its status and parsed body", () => {
    const body = { success: false, message: "x" };
    assert.deepEqual(refundAttemptFromError({ status: 400, body }), { kind: "error", status: 400, body });
  });
  it("anything without a numeric status is treated as no answer", () => {
    assert.deepEqual(refundAttemptFromError(new Error("weird")), { kind: "no_answer" });
    assert.deepEqual(refundAttemptFromError(undefined), { kind: "no_answer" });
    assert.deepEqual(refundAttemptFromError({ status: "400" }), { kind: "no_answer" });
  });
});

describe("parseAmount — only valid, server-confirmed amounts (FR-022)", () => {
  it("accepts positive numbers and the backend's decimal strings", () => {
    assert.equal(parseAmount("50.00"), 50);
    assert.equal(parseAmount("0.01"), 0.01);
    assert.equal(parseAmount(50), 50);
    assert.equal(parseAmount(12.5), 12.5);
  });
  it("rejects zero, negatives, signs, exponents, blanks and non-finite values", () => {
    for (const bad of ["0", 0, "0.00", "", " 5", "5 ", "abc", "-1", -1, "+5", "1e3", Infinity, NaN, null, undefined, {}, []]) {
      assert.equal(parseAmount(bad), null, `expected null for ${String(bad)}`);
    }
  });
  it("a confirmed outcome stays confirmed with no amount when the field is missing or invalid", () => {
    const voidNoAmount = classifyRefundOutcome(ok({ ...VOIDED, void_amount: undefined }));
    const voidBadAmount = classifyRefundOutcome(ok({ ...VOIDED, void_amount: "abc" }));
    const refundNoAmount = classifyRefundOutcome(ok({ ...REFUNDED, refund_amount: null }));
    assert.deepEqual(voidNoAmount, { kind: "voided", row: "S1", amount: null, cancelled: true });
    assert.deepEqual(voidBadAmount, { kind: "voided", row: "S1", amount: null, cancelled: true });
    assert.deepEqual(refundNoAmount, { kind: "refunded", row: "S3", amount: null, refundPaymentId: 41 });
  });
});

describe("refundOutcomeNotice", () => {
  const booking = { payableType: "booking" };
  const notice = (o: RefundOutcome, payableType: string | null = "booking") =>
    refundOutcomeNotice(o, { payableType });

  it("S3 with an amount uses the web wording and the record number", () => {
    assert.deepEqual(notice({ kind: "refunded", row: "S3", amount: 50, refundPaymentId: 9 }), {
      title: "Refund processed",
      message: "Refund of $50.00 processed successfully. Refund Payment #9",
    });
  });
  it("S3 without an amount is neutral", () => {
    assert.equal(
      notice({ kind: "refunded", row: "S3", amount: null, refundPaymentId: null }).message,
      "Payment refunded successfully.",
    );
    assert.equal(
      notice({ kind: "refunded", row: "S3", amount: null, refundPaymentId: 9 }).message,
      "Payment refunded successfully. Refund Payment #9",
    );
  });
  it("S1 with an amount says voided instead of refunded and names the cancelled booking", () => {
    assert.deepEqual(refundOutcomeNotice({ kind: "voided", row: "S1", amount: 50, cancelled: true }, booking), {
      title: "Payment voided",
      message:
        "This payment had not settled yet, so it was voided instead of refunded. The full $50.00 goes back to the card and the booking was cancelled.",
    });
  });
  it("cancelled non-booking payables are called purchases", () => {
    for (const type of ["attraction_purchase", "event_purchase", "ticket_order", null]) {
      assert.match(notice({ kind: "voided", row: "S1", amount: 5, cancelled: true }, type).message, /the purchase was cancelled\.$/);
    }
  });
  it("S2 with an amount says nothing about cancellation", () => {
    assert.equal(
      notice({ kind: "voided", row: "S2", amount: 50, cancelled: false }).message,
      "This payment had not settled yet, so it was voided instead of refunded. The full $50.00 goes back to the card.",
    );
  });
  it("voids without an amount use the neutral forms", () => {
    assert.equal(notice({ kind: "voided", row: "S2", amount: null, cancelled: false }).message, "Payment voided instead of refunded.");
    assert.equal(
      notice({ kind: "voided", row: "S1", amount: null, cancelled: true }).message,
      "Payment voided instead of refunded, and the associated booking was cancelled.",
    );
    assert.equal(
      notice({ kind: "voided", row: "S1", amount: null, cancelled: true }, "event_purchase").message,
      "Payment voided instead of refunded, and the associated purchase was cancelled.",
    );
  });
  it("a confirmed failure shows the server's reason", () => {
    assert.deepEqual(notice({ kind: "failed", row: "F2", message: "Declined." }), {
      title: "Refund failed",
      message: "Declined.",
    });
  });
  it("an unknown outcome uses exactly the approved sentence", () => {
    assert.deepEqual(notice({ kind: "unknown", row: "U3" }), {
      title: "Refund result unknown",
      message:
        "The refund result could not be confirmed. The transaction may still have been processed. Please verify the payment status before attempting another refund.",
    });
  });

  it("wording never contradicts the outcome or invents an amount", () => {
    const refunded = [
      notice({ kind: "refunded", row: "S3", amount: 50, refundPaymentId: 9 }),
      notice({ kind: "refunded", row: "S3", amount: null, refundPaymentId: null }),
    ];
    const voided = [
      notice({ kind: "voided", row: "S1", amount: 50, cancelled: true }),
      notice({ kind: "voided", row: "S2", amount: null, cancelled: false }),
      notice({ kind: "voided", row: "S1", amount: null, cancelled: true }),
    ];
    const unknown = notice({ kind: "unknown", row: "U1" });
    for (const n of refunded) assert.doesNotMatch(n.message, /void/i);
    for (const n of voided) {
      assert.doesNotMatch(n.message, /refunded successfully/i);
      assert.doesNotMatch(n.message, /\b(days|within|business)\b/i);
    }
    assert.doesNotMatch(unknown.message, /failed|voided|refunded successfully/i);
    for (const n of [refunded[1], voided[1], voided[2]]) {
      assert.doesNotMatch(n.message, /\$|full payment amount/);
    }
  });
});

describe("refund responses never trigger the shared client's automatic re-sends", () => {
  it("no fixture satisfies requiresChangeReason or blockedPeriodWarning", () => {
    for (const [, attempt] of FIXTURES) {
      if (attempt.kind !== "error") continue;
      assert.equal(requiresChangeReason(attempt.status, attempt.body), false);
      assert.equal(blockedPeriodWarning(attempt.status, attempt.body), null);
    }
  });
});
