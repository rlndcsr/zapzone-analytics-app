import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { overlapGateConflicts, validateOverridePin } from "./overridePin.ts";

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

describe("overlapGateConflicts", () => {
  const gate = (conflicts: unknown) => ({ requires_override: true, conflicts });

  it("reads the server's conflicts as sentences for the approval dialog", () => {
    assert.deepEqual(
      overlapGateConflicts(409, gate(["another booking already occupies this space", "this time overlaps a scheduled break"])),
      ["Another booking already occupies this space.", "This time overlaps a scheduled break."],
    );
  });

  it("is only the gate when the 409 says a manager can approve it", () => {
    assert.equal(overlapGateConflicts(409, { message: "Sorry — that time is no longer free." }), null);
    assert.equal(overlapGateConflicts(409, { requires_override: false, conflicts: ["x"] }), null);
    assert.equal(overlapGateConflicts(409, undefined), null);
  });

  it("never treats another status as the gate", () => {
    assert.equal(overlapGateConflicts(422, gate(["x"])), null);
    assert.equal(overlapGateConflicts(500, gate(["x"])), null);
  });

  it("answers an empty list when the gate names nothing usable, so the caller can fill it", () => {
    assert.deepEqual(overlapGateConflicts(409, gate([])), []);
    assert.deepEqual(overlapGateConflicts(409, gate(["  ", 3, null])), []);
    assert.deepEqual(overlapGateConflicts(409, { requires_override: true }), []);
  });
});
