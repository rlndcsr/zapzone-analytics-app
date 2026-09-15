import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cardFromPayments,
  formatCardLabel,
  normalizeCardBrand,
  normalizeLastFour,
} from "./cardLabel.ts";

describe("naming the card a guest paid with", () => {
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

  it("labels a card by brand and last four", () => {
    assert.equal(formatCardLabel("visa", "4242"), "Visa ending in 4242");
  });

  it("falls back to a generic card when the brand is missing", () => {
    assert.equal(formatCardLabel(null, "4242"), "Card ending in 4242");
  });

  it("has no label without a usable card number", () => {
    assert.equal(formatCardLabel("visa", null), null);
  });
});

describe("picking which payment's card to show", () => {
  it("has nothing to show without payments", () => {
    assert.equal(cardFromPayments(null), null);
    assert.equal(cardFromPayments([]), null);
  });

  it("ignores payments that carry no card", () => {
    assert.equal(
      cardFromPayments([{ status: "completed", method: "cash" } as never]),
      null,
    );
  });

  it("prefers a completed payment over a pending one", () => {
    const card = cardFromPayments([
      {
        status: "pending",
        cardType: "amex",
        cardLastFour: "0005",
        createdAt: "2026-02-01T10:00:00Z",
      },
      {
        status: "completed",
        cardType: "visa",
        cardLastFour: "4242",
        createdAt: "2026-01-01T10:00:00Z",
      },
    ]);
    assert.equal(card?.label, "Visa ending in 4242");
  });

  it("takes the most recent among equally ranked payments", () => {
    const card = cardFromPayments([
      {
        status: "completed",
        cardType: "visa",
        cardLastFour: "4242",
        paidAt: "2026-01-01T10:00:00Z",
      },
      {
        status: "completed",
        cardType: "discover",
        cardLastFour: "1117",
        paidAt: "2026-03-01T10:00:00Z",
      },
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
