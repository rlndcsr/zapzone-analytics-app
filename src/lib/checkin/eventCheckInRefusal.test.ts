import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eventCheckInRefusal } from "./eventCheckInRefusal.ts";

describe("event ticket check-in refusal", () => {
  it("refuses a completed ticket", () => {
    assert.equal(
      eventCheckInRefusal("completed"),
      "This ticket is already marked Completed, so it cannot be checked in again.",
    );
  });

  it("refuses a cancelled ticket", () => {
    assert.equal(eventCheckInRefusal("cancelled"), "This ticket was cancelled, so it cannot be checked in.");
  });

  it("lets pending and confirmed tickets through", () => {
    assert.equal(eventCheckInRefusal("pending"), null);
    assert.equal(eventCheckInRefusal("confirmed"), null);
    assert.equal(eventCheckInRefusal(null), null);
  });
});
