import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bookingUpdateEmailWanted,
  changedStatusField,
  completesVisit,
} from "./statusEdit.ts";

describe("edit saves send the status only when it changed", () => {
  it("omits an untouched status", () => {
    assert.deepEqual(changedStatusField("checked-in", "checked-in"), {});
    assert.equal("status" in changedStatusField("completed", "completed"), false);
  });

  it("includes a changed status", () => {
    assert.deepEqual(changedStatusField("completed", "checked-in"), { status: "completed" });
    assert.deepEqual(changedStatusField("cancelled", "confirmed"), { status: "cancelled" });
  });
});

describe("completing a booking from Edit Booking", () => {
  it("knows when the save completes the visit", () => {
    assert.equal(completesVisit("completed", "checked-in"), true);
    assert.equal(completesVisit("completed", "completed"), false);
    assert.equal(completesVisit("confirmed", "pending"), false);
  });

  it("sends no booking update email when completing", () => {
    assert.equal(bookingUpdateEmailWanted(true, "completed", "checked-in"), false);
  });

  it("keeps the staff's choice otherwise", () => {
    assert.equal(bookingUpdateEmailWanted(true, "confirmed", "pending"), true);
    assert.equal(bookingUpdateEmailWanted(false, "confirmed", "pending"), false);
    // already completed: an ordinary edit, so the toggle still decides
    assert.equal(bookingUpdateEmailWanted(true, "completed", "completed"), true);
  });
});
