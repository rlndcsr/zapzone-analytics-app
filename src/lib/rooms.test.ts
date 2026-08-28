import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortRoomsNumerically } from "./rooms.ts";

const names = (rooms: { name: string }[]) => rooms.map((r) => r.name);
const spaces = (...list: string[]) => list.map((name, i) => ({ id: i, name }));

describe("ordering the space chips", () => {
  it("sorts on the number in the name, not alphabetically", () => {
    const sorted = sortRoomsNumerically(
      spaces("Table 10", "Table 2", "Table 1", "Table 9"),
    );
    assert.deepEqual(names(sorted), [
      "Table 1",
      "Table 2",
      "Table 9",
      "Table 10",
    ]);
  });

  it("falls back to alphabetical for names sharing a number", () => {
    const sorted = sortRoomsNumerically(spaces("Room 3", "Bay 3", "Table 3"));
    assert.deepEqual(names(sorted), ["Bay 3", "Room 3", "Table 3"]);
  });

  it("treats a name with no digits as zero, so it leads", () => {
    const sorted = sortRoomsNumerically(spaces("Table 2", "Patio"));
    assert.deepEqual(names(sorted), ["Patio", "Table 2"]);
  });

  it("leaves the caller's array untouched", () => {
    const original = spaces("Table 2", "Table 1");
    sortRoomsNumerically(original);
    assert.deepEqual(names(original), ["Table 2", "Table 1"]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(sortRoomsNumerically([]), []);
  });
});
