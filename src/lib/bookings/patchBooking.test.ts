import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CalendarBooking } from "../../services/bookingsService.ts";
import { mergeBookingInto } from "./patchBooking.ts";

/** A cached list row, with the fields a blanking bug would destroy. */
const row = (over: Partial<CalendarBooking> = {}): CalendarBooking =>
  ({
    id: 7,
    referenceNumber: "ZAP-0007",
    status: "confirmed",
    date: "2026-09-22",
    time: "14:00",
    participants: 8,
    totalAmount: 240,
    amountPaid: 240,
    packageName: "Laser Tag Party",
    packageCategory: "parties",
    customerName: "Dana Whitfield",
    locationName: "Zap Zone Canton",
    internalNotes: null,
    ...over,
  }) as CalendarBooking;

describe("patching one booking in a cached list", () => {
  it("merges the given fields and leaves every other one alone", () => {
    const [patched] = mergeBookingInto([row()], 7, {
      internalNotes: "[Sep 22 · Dana] Allergy noted",
    });

    assert.equal(patched.internalNotes, "[Sep 22 · Dana] Allergy noted");
    // The whole point: a note must not cost the row its identity.
    assert.equal(patched.customerName, "Dana Whitfield");
    assert.equal(patched.date, "2026-09-22");
    assert.equal(patched.packageName, "Laser Tag Party");
    assert.equal(patched.referenceNumber, "ZAP-0007");
    assert.equal(patched.totalAmount, 240);
  });

  it("clears the digest when the log's last text is emptied, without blanking the row", () => {
    const [patched] = mergeBookingInto([row({ internalNotes: "old" })], 7, {
      internalNotes: null,
    });

    assert.equal(patched.internalNotes, null);
    assert.equal(patched.customerName, "Dana Whitfield");
  });

  it("touches only the booking named", () => {
    const list = [row(), row({ id: 9, customerName: "Ivo Marsh" })];
    const next = mergeBookingInto(list, 7, { internalNotes: "note" });

    assert.equal(next[0].internalNotes, "note");
    assert.equal(next[1].internalNotes, null);
    assert.equal(next[1].customerName, "Ivo Marsh");
  });

  it("does not invent a row for a booking this scope never fetched", () => {
    const list = [row()];
    const next = mergeBookingInto(list, 404, { internalNotes: "note" });

    assert.equal(next.length, 1);
    // Same reference, so the caller can skip the cache write and the re-render.
    assert.equal(next, list);
  });

  it("leaves the input array untouched, so React sees a new list", () => {
    const list = [row()];
    const next = mergeBookingInto(list, 7, { internalNotes: "note" });

    assert.notEqual(next, list);
    assert.equal(list[0].internalNotes, null);
  });
});
