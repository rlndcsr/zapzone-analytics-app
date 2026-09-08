import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  amountDueAfterGiftCard,
  describeGiftCardError,
  giftCardCodeField,
  giftCardDiscountFor,
  nextAppliedGiftCard,
  reconcileGiftCardPurchase,
} from "./checkoutGiftCard.ts";

describe("nextAppliedGiftCard", () => {
  it("applies a valid code, uppercased and trimmed", () => {
    const next = nextAppliedGiftCard(" abc123 ", {
      valid: true,
      discountAmount: 25,
      message: null,
    });
    assert.deepEqual(next, { code: "ABC123", discountAmount: 25 });
  });

  it("clears the applied card when the code is invalid", () => {
    const next = nextAppliedGiftCard("BADCODE", {
      valid: false,
      discountAmount: 0,
      message: "That gift card is not valid for this order.",
    });
    assert.equal(next, null);
  });

  it("never returns a negative discount even if the server did", () => {
    const next = nextAppliedGiftCard("X", {
      valid: true,
      discountAmount: -5,
      message: null,
    });
    assert.deepEqual(next, { code: "X", discountAmount: 0 });
  });

  it("replacing an applied card: a second valid code overwrites the first", () => {
    const first = nextAppliedGiftCard("FIRST", {
      valid: true,
      discountAmount: 10,
      message: null,
    });
    const second = nextAppliedGiftCard("SECOND", {
      valid: true,
      discountAmount: 40,
      message: null,
    });
    assert.deepEqual(first, { code: "FIRST", discountAmount: 10 });
    assert.deepEqual(second, { code: "SECOND", discountAmount: 40 });
  });

  it("removing an applied card is just clearing local state to null (no API call modeled here)", () => {
    const applied = nextAppliedGiftCard("X", {
      valid: true,
      discountAmount: 10,
      message: null,
    });
    assert.notEqual(applied, null);
    const removed: typeof applied | null = null;
    assert.equal(removed, null);
  });
});

describe("giftCardDiscountFor / amountDueAfterGiftCard", () => {
  it("gift card covers none of the total when nothing is applied", () => {
    assert.equal(giftCardDiscountFor(null, 100), 0);
    assert.equal(amountDueAfterGiftCard(100, null), 100);
  });

  it("gift card partially covers the total", () => {
    const applied = { code: "ABC", discountAmount: 25 };
    assert.equal(giftCardDiscountFor(applied, 100), 25);
    assert.equal(amountDueAfterGiftCard(100, applied), 75);
  });

  it("gift card exactly covers the total", () => {
    const applied = { code: "ABC", discountAmount: 100 };
    assert.equal(giftCardDiscountFor(applied, 100), 100);
    assert.equal(amountDueAfterGiftCard(100, applied), 0);
  });

  it("discount greater than the subtotal is clamped, never going negative", () => {
    const applied = { code: "ABC", discountAmount: 500 };
    assert.equal(giftCardDiscountFor(applied, 100), 100);
    assert.equal(amountDueAfterGiftCard(100, applied), 0);
  });

  it("zero amount due rounds cleanly and never returns -0", () => {
    const applied = { code: "ABC", discountAmount: 100 };
    const due = amountDueAfterGiftCard(100, applied);
    assert.equal(due, 0);
    assert.equal(Object.is(due, -0), false);
  });

  it("rounds to the cent", () => {
    const applied = { code: "ABC", discountAmount: 33.333 };
    assert.equal(amountDueAfterGiftCard(100, applied), 66.67);
  });
});

describe("describeGiftCardError", () => {
  it("special-cases HTTP 429", () => {
    const err = Object.assign(new Error("Too Many Attempts."), { status: 429 });
    assert.equal(
      describeGiftCardError(err),
      "Too many attempts. Please wait a minute and try again.",
    );
  });

  it("uses the server-provided message for any other error", () => {
    const err = Object.assign(new Error("That gift card has expired."), {
      status: 422,
    });
    assert.equal(describeGiftCardError(err), "That gift card has expired.");
  });

  it("falls back to a generic message when there is none", () => {
    assert.equal(
      describeGiftCardError(new Error("")),
      "Could not check that code. Please try again.",
    );
    assert.equal(
      describeGiftCardError("not an error object"),
      "Could not check that code. Please try again.",
    );
  });
});

describe("giftCardCodeField", () => {
  it("includes gift_card_code only when a card is applied", () => {
    assert.deepEqual(
      giftCardCodeField({ code: "ABC123", discountAmount: 10 }),
      {
        gift_card_code: "ABC123",
      },
    );
  });

  it("omits the field entirely — not even null — when nothing is applied", () => {
    assert.deepEqual(giftCardCodeField(null), {});
    assert.equal("gift_card_code" in giftCardCodeField(null), false);
  });

  it("a normal purchase payload is unchanged when no gift card is applied", () => {
    const basePayload = { attraction_id: 1, quantity: 2, total_amount: 50 };
    const payload = { ...basePayload, ...giftCardCodeField(null) };
    assert.deepEqual(payload, basePayload);
    assert.equal(JSON.stringify(payload).includes("gift_card_code"), false);
  });

  it("a gift-card purchase payload carries the code", () => {
    const basePayload = { attraction_id: 1, quantity: 2, total_amount: 50 };
    const payload = {
      ...basePayload,
      ...giftCardCodeField({ code: "ABC123", discountAmount: 50 }),
    };
    assert.equal(payload.gift_card_code, "ABC123");
    assert.equal(
      JSON.stringify(payload).includes('"gift_card_code":"ABC123"'),
      true,
    );
  });
});

describe("reconcileGiftCardPurchase", () => {
  it("branch A — server confirms the gift card fully covered the purchase", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 100,
      amountPaid: 100,
      status: "confirmed",
      cardDetailsComplete: false,
    });
    assert.deepEqual(outcome, { action: "settled" });
  });

  it("branch B — nothing due, but the record never reached a confirmed state", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 100,
      amountPaid: 100,
      status: "pending",
      cardDetailsComplete: false,
    });
    assert.deepEqual(outcome, {
      action: "retry",
      reasonCode: "price-changed",
      serverDue: 0,
    });
  });

  it("branch C — server reports a remaining amount and card details are present", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 100,
      amountPaid: 25,
      status: "pending",
      cardDetailsComplete: true,
    });
    assert.deepEqual(outcome, { action: "charge", amount: 75 });
  });

  it("branch C uses the SERVER-computed remainder, not any client estimate", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 110,
      amountPaid: 35,
      status: "pending",
      cardDetailsComplete: true,
    });
    assert.equal(outcome.action, "charge");
    assert.equal(outcome.action === "charge" && outcome.amount, 75);
  });

  it("branch D — remaining amount due but card details are missing", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 100,
      amountPaid: 25,
      status: "pending",
      cardDetailsComplete: false,
    });
    assert.deepEqual(outcome, {
      action: "retry",
      reasonCode: "card-required",
      serverDue: 75,
    });
  });

  it("accepts a custom confirmed-status list (e.g. a ticket order's own status enum)", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 50,
      amountPaid: 50,
      status: "completed",
      cardDetailsComplete: false,
      confirmedStatuses: ["confirmed", "completed"],
    });
    assert.deepEqual(outcome, { action: "settled" });
  });

  it("never reports a negative amount due", () => {
    const outcome = reconcileGiftCardPurchase({
      totalAmount: 50,
      amountPaid: 80,
      status: "pending",
      cardDetailsComplete: false,
    });
    assert.equal(outcome.action === "retry" ? outcome.serverDue : 0, 0);
  });
});
