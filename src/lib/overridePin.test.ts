import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateOverridePin } from "./overridePin.ts";

describe("validateOverridePin", () => {
  it("accepts a 4-to-6-digit PIN that matches its confirmation", () => {
    assert.equal(validateOverridePin("1234", "1234"), null);
    assert.equal(validateOverridePin("123456", "123456"), null);
  });

  it("rejects a PIN shorter than 4 or longer than 6 digits", () => {
    assert.equal(
      validateOverridePin("123", "123"),
      "The PIN must be 4 to 6 digits.",
    );
    assert.equal(
      validateOverridePin("1234567", "1234567"),
      "The PIN must be 4 to 6 digits.",
    );
  });

  it("rejects a PIN with non-digit characters", () => {
    assert.equal(
      validateOverridePin("12a4", "12a4"),
      "The PIN must be 4 to 6 digits.",
    );
  });

  it("rejects a mismatched confirmation, checked only after the format is valid", () => {
    assert.equal(
      validateOverridePin("1234", "4321"),
      "The two PINs do not match.",
    );
  });
});
