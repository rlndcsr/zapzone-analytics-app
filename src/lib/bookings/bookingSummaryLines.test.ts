import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addOnSummaryLine,
  attractionSummaryLine,
  extraParticipantsSummaryLine,
  packageSummaryLine,
  type SummaryPackage,
} from "./bookingSummaryLines.ts";

const flat = (over: Partial<SummaryPackage> = {}): SummaryPackage => ({
  pricingType: "flat",
  price: 199,
  minParticipants: 8,
  pricePerAdditional: 15,
  participantLabel: "",
  ...over,
});

const perPerson = (over: Partial<SummaryPackage> = {}): SummaryPackage => ({
  pricingType: "per_person",
  price: 25,
  minParticipants: 4,
  pricePerAdditional: 0,
  participantLabel: "Player",
  ...over,
});

describe("the package line", () => {
  it("prices a flat package at its headline price, whatever the head count", () => {
    assert.deepEqual(packageSummaryLine(flat(), 8), {
      label: "Package",
      hint: "(up to 8 people)",
      amount: 199,
    });

    // The extra heads are extraParticipantsSummaryLine's line, not this one.
    assert.equal(packageSummaryLine(flat(), 12)?.amount, 199);
  });

  it("shows the arithmetic for a per-person package", () => {
    assert.deepEqual(packageSummaryLine(perPerson(), 4), {
      label: "Package",
      hint: "(4 × $25.00 per player)",
      amount: 100,
    });
  });

  it("falls back to 'participant' when the package names no participant label", () => {
    const line = packageSummaryLine(perPerson({ participantLabel: "" }), 2);
    assert.equal(line?.hint, "(2 × $25.00 per participant)");
  });

  it("drops the hint for a flat package that has no real minimum", () => {
    assert.equal(packageSummaryLine(flat({ minParticipants: 1 }), 5)?.hint, null);
    assert.equal(packageSummaryLine(flat({ minParticipants: null }), 5)?.hint, null);
  });

  it("has no line without a package", () => {
    assert.equal(packageSummaryLine(null, 8), null);
  });
});

describe("the extra participants line", () => {
  it("charges only the heads past the minimum", () => {
    assert.deepEqual(extraParticipantsSummaryLine(flat(), 11), {
      label: "+3 extra participants × $15.00",
      amount: 45,
    });
  });

  it("says 'participant' for exactly one", () => {
    assert.equal(
      extraParticipantsSummaryLine(flat(), 9)?.label,
      "+1 extra participant × $15.00",
    );
  });

  it("never double-charges a per-person package's heads", () => {
    // They are already in the package line; billing them again here is the bug.
    assert.equal(extraParticipantsSummaryLine(perPerson(), 20), null);
  });

  it("stays silent at or under the minimum, and when extras are free", () => {
    assert.equal(extraParticipantsSummaryLine(flat(), 8), null);
    assert.equal(extraParticipantsSummaryLine(flat(), 3), null);
    assert.equal(extraParticipantsSummaryLine(flat({ pricePerAdditional: 0 }), 12), null);
  });
});

describe("an add-on line", () => {
  it("multiplies a flat add-on by quantity alone", () => {
    assert.deepEqual(
      addOnSummaryLine({ name: "Meat Lover Pizza", pricingType: "flat" }, 1, 19.99, 8),
      { label: "Meat Lover Pizza", amount: 19.99 },
    );
  });

  it("shows the quantity once there is more than one", () => {
    const line = addOnSummaryLine({ name: "Pizza", pricingType: "flat" }, 3, 20, 8);
    assert.equal(line.label, "Pizza ×3");
    assert.equal(line.amount, 60);
  });

  it("multiplies a per-person add-on by the head count too", () => {
    const line = addOnSummaryLine({ name: "Wristband", pricingType: "per_person" }, 2, 5, 8);
    assert.equal(line.label, "Wristband ×2 × 8");
    assert.equal(line.amount, 80);
  });

  it("uses the unit price it is handed, not the catalog's", () => {
    // A booking's frozen price is what the guest agreed to.
    assert.equal(
      addOnSummaryLine({ name: "Pizza", pricingType: "flat" }, 1, 14.5, 8).amount,
      14.5,
    );
  });
});

describe("an attraction line", () => {
  it("prices at the frozen price times the quantity", () => {
    assert.deepEqual(
      attractionSummaryLine({ name: "Laser Tag", quantity: 2, priceAtBooking: 12.5 }),
      { label: "Laser Tag ×2", amount: 25 },
    );
  });

  it("leaves a single attraction's name bare", () => {
    assert.equal(
      attractionSummaryLine({ name: "Laser Tag", quantity: 1, priceAtBooking: 12.5 }).label,
      "Laser Tag",
    );
  });
});
