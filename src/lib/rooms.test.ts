import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  areaGroupChanges,
  areaGroupValue,
  roomIsAvailable,
  selectedSpacesHoldStartsApart,
  sortRoomsNumerically,
  summarizeAreaGroup,
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

describe("Area Group Settings opening state (web areaGroupSummary)", () => {
  const room = (bookingInterval: number | null, areaAllowsSimultaneousStarts = false) => ({
    bookingInterval,
    areaAllowsSimultaneousStarts,
  });

  it("fills one shared turnaround and leaves different ones blank with the range", () => {
    assert.equal(summarizeAreaGroup([room(15), room(15)]).turnaround, "15");
    const mixed = summarizeAreaGroup([room(30), room(10), room(null)]);
    assert.equal(mixed.turnaround, "");
    assert.equal(mixed.turnaroundRange, "10–30 min");
    assert.equal(mixed.largestTurnaround, 30);
  });

  it("ticks the box only when every space starts together, and marks a split as mixed", () => {
    const all = summarizeAreaGroup([room(15, true), room(15, true)]);
    assert.equal(all.startsTogether, true);
    assert.equal(all.startsTogetherMixed, false);
    const split = summarizeAreaGroup([room(15, true), room(15, false)]);
    assert.equal(split.startsTogether, false);
    assert.equal(split.startsTogetherMixed, true);
    const none = summarizeAreaGroup([]);
    assert.equal(none.startsTogether, false);
    assert.equal(none.largestTurnaround, null);
  });
});

describe("what an Area Group Settings save sends (web handleAreaGroupIntervalUpdate)", () => {
  const base = { interval: "", intervalTouched: false, startsTogether: false, startsTogetherTouched: false };

  it("sends nothing when no control was changed", () => {
    assert.deepEqual(areaGroupChanges(base), { kind: "nothing" });
    // a field typed into and then cleared keeps everyone's turnaround
    assert.deepEqual(areaGroupChanges({ ...base, intervalTouched: true, interval: "  " }), { kind: "nothing" });
  });

  it("ticking the box never sends a turnaround", () => {
    assert.deepEqual(areaGroupChanges({ ...base, startsTogether: true, startsTogetherTouched: true }), {
      kind: "save",
      changes: { allowsSimultaneousStarts: true },
    });
  });

  it("sends a typed turnaround, 0 included, and both when both changed", () => {
    assert.deepEqual(areaGroupChanges({ ...base, interval: "0", intervalTouched: true }), {
      kind: "save",
      changes: { bookingInterval: 0 },
    });
    assert.deepEqual(
      areaGroupChanges({ interval: "20", intervalTouched: true, startsTogether: false, startsTogetherTouched: true }),
      { kind: "save", changes: { bookingInterval: 20, allowsSimultaneousStarts: false } },
    );
  });

  it("rejects a turnaround below 0", () => {
    assert.deepEqual(areaGroupChanges({ ...base, interval: "-5", intervalTouched: true }), { kind: "invalid" });
  });
});

describe("whether picked spaces hold starts apart (web selectedSpacesHoldStartsApart)", () => {
  const space = (id: number, areaGroup: string | null, together = false, isAvailable = true) => ({
    id,
    areaGroup,
    isAvailable,
    areaAllowsSimultaneousStarts: together,
  });

  it("is true for a picked space in a shared area that keeps starts apart", () => {
    assert.equal(selectedSpacesHoldStartsApart([1], [space(1, "A"), space(2, "A")]), true);
  });

  it("is false once every space in the area may start together", () => {
    assert.equal(selectedSpacesHoldStartsApart([1], [space(1, "A", true), space(2, "A", true)]), false);
    assert.equal(selectedSpacesHoldStartsApart([1], [space(1, "A", true), space(2, "A", false)]), true);
  });

  it("is false for an ungrouped, lone, unavailable or unknown space", () => {
    assert.equal(selectedSpacesHoldStartsApart([1], [space(1, null), space(2, null)]), false);
    assert.equal(selectedSpacesHoldStartsApart([1], [space(1, "A"), space(2, "B")]), false);
    assert.equal(selectedSpacesHoldStartsApart([1], [space(1, "A", false, false), space(2, "A")]), false);
    assert.equal(selectedSpacesHoldStartsApart([9], [space(1, "A"), space(2, "A")]), false);
  });
});
