import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { phoneDialUrl } from "./phone.ts";

describe("phoneDialUrl", () => {
  it("dials only the digits of a formatted number", () => {
    assert.equal(phoneDialUrl("(313) 555-0100"), "tel:3135550100");
    assert.equal(phoneDialUrl("313.555.0100 ext"), "tel:3135550100");
  });

  it("keeps an international plus", () => {
    assert.equal(phoneDialUrl("+1 313-555-0100"), "tel:+13135550100");
  });

  it("is nothing when there is nothing to dial", () => {
    assert.equal(phoneDialUrl(null), null);
    assert.equal(phoneDialUrl(undefined), null);
    assert.equal(phoneDialUrl(""), null);
    assert.equal(phoneDialUrl("n/a"), null);
  });
});
