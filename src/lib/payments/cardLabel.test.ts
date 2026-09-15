import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardLabelFromPayments, formatCardLabel } from "./cardLabel.ts";

describe("formatCardLabel", () => {
  it("prefers the server-computed label when present", () => {
    assert.equal(
      formatCardLabel("visa", "4242", "Visa ending in 4242"),
      "Visa ending in 4242",
    );
  });

  it("composes brand + last four when there's no server label", () => {
    assert.equal(formatCardLabel("visa", "4242 4242 4242 4242"), "Visa ending in 4242");
  });

  it("normalizes common brand abbreviations", () => {
    assert.equal(formatCardLabel("mc", "1111"), "Mastercard ending in 1111");
    assert.equal(formatCardLabel("amex", "1111"), "American Express ending in 1111");
  });

  it("falls back to \"Card\" when the brand is missing", () => {
    assert.equal(formatCardLabel(null, "1111"), "Card ending in 1111");
  });

  it("returns null for a cash/in-store payment (no card at all)", () => {
    assert.equal(formatCardLabel(null, null), null);
    assert.equal(formatCardLabel("visa", null), null);
  });

  it("never reads \"ending in undefined\" off a partial last four", () => {
    assert.equal(formatCardLabel("visa", "12"), null);
  });
});

describe("cardLabelFromPayments", () => {
  it("returns null for an empty or missing history", () => {
    assert.equal(cardLabelFromPayments(null), null);
    assert.equal(cardLabelFromPayments([]), null);
  });

  it("skips cash payments and uses the one with a card", () => {
    const label = cardLabelFromPayments([
      { status: "completed" },
      { status: "completed", card_type: "visa", card_last_four: "4242" },
    ]);
    assert.equal(label, "Visa ending in 4242");
  });

  it("prefers a completed payment over a pending one", () => {
    const label = cardLabelFromPayments([
      { status: "pending", card_type: "visa", card_last_four: "1111", created_at: "2026-01-01" },
      { status: "completed", card_type: "mastercard", card_last_four: "2222", created_at: "2026-01-01" },
    ]);
    assert.equal(label, "Mastercard ending in 2222");
  });

  it("prefers the most recent completed payment", () => {
    const label = cardLabelFromPayments([
      { status: "completed", card_type: "visa", card_last_four: "1111", paid_at: "2026-01-01T00:00:00Z" },
      { status: "completed", card_type: "mastercard", card_last_four: "2222", paid_at: "2026-06-01T00:00:00Z" },
    ]);
    assert.equal(label, "Mastercard ending in 2222");
  });

  it("returns null when nothing in the history carries a card", () => {
    const label = cardLabelFromPayments([
      { status: "completed" },
      { status: "completed" },
    ]);
    assert.equal(label, null);
  });

  it("uses the server card_label per payment when present", () => {
    const label = cardLabelFromPayments([
      { status: "completed", card_label: "Discover ending in 9999" },
    ]);
    assert.equal(label, "Discover ending in 9999");
  });
});
