import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMembershipChargeReady } from "./membershipChargeGate.ts";

const SIG_A = JSON.stringify({ plan_id: 1, home_location_id: 5 });
const SIG_B = JSON.stringify({ plan_id: 2, home_location_id: 5 });

const complete = {
  chargeRequested: true,
  hasGateway: true,
  gatewayRequestSignature: SIG_A,
  currentRequestSignature: SIG_A,
  cardNumberValid: true,
  cardMonth: "12",
  cardYear: "2030",
  cardCvv: "123",
};

describe("isMembershipChargeReady", () => {
  it("cash/comp/free-plan (chargeRequested false): nothing to gate", () => {
    assert.equal(
      isMembershipChargeReady({
        ...complete,
        chargeRequested: false,
        hasGateway: false,
        gatewayRequestSignature: "",
        currentRequestSignature: "",
      }),
      true,
    );
  });

  it("everything present and matching: ready", () => {
    assert.equal(isMembershipChargeReady(complete), true);
  });

  it("fails closed with no gateway resolved yet", () => {
    assert.equal(
      isMembershipChargeReady({
        ...complete,
        hasGateway: false,
        gatewayRequestSignature: "",
      }),
      false,
    );
  });

  it("fails closed on a stale merchant context: gateway resolved for a DIFFERENT plan", () => {
    assert.equal(
      isMembershipChargeReady({ ...complete, currentRequestSignature: SIG_B }),
      false,
    );
  });

  it("fails closed on a stale merchant context: location changed after the gateway loaded", () => {
    const movedLocation = JSON.stringify({ plan_id: 1, home_location_id: 9 });
    assert.equal(
      isMembershipChargeReady({
        ...complete,
        currentRequestSignature: movedLocation,
      }),
      false,
    );
  });

  it("fails closed when nothing has been requested/resolved at all", () => {
    assert.equal(
      isMembershipChargeReady({
        ...complete,
        hasGateway: false,
        gatewayRequestSignature: "",
        currentRequestSignature: "",
      }),
      false,
    );
  });

  it("fails closed on an invalid card number", () => {
    assert.equal(
      isMembershipChargeReady({ ...complete, cardNumberValid: false }),
      false,
    );
  });

  it("fails closed on a missing expiry month", () => {
    assert.equal(
      isMembershipChargeReady({ ...complete, cardMonth: "" }),
      false,
    );
  });

  it("fails closed on a missing expiry year", () => {
    assert.equal(isMembershipChargeReady({ ...complete, cardYear: "" }), false);
  });

  it("fails closed on a missing CVV", () => {
    assert.equal(isMembershipChargeReady({ ...complete, cardCvv: "" }), false);
  });
});
