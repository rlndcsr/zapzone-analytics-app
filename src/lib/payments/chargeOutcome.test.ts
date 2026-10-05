import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chargeFailureNotice,
  chargeUnknownMessage,
  isChargeOutcomeUnknown,
} from "./chargeOutcome.ts";

describe("isChargeOutcomeUnknown", () => {
  it("a timeout or dropped connection is unknown", () => {
    assert.equal(isChargeOutcomeUnknown(0), true);
  });

  it("a 502 or 504 from a proxy is unknown", () => {
    assert.equal(isChargeOutcomeUnknown(502), true);
    assert.equal(isChargeOutcomeUnknown(504), true);
  });

  it("a charge already running for the same payable is unknown", () => {
    assert.equal(
      isChargeOutcomeUnknown(409, { success: false, error_code: "CHARGE_IN_PROGRESS" }),
      true,
    );
  });

  it("other refusals prove the card was not charged", () => {
    assert.equal(isChargeOutcomeUnknown(409, { error_code: "ALREADY_PAID" }), false);
    assert.equal(isChargeOutcomeUnknown(409), false);
    assert.equal(isChargeOutcomeUnknown(400, { error_code: "PAYMENT_NOT_APPROVED" }), false);
    assert.equal(isChargeOutcomeUnknown(422), false);
    assert.equal(isChargeOutcomeUnknown(500), false);
    assert.equal(isChargeOutcomeUnknown(503), false);
  });
});

describe("chargeFailureNotice", () => {
  it("adds the cancelled line to the app's own wording of a decline", () => {
    assert.equal(
      chargeFailureNotice(
        "Your card was declined. Please check your card details or try a different payment method.",
        "This transaction has been declined.",
        "booking",
      ),
      "Your card was declined. Please check your card details or try a different payment method." +
        "\n\nThe booking has been cancelled and no charges were made.",
    );
  });

  it("adds the cancelled line when the card never reached the server", () => {
    assert.equal(
      chargeFailureNotice("Invalid card number.", null, "purchase"),
      "Invalid card number.\n\nThe purchase has been cancelled and no charges were made.",
    );
  });

  it("never contradicts the server's own account of the money", () => {
    const noAnswer =
      "We couldn't get an answer from the card processor, so we can't tell whether your card was charged. " +
      "Nothing was booked. Please call us before trying again so you are not charged twice.";
    assert.equal(chargeFailureNotice(noAnswer, noAnswer, "booking"), noAnswer);
  });
});

describe("chargeUnknownMessage", () => {
  it("matches the web staff wording", () => {
    assert.equal(
      chargeUnknownMessage("booking", "Bookings"),
      "No answer from the payment service, so the card may or may not have been charged. " +
        "The booking was kept: check it in Bookings or in Authorize.Net before charging again.",
    );
  });
});
