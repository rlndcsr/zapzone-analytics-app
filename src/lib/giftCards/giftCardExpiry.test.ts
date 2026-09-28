import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GIFT_CARD_EXPIRY_AFTER_TODAY,
  giftCardExpiryError,
} from "./giftCardExpiry.ts";

const TODAY = "2026-09-28";

describe("giftCardExpiryError", () => {
  it("refuses today, which the API's after:today rejects", () => {
    assert.equal(
      giftCardExpiryError(TODAY, TODAY),
      GIFT_CARD_EXPIRY_AFTER_TODAY,
    );
  });

  it("refuses the past", () => {
    assert.equal(
      giftCardExpiryError("2026-09-27", TODAY),
      GIFT_CARD_EXPIRY_AFTER_TODAY,
    );
  });

  it("accepts tomorrow onward", () => {
    assert.equal(giftCardExpiryError("2026-09-29", TODAY), null);
    assert.equal(giftCardExpiryError(" 2027-01-01 ", TODAY), null);
  });

  it("accepts a blank expiry — a card that never expires", () => {
    assert.equal(giftCardExpiryError("", TODAY), null);
    assert.equal(giftCardExpiryError("   ", TODAY), null);
  });

  it("leaves a malformed date to the API", () => {
    assert.equal(giftCardExpiryError("09/28/2026", TODAY), null);
  });

  it("does not guess when today is unknown", () => {
    assert.equal(giftCardExpiryError(TODAY, null), null);
  });
});
