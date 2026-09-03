import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ESCAPE_ROOM_CATEGORY,
  isEscapeRoomCategory,
  normalizeCategory,
} from "./venueCategories.ts";

const ESCAPE_ROOM_ALIASES = [
  "escape room",
  "escape rooms",
  "escaperoom",
  "escaperooms",
  "escape-room",
  "beginner",
  "beginners",
  "novice",
  "easy",
  "starter",
  "intermediate",
  "medium",
  "moderate",
  "advanced",
  "hard",
  "difficult",
  "expert",
  "master",
  "extreme",
  "impossible",
];

describe("folding the escape-room vocabulary", () => {
  it("folds every spelling and difficulty onto one name", () => {
    for (const alias of ESCAPE_ROOM_ALIASES) {
      assert.equal(
        normalizeCategory(alias),
        ESCAPE_ROOM_CATEGORY,
        `${alias} did not fold`,
      );
    }
  });

  it("matches regardless of capitalisation", () => {
    assert.equal(normalizeCategory("ADVANCED"), ESCAPE_ROOM_CATEGORY);
    assert.equal(normalizeCategory("Beginner"), ESCAPE_ROOM_CATEGORY);
    assert.equal(normalizeCategory("EsCaPe RoOm"), ESCAPE_ROOM_CATEGORY);
  });

  it("trims and collapses whitespace before matching", () => {
    assert.equal(normalizeCategory("  advanced  "), ESCAPE_ROOM_CATEGORY);
    assert.equal(normalizeCategory("escape   room"), ESCAPE_ROOM_CATEGORY);
    assert.equal(normalizeCategory("\tEscape  Rooms "), ESCAPE_ROOM_CATEGORY);
  });

  it("answers the escape-room question off the same rules", () => {
    assert.equal(isEscapeRoomCategory("Advanced"), true);
    assert.equal(isEscapeRoomCategory("escaperoom"), true);
    assert.equal(isEscapeRoomCategory("Birthday"), false);
    assert.equal(isEscapeRoomCategory(null), false);
  });
});

describe("what the helper deliberately leaves alone", () => {
  it("passes an unrelated category through untouched", () => {
    assert.equal(normalizeCategory("Birthday"), "Birthday");
    assert.equal(normalizeCategory("Laser Tag"), "Laser Tag");
    assert.equal(normalizeCategory("Bowling"), "Bowling");
  });

  it("keeps the original casing of anything it does not fold", () => {
    assert.equal(normalizeCategory("BIRTHDAY"), "BIRTHDAY");
    assert.equal(normalizeCategory("  Laser Tag  "), "Laser Tag");
  });

  it("only folds a whole string, never a prefix or suffix", () => {
    assert.equal(
      normalizeCategory("Escape Room - Advanced"),
      "Escape Room - Advanced",
    );
    assert.equal(normalizeCategory("Advanced Bowling"), "Advanced Bowling");
    assert.equal(normalizeCategory("Beginner Yoga"), "Beginner Yoga");
  });

  it("leaves nothing as nothing rather than inventing a category", () => {
    assert.equal(normalizeCategory(""), "");
    assert.equal(normalizeCategory("   "), "");
    assert.equal(normalizeCategory(null), "");
    assert.equal(normalizeCategory(undefined), "");
  });
});
