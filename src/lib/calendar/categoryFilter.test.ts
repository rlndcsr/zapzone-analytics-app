import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ESCAPE_ROOM_CATEGORY } from "../venueCategories.ts";
import {
  buildCalendarCategories,
  categoryKeyOf,
  categoryLabelOf,
  EVENTS_CATEGORY_KEY,
  UNCATEGORISED_CATEGORY_KEY,
} from "./categoryFilter.ts";

describe("the key a row is grouped and filtered under", () => {
  it("folds the escape-room difficulties into one group", () => {
    assert.equal(categoryKeyOf("Beginner"), ESCAPE_ROOM_CATEGORY);
    assert.equal(categoryKeyOf("Advanced"), ESCAPE_ROOM_CATEGORY);
    assert.equal(categoryKeyOf("Escape Room"), ESCAPE_ROOM_CATEGORY);
  });

  it("leaves every other category exactly where it was", () => {
    assert.equal(categoryKeyOf("Birthday"), "Birthday");
    assert.equal(categoryKeyOf("Laser Tag"), "Laser Tag");
  });

  it("still buckets nothing under No category", () => {
    assert.equal(categoryKeyOf(""), UNCATEGORISED_CATEGORY_KEY);
    assert.equal(categoryKeyOf("   "), UNCATEGORISED_CATEGORY_KEY);
    assert.equal(categoryKeyOf(null), UNCATEGORISED_CATEGORY_KEY);
    assert.equal(categoryLabelOf(UNCATEGORISED_CATEGORY_KEY), "No category");
  });
});

describe("counting a window of calendar rows", () => {
  it("shows one Escape Room pill carrying the combined count", () => {
    const categories = buildCalendarCategories({
      bookings: [
        { packageCategory: "Beginner" },
        { packageCategory: "Advanced" },
        { packageCategory: "Escape Room" },
        { packageCategory: "Birthday" },
      ],
    });

    const escapeRoom = categories.filter((c) => c.key === ESCAPE_ROOM_CATEGORY);
    assert.equal(escapeRoom.length, 1, "expected a single Escape Room pill");
    assert.equal(escapeRoom[0].count, 3);
    assert.equal(escapeRoom[0].label, ESCAPE_ROOM_CATEGORY);

    // The unrelated category is untouched and still its own pill.
    assert.deepEqual(
      categories.map((c) => c.key).sort(),
      ["Birthday", ESCAPE_ROOM_CATEGORY].sort(),
    );
  });

  it("combines bookings and tickets into the one group", () => {
    const categories = buildCalendarCategories({
      bookings: [{ packageCategory: "Advanced" }],
      attractions: [{ category: "beginner" }],
    });

    assert.equal(categories.length, 1);
    assert.equal(categories[0].key, ESCAPE_ROOM_CATEGORY);
    assert.equal(categories[0].count, 2);
    // Both sources are tracked, so the pill still tints as mixed.
    assert.deepEqual(categories[0].sources.sort(), ["attraction", "booking"]);
  });

  it("leaves the Events bucket and No category alone", () => {
    const categories = buildCalendarCategories({
      bookings: [{ packageCategory: "" }],
      events: [{}, {}],
    });

    const keys = categories.map((c) => c.key);
    assert.ok(keys.includes(EVENTS_CATEGORY_KEY));
    assert.ok(keys.includes(UNCATEGORISED_CATEGORY_KEY));
    assert.equal(
      categories.find((c) => c.key === EVENTS_CATEGORY_KEY)?.count,
      2,
    );
  });
});

describe("filtering by the folded group", () => {
  it("selecting Escape Room matches every difficulty beneath it", () => {
    // What each screen does: compare the row's key against the chosen key.
    const rows = [
      { category: "Beginner" },
      { category: "Advanced" },
      { category: "Escape Room" },
      { category: "Birthday" },
    ];
    const matched = rows.filter(
      (r) => categoryKeyOf(r.category) === ESCAPE_ROOM_CATEGORY,
    );
    assert.equal(matched.length, 3);
  });

  it("does not sweep an unrelated category into the group", () => {
    const rows = [{ category: "Birthday" }, { category: "Advanced Bowling" }];
    const matched = rows.filter(
      (r) => categoryKeyOf(r.category) === ESCAPE_ROOM_CATEGORY,
    );
    assert.equal(matched.length, 0);
  });
});
