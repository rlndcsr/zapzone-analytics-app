import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { combineFreshPricing } from "./combineFreshPricing.ts";

describe("combineFreshPricing", () => {
  it("no fee breakdown, no special pricing: total is just the base price", () => {
    const { total, specialPricingDiscount } = combineFreshPricing(
      null,
      null,
      100,
    );
    assert.equal(total, 100);
    assert.equal(specialPricingDiscount, 0);
  });

  it("fee breakdown present: total comes from the fee breakdown, not the base price", () => {
    const { total } = combineFreshPricing({ total: 105 }, null, 100);
    assert.equal(total, 105);
  });

  it("special pricing subtracts from the fee-inclusive total", () => {
    const { total, specialPricingDiscount } = combineFreshPricing(
      { total: 105 },
      { has_special_pricing: true, total_discount: 20 },
      100,
    );
    assert.equal(specialPricingDiscount, 20);
    assert.equal(total, 85);
  });

  it("special pricing with has_special_pricing false contributes no discount", () => {
    const { total, specialPricingDiscount } = combineFreshPricing(
      { total: 105 },
      { has_special_pricing: false, total_discount: 20 },
      100,
    );
    assert.equal(specialPricingDiscount, 0);
    assert.equal(total, 105);
  });

  it("no fee breakdown but special pricing: discount comes off the base price", () => {
    const { total } = combineFreshPricing(
      null,
      { has_special_pricing: true, total_discount: 15 },
      100,
    );
    assert.equal(total, 85);
  });

  it("never returns a negative total even if the discount exceeds the fee total", () => {
    const { total } = combineFreshPricing(
      { total: 10 },
      { has_special_pricing: true, total_discount: 50 },
      10,
    );
    assert.equal(total, 0);
  });

  it(
    "the stale/debounced bug this exists to fix: a NEW base price (from a " +
      "quantity/participant change) produces a NEW total — the caller never " +
      "has to read back a previous fee breakdown to get the current amount",
    () => {
      const stale = combineFreshPricing({ total: 55 }, null, 50);
      assert.equal(stale.total, 55);

      const fresh = combineFreshPricing({ total: 110 }, null, 100);
      assert.equal(fresh.total, 110);
      assert.notEqual(fresh.total, stale.total);
    },
  );
});
