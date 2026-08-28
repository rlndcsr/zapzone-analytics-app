import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampAddOnQuantity,
  getAddOnMinQuantity,
  isForceAddOn,
  seedForcedAddOns,
} from "./addOnQuantity.ts";

const PKG = 7;

/** A forced add-on priced for package 7 with a minimum of 2. */
const forced = {
  id: 1,
  isForced: true,
  minQuantity: 0,
  maxQuantity: null,
  priceEachPackages: [{ package_id: PKG, price: 5, minimum_quantity: 2 }],
};

/** Flagged forced, but not priced for any package — so not binding anywhere. */
const danglingForced = {
  id: 2,
  isForced: true,
  minQuantity: 0,
  maxQuantity: null,
  priceEachPackages: [],
};

describe("recognising a forced add-on", () => {
  it("is forced only for a package it is explicitly priced for", () => {
    assert.equal(isForceAddOn(forced, PKG), true);
    assert.equal(isForceAddOn(forced, 99), false);
  });

  it("is not forced when the flag is set but no package is priced", () => {
    assert.equal(isForceAddOn(danglingForced, PKG), false);
  });

  it("is not forced with no package in context", () => {
    assert.equal(isForceAddOn(forced, null), false);
  });
});

describe("resolving the minimum quantity", () => {
  it("prefers the per-package override over the global minimum", () => {
    assert.equal(getAddOnMinQuantity({ ...forced, minQuantity: 1 }, PKG), 2);
  });

  it("falls back to the global minimum for other packages", () => {
    assert.equal(getAddOnMinQuantity({ ...forced, minQuantity: 1 }, 99), 1);
  });
});

describe("clamping a requested quantity", () => {
  it("holds a forced add-on at its minimum instead of deselecting it", () => {
    assert.equal(clampAddOnQuantity(forced, PKG, 2, 1), 2);
    assert.equal(clampAddOnQuantity(forced, PKG, 2, 0), 2);
  });

  it("caps at max_quantity", () => {
    const capped = { minQuantity: 0, maxQuantity: 3 };
    assert.equal(clampAddOnQuantity(capped, null, 3, 4), 3);
  });

  it("defaults to 99 when the add-on sets no maximum", () => {
    assert.equal(clampAddOnQuantity({ minQuantity: 0 }, null, 99, 200), 99);
  });

  it("snaps up to the minimum when increasing into the gap", () => {
    const min3 = { minQuantity: 3, maxQuantity: null };
    assert.equal(clampAddOnQuantity(min3, null, 0, 1), 3);
  });

  it("drops to zero when decreasing below the minimum", () => {
    const min3 = { minQuantity: 3, maxQuantity: null };
    assert.equal(clampAddOnQuantity(min3, null, 3, 2), 0);
  });

  it("never returns a negative quantity", () => {
    assert.equal(clampAddOnQuantity({ minQuantity: 0 }, null, 0, -5), 0);
  });
});

describe("seeding a package's forced add-ons", () => {
  it("starts forced add-ons at their per-package minimum", () => {
    const seeded = seedForcedAddOns({
      id: PKG,
      addOns: [forced, danglingForced],
    });
    assert.deepEqual(seeded, { 1: 2 });
  });

  it("seeds nothing without a package", () => {
    assert.deepEqual(seedForcedAddOns(null), {});
  });
});
