import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSlotRemainingMap,
  clampToRemaining,
  isLowRemaining,
  quantityCeiling,
  remainingForSlot,
} from "./ticketLimits.ts";

/** The shape GET /attractions/{id}/slot-availability/{date} is mapped into. */
const availability = (
  cap: number | null,
  remaining: Record<string, number> | null,
) => ({
  date: "2026-08-25",
  maxTicketsPerSlot: cap,
  bookedBySlot: {},
  remainingBySlot: remaining,
});

describe("building the slot-remaining map", () => {
  it("is null for an uncapped attraction, so no counter is ever shown", () => {
    assert.equal(buildSlotRemainingMap(availability(null, null)), null);
    // Even if the API were to send counts, no cap means no limit to display.
    assert.equal(buildSlotRemainingMap(availability(null, { "10:00": 4 })), null);
  });

  it("carries the cap alongside the per-slot counts", () => {
    assert.deepEqual(
      buildSlotRemainingMap(availability(10, { "10:00": 2, "11:00": 0 })),
      { __cap: 10, "10:00": 2, "11:00": 0 },
    );
  });

  it("holds just the cap when nothing is booked yet", () => {
    assert.deepEqual(buildSlotRemainingMap(availability(8, {})), { __cap: 8 });
    assert.deepEqual(buildSlotRemainingMap(availability(8, null)), { __cap: 8 });
  });
});

describe("reading a slot's remaining tickets", () => {
  const map = buildSlotRemainingMap(availability(10, { "10:00": 3, "12:00": 0 }));

  it("returns the booked slot's own count", () => {
    assert.equal(remainingForSlot(map, "10:00"), 3);
  });

  it("falls back to the full cap for a slot with no bookings", () => {
    assert.equal(remainingForSlot(map, "14:00"), 10);
  });

  it("reports a sold-out slot as zero, not as the cap", () => {
    assert.equal(remainingForSlot(map, "12:00"), 0);
  });

  it("tolerates HH:mm:ss times from the API", () => {
    assert.equal(remainingForSlot(map, "10:00:00"), 3);
  });

  it("is null with no map, or before a time is picked", () => {
    assert.equal(remainingForSlot(null, "10:00"), null);
    assert.equal(remainingForSlot(map, ""), null);
    assert.equal(remainingForSlot(map, null), null);
  });
});

describe("the quantity ceiling a slot imposes", () => {
  it("keeps the caller's own ceiling when there is no cap", () => {
    assert.equal(quantityCeiling(null, 99), 99);
  });

  it("uses whichever of the two limits is tighter", () => {
    assert.equal(quantityCeiling(4, 99), 4);
    assert.equal(quantityCeiling(40, 12), 12);
  });

  it("never drops below 1 — a sold-out slot still reads as one ticket, and the server refuses the sale", () => {
    assert.equal(quantityCeiling(0, 99), 1);
  });
});

describe("clamping an existing quantity onto a newly picked slot", () => {
  it("leaves the quantity alone when the slot has room", () => {
    assert.equal(clampToRemaining(3, 8), 3);
    assert.equal(clampToRemaining(3, null), 3);
  });

  it("trims it down to what is left", () => {
    assert.equal(clampToRemaining(9, 4), 4);
  });

  it("bottoms out at 1 on a sold-out slot", () => {
    assert.equal(clampToRemaining(9, 0), 1);
  });
});

describe("the low-stock colour threshold", () => {
  it("turns amber at three or fewer, emerald above", () => {
    assert.equal(isLowRemaining(0), true);
    assert.equal(isLowRemaining(3), true);
    assert.equal(isLowRemaining(4), false);
  });
});
