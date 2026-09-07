import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  describeSellResult,
  isValidPurchaserEmail,
  validateSellAmount,
} from "./sellGiftCard.ts";

describe("validateSellAmount", () => {
  it("accepts a preset amount", () => {
    const result = validateSellAmount("100");
    assert.deepEqual(result, { ok: true, amount: 100 });
  });

  it("accepts a custom amount with decimals", () => {
    const result = validateSellAmount("37.50");
    assert.deepEqual(result, { ok: true, amount: 37.5 });
  });

  it("accepts the minimum boundary", () => {
    assert.deepEqual(validateSellAmount("10"), { ok: true, amount: 10 });
  });

  it("accepts the maximum boundary", () => {
    assert.deepEqual(validateSellAmount("500"), { ok: true, amount: 500 });
  });

  it("rejects just under the minimum", () => {
    const result = validateSellAmount("9.99");
    assert.equal(result.ok, false);
  });

  it("rejects just over the maximum", () => {
    const result = validateSellAmount("500.01");
    assert.equal(result.ok, false);
  });

  it("rejects an empty amount", () => {
    const result = validateSellAmount("   ");
    assert.equal(result.ok, false);
  });

  it("rejects a non-numeric amount", () => {
    const result = validateSellAmount("abc");
    assert.equal(result.ok, false);
  });

  it("rejects zero and negative amounts", () => {
    assert.equal(validateSellAmount("0").ok, false);
    assert.equal(validateSellAmount("-5").ok, false);
  });
});

describe("isValidPurchaserEmail", () => {
  it("accepts a well-formed email", () => {
    assert.equal(isValidPurchaserEmail("jane@example.com"), true);
  });

  it("trims surrounding whitespace before checking", () => {
    assert.equal(isValidPurchaserEmail("  jane@example.com  "), true);
  });

  it("rejects an email with no domain", () => {
    assert.equal(isValidPurchaserEmail("jane@"), false);
  });

  it("rejects an email with no @", () => {
    assert.equal(isValidPurchaserEmail("jane.example.com"), false);
  });

  it("rejects an email with a space", () => {
    assert.equal(isValidPurchaserEmail("jane doe@example.com"), false);
  });

  it("rejects an empty string", () => {
    assert.equal(isValidPurchaserEmail(""), false);
  });
});

describe("describeSellResult", () => {
  it("enters the same success shape for a normal sale", () => {
    const result = describeSellResult({ duplicate: false, data: { code: "GC1" } });
    assert.deepEqual(result, {
      card: { code: "GC1" },
      message: "Gift card sold successfully!",
    });
  });

  it("enters the same success shape for a duplicate, with only the message differing", () => {
    const result = describeSellResult({ duplicate: true, data: { code: "GC1" } });
    assert.deepEqual(result.card, { code: "GC1" });
    assert.equal(result.message, "This sale was already recorded — showing the same card.");
  });

  it("treats a missing duplicate flag as a normal sale", () => {
    const result = describeSellResult({ data: { code: "GC2" } });
    assert.equal(result.message, "Gift card sold successfully!");
  });
});
