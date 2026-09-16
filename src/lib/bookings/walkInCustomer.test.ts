import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isBlankOrValidEmail, isWalkInCustomerValid } from "./walkInCustomer.ts";

describe("isBlankOrValidEmail", () => {
  it("accepts a blank email", () => {
    assert.equal(isBlankOrValidEmail(""), true);
    assert.equal(isBlankOrValidEmail("   "), true);
  });

  it("accepts a well-formed email", () => {
    assert.equal(isBlankOrValidEmail("jane@example.com"), true);
  });

  it("rejects a malformed, non-empty email", () => {
    assert.equal(isBlankOrValidEmail("not-an-email"), false);
    assert.equal(isBlankOrValidEmail("missing-domain@"), false);
    assert.equal(isBlankOrValidEmail("@missing-local.com"), false);
  });
});

describe("isWalkInCustomerValid", () => {
  const base = { name: "Jane Doe", phone: "555-0100", email: "" };

  it("is valid with name and phone and a blank email — the walk-in case", () => {
    assert.equal(isWalkInCustomerValid(base), true);
  });

  it("is valid with a well-formed email too", () => {
    assert.equal(isWalkInCustomerValid({ ...base, email: "jane@example.com" }), true);
  });

  it("is invalid with a malformed, non-empty email", () => {
    assert.equal(isWalkInCustomerValid({ ...base, email: "not-an-email" }), false);
  });

  it("is invalid when name is missing, even with a blank email", () => {
    assert.equal(isWalkInCustomerValid({ ...base, name: "" }), false);
    assert.equal(isWalkInCustomerValid({ ...base, name: "   " }), false);
  });

  it("is invalid when phone is missing, even with a blank email", () => {
    assert.equal(isWalkInCustomerValid({ ...base, phone: "" }), false);
    assert.equal(isWalkInCustomerValid({ ...base, phone: "   " }), false);
  });
});
