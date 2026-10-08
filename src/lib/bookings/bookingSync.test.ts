import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CalendarBooking } from "../../services/bookingsService.ts";
import { applyBookingChanges, newestFirst } from "./bookingSync.ts";

const row = (id: number, date: string, over: Partial<CalendarBooking> = {}) =>
  ({ id, date, status: "confirmed", ...over }) as CalendarBooking;

describe("ordering a synced bookings list", () => {
  it("puts the latest booking date first, then the newest id", () => {
    const sorted = newestFirst([
      row(1, "2026-10-01"),
      row(3, "2026-10-05"),
      row(2, "2026-10-05"),
      row(4, "2026-09-30"),
    ]);
    assert.deepEqual(
      sorted.map((b) => b.id),
      [3, 2, 1, 4],
    );
  });

  it("does not reorder the caller's array in place", () => {
    const input = [row(1, "2026-10-01"), row(2, "2026-10-05")];
    newestFirst(input);
    assert.deepEqual(
      input.map((b) => b.id),
      [1, 2],
    );
  });
});

describe("applying the bookings change feed", () => {
  const cached = [row(3, "2026-10-05"), row(2, "2026-10-03"), row(1, "2026-10-01")];

  it("returns the cached list untouched when nothing changed", () => {
    assert.equal(applyBookingChanges(cached, [], []), cached);
  });

  it("replaces a changed booking with the server's copy", () => {
    const next = applyBookingChanges(cached, [row(2, "2026-10-03", { status: "cancelled" })], []);
    assert.equal(next.find((b) => b.id === 2)?.status, "cancelled");
    assert.equal(next.length, 3);
  });

  it("adds a new booking in date order", () => {
    const next = applyBookingChanges(cached, [row(4, "2026-10-04")], []);
    assert.deepEqual(
      next.map((b) => b.id),
      [3, 4, 2, 1],
    );
  });

  it("drops deleted bookings", () => {
    const next = applyBookingChanges(cached, [], [2, 99]);
    assert.deepEqual(
      next.map((b) => b.id),
      [3, 1],
    );
  });

  it("re-sorts a booking whose date moved", () => {
    const next = applyBookingChanges(cached, [row(1, "2026-10-09")], []);
    assert.deepEqual(
      next.map((b) => b.id),
      [1, 3, 2],
    );
  });

  it("never mutates the cached list", () => {
    const before = cached.map((b) => ({ ...b }));
    applyBookingChanges(cached, [row(2, "2026-10-03", { status: "cancelled" })], [3]);
    assert.deepEqual(cached, before);
  });
});
