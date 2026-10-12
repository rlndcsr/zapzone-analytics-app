import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkoutTokenBody,
  checkoutTokenFor,
  rememberCheckoutToken,
} from "./checkoutTokens.ts";

describe("checkout tokens", () => {
  it("returns the token remembered for that record", () => {
    rememberCheckoutToken("booking", 41, "tok-41");
    assert.equal(checkoutTokenFor("booking", 41), "tok-41");
    assert.deepEqual(checkoutTokenBody("booking", 41), { checkout_token: "tok-41" });
  });

  it("keeps records of different types apart", () => {
    rememberCheckoutToken("attraction_purchase", 7, "tok-a");
    assert.equal(checkoutTokenFor("event_purchase", 7), undefined);
    assert.equal(checkoutTokenBody("event_purchase", 7), undefined);
  });

  it("ignores a missing id or a token that is not a non-empty string", () => {
    rememberCheckoutToken("ticket_order", undefined, "tok");
    rememberCheckoutToken("ticket_order", 9, "");
    rememberCheckoutToken("ticket_order", 10, null);
    rememberCheckoutToken("ticket_order", 11, 123);
    assert.equal(checkoutTokenFor("ticket_order", 9), undefined);
    assert.equal(checkoutTokenFor("ticket_order", 10), undefined);
    assert.equal(checkoutTokenFor("ticket_order", 11), undefined);
  });
});
