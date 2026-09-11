import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  packagePriceForParticipants,
  participantLabelFor,
} from "./packagePricing.ts";

describe("pricing a per-person package", () => {
  it("charges the per-player price times the headcount", () => {
    assert.equal(
      packagePriceForParticipants({
        pricingType: "per_person",
        price: 25,
        participants: 8,
      }),
      200,
    );
  });

  it("ignores minParticipants/pricePerAdditional entirely", () => {
    assert.equal(
      packagePriceForParticipants({
        pricingType: "per_person",
        price: 25,
        minParticipants: 4,
        pricePerAdditional: 999,
        participants: 8,
      }),
      200,
    );
  });

  it("floors headcount at 1 player", () => {
    assert.equal(
      packagePriceForParticipants({
        pricingType: "per_person",
        price: 25,
        participants: 0,
      }),
      25,
    );
  });
});

describe("pricing a base (flat) package", () => {
  const BASE = {
    pricingType: "base",
    price: 150,
    minParticipants: 8,
    pricePerAdditional: 10,
  };

  it("charges the flat price up to the minimum", () => {
    assert.equal(
      packagePriceForParticipants({ ...BASE, participants: 6 }),
      150,
    );
    assert.equal(
      packagePriceForParticipants({ ...BASE, participants: 8 }),
      150,
    );
  });

  it("adds the per-additional-participant price past the minimum", () => {
    assert.equal(
      packagePriceForParticipants({ ...BASE, participants: 10 }),
      170,
    );
  });

  it("treats a missing/blank pricing type as base", () => {
    assert.equal(
      packagePriceForParticipants({
        price: 150,
        minParticipants: 8,
        pricePerAdditional: 10,
        participants: 10,
      }),
      170,
    );
  });

  it("treats an unset minimum as 1", () => {
    assert.equal(
      packagePriceForParticipants({
        pricingType: "base",
        price: 50,
        pricePerAdditional: 5,
        participants: 3,
      }),
      60,
    );
  });
});

describe("the participant label", () => {
  it("lowercases and trims a configured label", () => {
    assert.equal(participantLabelFor("  Player  "), "player");
    assert.equal(participantLabelFor("Guest"), "guest");
  });

  it("falls back to 'player' when blank or unset", () => {
    assert.equal(participantLabelFor(""), "player");
    assert.equal(participantLabelFor("   "), "player");
    assert.equal(participantLabelFor(null), "player");
    assert.equal(participantLabelFor(undefined), "player");
  });
});
