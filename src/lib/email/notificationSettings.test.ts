import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultLocationHint,
  editSubtitle,
  hoursError,
  hoursPayload,
  hoursSuffix,
  locationOptions,
  parseHours,
  pickedLocation,
  triggerTiming,
} from "./notificationSettings.ts";

describe("the Send N hours box", () => {
  it("shows for reminders and follow-ups only", () => {
    assert.equal(triggerTiming("booking_reminder"), "before");
    assert.equal(triggerTiming("purchase_followup"), "after");
    assert.equal(triggerTiming("visit_followup"), "after");
    assert.equal(triggerTiming("booking_created"), null);
    assert.equal(triggerTiming("visit_completed"), null);
  });

  it("uses the web's words after the box", () => {
    assert.equal(hoursSuffix("booking_reminder", false), "hours before the event");
    assert.equal(hoursSuffix("booking_followup", false), "hours after the event");
    assert.equal(hoursSuffix("visit_followup", true), "hours after staff mark the visit complete");
  });

  it("reads the box the way the web does (parseInt)", () => {
    assert.equal(parseHours("24"), 24);
    assert.equal(parseHours("1.5"), 1);
    assert.equal(parseHours(""), null);
    assert.equal(parseHours("x"), null);
  });

  it("stops a save that needs hours and has none, with the web's message", () => {
    assert.equal(hoursError("booking_reminder", ""), "Please specify hours before event for reminder");
    assert.equal(hoursError("visit_followup", "0"), "Please specify hours after event for follow-up");
    assert.equal(hoursError("visit_followup", "24"), null);
    assert.equal(hoursError("booking_created", ""), null);
  });

  it("sends the hours in the column the trigger uses and clears the other", () => {
    assert.deepEqual(hoursPayload("booking_reminder", "12"), { send_before_hours: 12, send_after_hours: null });
    assert.deepEqual(hoursPayload("visit_followup", "24"), { send_before_hours: null, send_after_hours: 24 });
    assert.deepEqual(hoursPayload("booking_created", "24"), { send_before_hours: null, send_after_hours: null });
  });
});

describe("a default email's locks", () => {
  it("says what is locked under the title", () => {
    assert.equal(
      editSubtitle(true, "review_request_customer"),
      "Default template · review_request_customer — name & trigger are locked.",
    );
    assert.equal(editSubtitle(true, null), "Default template — name & trigger are locked.");
    assert.equal(editSubtitle(false, "x"), "Update automated email notification settings");
  });

  it("explains the locked location", () => {
    assert.match(defaultLocationHint(true), /Duplicate this one to make a version for a single location\.$/);
    assert.match(defaultLocationHint(false), /create a new notification for it\.$/);
  });
});

describe("the Location picker", () => {
  it("offers All Locations first and saves it as null", () => {
    const options = locationOptions([{ id: 4, name: "Warren" }]);
    assert.deepEqual(options, [
      { label: "All Locations", value: "" },
      { label: "Warren", value: 4 },
    ]);
    assert.equal(pickedLocation(""), null);
    assert.equal(pickedLocation(4), 4);
  });
});
