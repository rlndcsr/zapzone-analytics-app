import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { noteFlagsOf, noteSummaryOf } from "./bookingNotes.ts";

describe("noteFlagsOf", () => {
  it("is all-false when every note field is empty or missing", () => {
    assert.deepEqual(noteFlagsOf({}), { guest: false, staff: false });
    assert.deepEqual(
      noteFlagsOf({ customerNotes: "", specialRequests: "  ", internalNotes: null }),
      { guest: false, staff: false },
    );
  });

  it("flags guest from customerNotes", () => {
    assert.deepEqual(noteFlagsOf({ customerNotes: "Sophia's 8th Birthday" }), {
      guest: true,
      staff: false,
    });
  });

  it("flags guest from specialRequests too, independent of customerNotes", () => {
    assert.deepEqual(noteFlagsOf({ specialRequests: "Needs a wheelchair ramp" }), {
      guest: true,
      staff: false,
    });
  });

  it("flags staff from internalNotes, and keeps it independent of the guest flag", () => {
    assert.deepEqual(noteFlagsOf({ internalNotes: "party did not pay in full" }), {
      guest: false,
      staff: true,
    });
  });

  it("flags both when guest and staff notes both exist", () => {
    assert.deepEqual(
      noteFlagsOf({ customerNotes: "Birthday girl", internalNotes: "VIP" }),
      { guest: true, staff: true },
    );
  });
});

describe("noteSummaryOf", () => {
  it("returns null when there is nothing to summarize", () => {
    assert.equal(noteSummaryOf({}), null);
  });

  it("names the guest note alone", () => {
    assert.equal(noteSummaryOf({ customerNotes: "hi" }), "has a guest note");
  });

  it("names the staff note alone", () => {
    assert.equal(noteSummaryOf({ internalNotes: "hi" }), "has a staff note");
  });

  it("names both when both are present", () => {
    assert.equal(
      noteSummaryOf({ customerNotes: "hi", internalNotes: "hi" }),
      "has a guest note and a staff note",
    );
  });
});
