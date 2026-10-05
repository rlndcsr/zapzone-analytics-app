import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { newCheckoutKey } from "./checkoutKey.ts";

// the backend's validation rule for checkout_key
const SERVER_RULE = /^[A-Za-z0-9-]{1,64}$/;

describe("newCheckoutKey", () => {
  it("passes the server's checkout_key validation", () => {
    assert.match(newCheckoutKey(), SERVER_RULE);
  });

  it("is different for every attempt", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newCheckoutKey()));
    assert.equal(keys.size, 50);
  });

  it("still passes validation where crypto.randomUUID is missing (Hermes)", () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
    try {
      const key = newCheckoutKey();
      assert.match(key, SERVER_RULE);
      assert.ok(key.startsWith("ck-"));
    } finally {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: original,
        configurable: true,
      });
    }
  });
});
