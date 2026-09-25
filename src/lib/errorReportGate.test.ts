import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createReportGate } from "./errorReportGate.ts";

describe("createReportGate", () => {
  it("sends the same error at most once a minute", () => {
    const gate = createReportGate(25, 60_000);
    assert.equal(gate.admit("api|500|boom|/home", 0), true);
    assert.equal(gate.admit("api|500|boom|/home", 59_999), false);
    assert.equal(gate.admit("api|500|boom|/home", 60_000), true);
  });

  it("lets different errors through side by side", () => {
    const gate = createReportGate(25, 60_000);
    assert.equal(gate.admit("a", 0), true);
    assert.equal(gate.admit("b", 0), true);
  });

  it("stops for good after the session cap", () => {
    const gate = createReportGate(3, 60_000);
    assert.equal(gate.admit("1", 0), true);
    assert.equal(gate.admit("2", 0), true);
    assert.equal(gate.admit("3", 0), true);
    assert.equal(gate.admit("4", 0), false);
    assert.equal(gate.admit("1", 10 * 60_000), false);
  });

  it("does not spend the cap on a repeat it refused", () => {
    const gate = createReportGate(2, 60_000);
    assert.equal(gate.admit("same", 0), true);
    assert.equal(gate.admit("same", 1), false);
    assert.equal(gate.admit("other", 2), true);
  });
});
