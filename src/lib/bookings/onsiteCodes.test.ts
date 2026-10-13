import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPLY_CODES_FIRST,
  afterCodes,
  depositFor,
  giftCardTakes,
  promoTotalChanged,
  toCents,
  unappliedCodeError,
} from "./onsiteCodes.ts";

describe("on-site booking codes", () => {
  it("takes the gift card only up to what is left after the promo", () => {
    assert.equal(giftCardTakes(50, 100, 20), 50);
    assert.equal(giftCardTakes(500, 100, 20), 80);
    assert.equal(giftCardTakes(50, 10, 20), 0);
  });

  it("never owes less than nothing", () => {
    assert.equal(afterCodes(100, 20, 30), 50);
    assert.equal(afterCodes(40, 20, 30), 0);
  });

  it("refuses to book with a typed code that was never applied", () => {
    assert.equal(unappliedCodeError("SAVE10", false, "", false), APPLY_CODES_FIRST);
    assert.equal(unappliedCodeError("", false, "GIFT-1", false), APPLY_CODES_FIRST);
    assert.equal(unappliedCodeError(" SAVE10 ", true, "GIFT-1", true), null);
    assert.equal(unappliedCodeError("  ", false, "", false), null);
  });

  it("quotes the deposit off the payable total, never above it", () => {
    assert.equal(depositFor({ partialPaymentPercentage: 25 }, 80), 20);
    assert.equal(depositFor({ partialPaymentFixed: 50 }, 30), 30);
    assert.equal(depositFor({ partialPaymentFixed: 50 }, 80), 50);
    assert.equal(depositFor({}, 80), 0);
  });

  it("compares a promo's base to the cent", () => {
    assert.equal(toCents(99.999), 100);
    assert.equal(toCents(10.004), 10);
  });

  it("stops a booking whose total moved off the one its promo was checked on", () => {
    assert.equal(promoTotalChanged(true, 100, 100), false);
    assert.equal(promoTotalChanged(true, 100, 100.001), false);
    assert.equal(promoTotalChanged(true, 100, 105), true);
    assert.equal(promoTotalChanged(true, null, 100), true);
    assert.equal(promoTotalChanged(false, 100, 105), false);
  });
});
