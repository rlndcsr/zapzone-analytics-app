import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cardFromPayments,
  cardIdentity,
  cardLabelFromPayments,
  formatCardLabel,
  normalizeCardBrand,
  normalizeLastFour,
} from "./cardLabel.ts";

describe("normalizeCardBrand / normalizeLastFour", () => {
  it("maps the gateway's brand spellings onto one display name", () => {
    assert.equal(normalizeCardBrand("VISA"), "Visa");
    assert.equal(normalizeCardBrand("amex"), "American Express");
    assert.equal(normalizeCardBrand("American Express"), "American Express");
    assert.equal(normalizeCardBrand("master-card"), "Mastercard");
  });

  it("keeps an unrecognised brand verbatim rather than dropping it", () => {
    assert.equal(normalizeCardBrand("Cabbage Pay"), "Cabbage Pay");
  });

  it("has no brand for a blank one", () => {
    assert.equal(normalizeCardBrand("   "), null);
    assert.equal(normalizeCardBrand(null), null);
  });

  it("takes the last four digits, ignoring any masking characters", () => {
    assert.equal(normalizeLastFour("**** **** **** 4242"), "4242");
    assert.equal(normalizeLastFour("4242"), "4242");
  });

  it("refuses a number too short to identify a card", () => {
    assert.equal(normalizeLastFour("42"), null);
    assert.equal(normalizeLastFour(""), null);
    assert.equal(normalizeLastFour(null), null);
  });
});

describe("cardIdentity", () => {
  it("returns brand, last four, and label together", () => {
    assert.deepEqual(cardIdentity("visa", "4242"), {
      brand: "Visa",
      lastFour: "4242",
      label: "Visa ending in 4242",
    });
  });

  it("falls back to a generic brand when none is given", () => {
    assert.deepEqual(cardIdentity(null, "4242"), {
      brand: null,
      lastFour: "4242",
      label: "Card ending in 4242",
    });
  });

  it("is null without a usable card number", () => {
    assert.equal(cardIdentity("visa", null), null);
  });
});

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

  it("breaks a tie on id when neither payment is timestamped", () => {
    const label = cardLabelFromPayments([
      { id: 1, status: "completed", card_type: "visa", card_last_four: "4242" },
      { id: 2, status: "completed", card_type: "jcb", card_last_four: "8888" },
    ]);
    assert.equal(label, "JCB ending in 8888");
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

describe("cardFromPayments (mapped/camelCase history, e.g. BookingDetail.payments)", () => {
  it("returns null for an empty or missing history", () => {
    assert.equal(cardFromPayments(null), null);
    assert.equal(cardFromPayments([]), null);
  });

  it("ignores payments that carry no card", () => {
    assert.equal(cardFromPayments([{ status: "completed" }]), null);
  });

  it("prefers a completed payment over a pending one", () => {
    const card = cardFromPayments([
      { status: "pending", cardType: "amex", cardLastFour: "0005", createdAt: "2026-02-01T10:00:00Z" },
      { status: "completed", cardType: "visa", cardLastFour: "4242", createdAt: "2026-01-01T10:00:00Z" },
    ]);
    assert.equal(card?.label, "Visa ending in 4242");
  });

  it("takes the most recent among equally ranked payments", () => {
    const card = cardFromPayments([
      { status: "completed", cardType: "visa", cardLastFour: "4242", paidAt: "2026-01-01T10:00:00Z" },
      { status: "completed", cardType: "discover", cardLastFour: "1117", paidAt: "2026-03-01T10:00:00Z" },
    ]);
    assert.equal(card?.label, "Discover ending in 1117");
  });

  it("breaks a tie on id when neither payment is timestamped", () => {
    const card = cardFromPayments([
      { id: 1, status: "completed", cardType: "visa", cardLastFour: "4242" },
      { id: 2, status: "completed", cardType: "jcb", cardLastFour: "8888" },
    ]);
    assert.equal(card?.label, "JCB ending in 8888");
  });
});
