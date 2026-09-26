import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  areaGroupValue,
  roomIsAvailable,
  sortRoomsNumerically,
  turnaroundUpdate,
} from "./rooms.ts";

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

describe("turnaroundUpdate — what an edited space sends for its turnaround", () => {
  it("saves a typed 0 as 0, not as the default", () => {
    assert.deepEqual(turnaroundUpdate("0"), { booking_interval: 0 });
  });

  it("saves a typed positive value as typed", () => {
    assert.deepEqual(turnaroundUpdate("15"), { booking_interval: 15 });
    assert.deepEqual(turnaroundUpdate(" 30 "), { booking_interval: 30 });
  });

  it("leaves the stored value alone when the box is empty", () => {
    assert.deepEqual(turnaroundUpdate(""), {});
    assert.deepEqual(turnaroundUpdate("   "), {});
    assert.equal("booking_interval" in turnaroundUpdate(""), false);
  });

  it("never writes something it cannot read", () => {
    assert.deepEqual(turnaroundUpdate("-5"), {});
    assert.deepEqual(turnaroundUpdate("abc"), {});
  });
});

describe("areaGroupValue", () => {
  it("sends null for a cleared or blank box, so the space is ungrouped", () => {
    assert.equal(areaGroupValue(""), null);
    assert.equal(areaGroupValue("   "), null);
    // null survives the request body; undefined would be dropped
    assert.equal(JSON.stringify({ area_group: areaGroupValue("") }), '{"area_group":null}');
  });

  it("sends the new group, trimmed", () => {
    assert.equal(areaGroupValue(" Zone B "), "Zone B");
  });
});

describe("roomIsAvailable", () => {
  it("reads the is_available column", () => {
    assert.equal(roomIsAvailable({ is_available: true }), true);
    assert.equal(roomIsAvailable({ is_available: 1 }), true);
    assert.equal(roomIsAvailable({ is_available: false }), false);
    assert.equal(roomIsAvailable({ is_available: 0 }), false);
  });

  it("lets is_available win over the older shapes", () => {
    assert.equal(roomIsAvailable({ is_available: false, status: "active" }), false);
  });

  it("falls back to the older shapes when is_available is absent", () => {
    assert.equal(roomIsAvailable({ is_active: false }), false);
    assert.equal(roomIsAvailable({ status: "inactive" }), false);
    assert.equal(roomIsAvailable({}), true);
  });
});
