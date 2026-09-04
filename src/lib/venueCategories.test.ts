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

/**
 * The screens keep their rows raw and normalize at each read site instead, so
 * these cover the four shapes that read sites take. They mirror the actual
 * expressions in packages.tsx, custom-packages.tsx, attractions.tsx,
 * create-purchase.tsx and TargetingPicker.tsx — if one of those is rewritten to
 * compare or serialise a category differently, the matching case here is what
 * says whether the new shape still holds.
 */
describe("the read-side shapes the screens use", () => {
  const rows = [
    { name: "Vault Break", category: "Beginner", price: 30 },
    { name: "Lost Tomb", category: "Advanced", price: 45 },
    { name: "Cell Block", category: "Escape Room", price: 40 },
    { name: "Lane Party", category: "Bowling", price: 25 },
    { name: "Unfiled", category: "", price: 10 },
  ];

  it("collapses the aliases into one filter option", () => {
    // packages.tsx `categoryOptions`, TargetingPicker's `categories`.
    const options = Array.from(
      new Set(rows.map((r) => normalizeCategory(r.category)).filter(Boolean)),
    ).sort();

    assert.deepEqual(options, ["Bowling", ESCAPE_ROOM_CATEGORY]);
  });

  it("selects every variant when both sides of the filter normalize", () => {
    // packages.tsx `matchesCategory`. The chip carries the normalized label,
    // the rows carry the stored word — only normalizing both makes them agree.
    const selected = ESCAPE_ROOM_CATEGORY;
    const matched = rows.filter(
      (r) => normalizeCategory(r.category) === normalizeCategory(selected),
    );

    assert.deepEqual(
      matched.map((r) => r.name),
      ["Vault Break", "Lost Tomb", "Cell Block"],
    );
  });

  it("would miss the difficulties if only one side normalized", () => {
    const missed = rows.filter((r) => r.category === ESCAPE_ROOM_CATEGORY);

    assert.deepEqual(
      missed.map((r) => r.name),
      ["Cell Block"],
    );
  });

  it("finds a stored difficulty by its displayed category", () => {
    // The search haystacks in attractions.tsx / custom-packages.tsx /
    // create-purchase.tsx: typing "escape room" has to reach "Beginner".
    const term = "escape room";
    const hits = rows.filter((r) =>
      `${r.name} ${normalizeCategory(r.category)}`.toLowerCase().includes(term),
    );

    assert.deepEqual(
      hits.map((r) => r.name),
      ["Vault Break", "Lost Tomb", "Cell Block"],
    );
  });

  it("keeps the stored word in an export payload", () => {
    // packages.tsx `runExport` and AttractionsExportSheet: the file is read
    // back by the importer, so normalizing here would rewrite "Advanced" to
    // "Escape Room" on the next round trip and lose the difficulty.
    const exported = rows.map((r) => ({ name: r.name, category: r.category }));

    assert.deepEqual(
      exported.map((r) => r.category),
      ["Beginner", "Advanced", "Escape Room", "Bowling", ""],
    );
  });
});
