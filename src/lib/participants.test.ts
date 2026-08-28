import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampParticipants,
  participantLimitsLabel,
  participantMax,
  participantMin,
} from "./participants.ts";

/** A party package: at least 8 players, at most 25. */
const PARTY = { minParticipants: 8, maxParticipants: 25 };
/** A package with no ceiling configured. */
const OPEN = { minParticipants: 2, maxParticipants: 0 };

describe("reading a package's limits", () => {
  it("treats an unset minimum as 1", () => {
    assert.equal(participantMin({ minParticipants: 0 }), 1);
    assert.equal(participantMin({ minParticipants: null }), 1);
    assert.equal(participantMin(null), 1);
  });

  it("treats an unset maximum as unbounded", () => {
    assert.equal(participantMax({ maxParticipants: 0 }), null);
    assert.equal(participantMax({ maxParticipants: null }), null);
    assert.equal(participantMax(null), null);
  });

  it("reads configured limits", () => {
    assert.equal(participantMin(PARTY), 8);
    assert.equal(participantMax(PARTY), 25);
  });
});

describe("clamping a player count", () => {
  it("leaves a count inside the range alone", () => {
    assert.equal(clampParticipants(12, PARTY), 12);
  });

  it("raises a count below the package minimum", () => {
    assert.equal(clampParticipants(3, PARTY), 8);
  });

  it("caps a count above the package maximum", () => {
    assert.equal(clampParticipants(40, PARTY), 25);
  });

  it("does not cap when the package has no maximum", () => {
    assert.equal(clampParticipants(500, OPEN), 500);
  });

  it("truncates fractions to whole players", () => {
    assert.equal(clampParticipants(12.9, PARTY), 12);
    assert.equal(clampParticipants("12.9", PARTY), 12);
  });

  it("falls back to the minimum for an empty or unparseable field", () => {
    assert.equal(clampParticipants("", PARTY), 8);
    assert.equal(clampParticipants("abc", PARTY), 8);
    assert.equal(clampParticipants(null, PARTY), 8);
    assert.equal(clampParticipants(undefined, PARTY), 8);
    assert.equal(clampParticipants(NaN, PARTY), 8);
  });

  it("never returns a negative count", () => {
    assert.equal(clampParticipants(-5, PARTY), 8);
    assert.equal(clampParticipants(-5, null), 1);
  });

  it("parses a typed string of digits", () => {
    assert.equal(clampParticipants("15", PARTY), 15);
  });

  it("lets the maximum win when a package is misconfigured below its minimum", () => {
    assert.equal(clampParticipants(10, { minParticipants: 8, maxParticipants: 4 }), 4);
  });
});

describe("the limits hint", () => {
  it("shows both bounds when the package sets a maximum", () => {
    assert.equal(participantLimitsLabel(PARTY), "Min: 8 • Max: 25");
  });

  it("omits the maximum when the package is unbounded", () => {
    assert.equal(participantLimitsLabel(OPEN), "Min: 2");
  });
});
