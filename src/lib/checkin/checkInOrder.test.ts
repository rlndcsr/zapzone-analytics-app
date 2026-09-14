import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sortForCheckIn } from "./checkInOrder.ts";

/** The five rows from the web desk, in the order it shows them. */
const DAY = [
  { id: 11, time: "20:15" }, // Francesca — 8:15 PM
  { id: 13, time: "19:00" }, // Stephanie — 7:00 PM
  { id: 10, time: "18:00" }, // Mike      — 6:00 PM
  { id: 9, time: "16:45" }, //  Devin     — 4:45 PM
  { id: 12, time: "16:15" }, // Cindy     — 4:15 PM
];

const ids = (rows: { id: number }[]) => rows.map((r) => r.id);

describe("sortForCheckIn", () => {
  it("puts the latest slot first, like the web desk", () => {
    // Shuffled, including the exact reversal the app used to show.
    const shuffled = [...DAY].reverse();
    assert.deepEqual(ids(sortForCheckIn(shuffled)), ids(DAY));
  });

  it("sorts by the clock, not by the string's first digit", () => {
    // "9:30" would beat "10:00" on a naive compare; zero-padding is the reason
    // a plain string comparison is safe here.
    const rows = [
      { id: 1, time: "09:30" },
      { id: 2, time: "10:00" },
    ];
    assert.deepEqual(ids(sortForCheckIn(rows)), [2, 1]);
  });

  it("handles noon and midnight without flipping them", () => {
    const rows = [
      { id: 1, time: "00:05" },
      { id: 2, time: "12:00" },
      { id: 3, time: "23:59" },
    ];
    assert.deepEqual(ids(sortForCheckIn(rows)), [3, 2, 1]);
  });

  it("sinks a booking with no time to the bottom", () => {
    const rows = [
      { id: 1, time: null },
      { id: 2, time: "08:00" },
      { id: 3, time: null },
      { id: 4, time: "21:00" },
    ];
    const sorted = ids(sortForCheckIn(rows));
    assert.deepEqual(sorted.slice(0, 2), [4, 2]);
    assert.deepEqual(sorted.slice(2).sort(), [1, 3]);
  });

  it("breaks a shared slot on id, so reloads never reshuffle the rows", () => {
    const rows = [
      { id: 5, time: "14:00" },
      { id: 7, time: "14:00" },
      { id: 6, time: "14:00" },
    ];
    assert.deepEqual(ids(sortForCheckIn(rows)), [7, 6, 5]);
    // Same input in a different arrival order must land the same way — that is
    // the whole point: the API's order for a single day is arbitrary.
    assert.deepEqual(ids(sortForCheckIn([...rows].reverse())), [7, 6, 5]);
  });

  it("leaves the caller's array alone", () => {
    const rows = [...DAY].reverse();
    const before = ids(rows);
    sortForCheckIn(rows);
    assert.deepEqual(ids(rows), before);
  });
});
