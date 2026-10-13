import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blockFormError,
  blockPayload,
  changedFieldRows,
  formatChangeValue,
  type BlockFormInput,
} from "./blockForm.ts";

const valid: BlockFormInput = {
  locationId: 3,
  windowChoice: "full_day",
  opensAt: "",
  closesAt: "",
  scope: "location",
  selected: { packages: [], rooms: [], attractions: [], events: [] },
  groupName: " Acme party ",
  reason: " Private buyout ",
  isRecurring: false,
};

describe("blockFormError", () => {
  it("lets a complete full-day block save", () => {
    assert.equal(blockFormError(valid, ["2026-12-24"]), null);
  });

  it("asks for each missing piece in the web form's order", () => {
    assert.equal(blockFormError({ ...valid, locationId: null }, ["2026-12-24"]), "Choose a location.");
    assert.equal(blockFormError(valid, []), "Choose a date.");
    assert.equal(
      blockFormError({ ...valid, windowChoice: null }, ["2026-12-24"]),
      "Choose a full-day closure or the hours it stays open.",
    );
    assert.equal(blockFormError({ ...valid, scope: null }, ["2026-12-24"]), "Choose what to block.");
    assert.equal(
      blockFormError({ ...valid, scope: "rooms" }, ["2026-12-24"]),
      "Choose at least one of the rooms.",
    );
    assert.equal(
      blockFormError({ ...valid, groupName: "  " }, ["2026-12-24"]),
      "Enter the group or event this block is for.",
    );
    assert.equal(blockFormError({ ...valid, reason: "" }, ["2026-12-24"]), "Enter the reason for this block.");
  });

  it("checks the hours of an operating window", () => {
    const window = { ...valid, windowChoice: "operating_window" as const };
    assert.equal(blockFormError(window, ["2026-12-24"]), "Enter the time it opens, the time it closes, or both.");
    assert.equal(blockFormError({ ...window, opensAt: "12:00", closesAt: "16:00" }, ["2026-12-24"]), null);
  });
});

describe("blockPayload", () => {
  it("sends a full day with no hours and the trimmed group and reason", () => {
    assert.deepEqual(blockPayload(valid, "2026-12-24"), {
      location_id: 3,
      date: "2026-12-24",
      block_type: "full_day",
      opens_at: null,
      closes_at: null,
      scope: "location",
      reason: "Private buyout",
      group_name: "Acme party",
      is_recurring: false,
    });
  });

  it("sends the hours and only the chosen kind's ids, never the older closed-hours fields", () => {
    const payload = blockPayload(
      {
        ...valid,
        windowChoice: "operating_window",
        opensAt: "12:00",
        closesAt: "",
        scope: "rooms",
        selected: { packages: [9], rooms: [4, 5], attractions: [], events: [] },
      },
      "2026-12-24",
    );
    assert.equal(payload.opens_at, "12:00");
    assert.equal(payload.closes_at, null);
    assert.deepEqual(payload.room_ids, [4, 5]);
    assert.equal(payload.package_ids, undefined);
    assert.equal("time_start" in payload, false);
  });
});

describe("change history wording", () => {
  it("formats saved values as the web does", () => {
    assert.equal(formatChangeValue("block_type", "operating_window"), "Open for set hours");
    assert.equal(formatChangeValue("opens_at", "16:30"), "4:30 PM");
    assert.equal(formatChangeValue("is_recurring", false), "No");
    assert.equal(formatChangeValue("room_ids", [4, 5]), "2 chosen (#4, #5)");
    assert.equal(formatChangeValue("reason", null), "—");
  });

  it("lists before → after only for changed, known fields", () => {
    const rows = changedFieldRows({
      id: 1,
      dayOffId: 7,
      action: "updated",
      summary: "Changed the hours",
      changedByName: "Sam Lee",
      changedByRole: "location_manager",
      locationName: "Farmington",
      previousLocationName: null,
      before: { opens_at: "12:00", updated_by: 1 },
      after: { opens_at: "13:00", updated_by: 2 },
      changedFields: ["opens_at", "updated_by"],
      context: {},
      createdAt: null,
    });
    assert.deepEqual(rows, [{ label: "Opens at", before: "12:00 PM", after: "1:00 PM" }]);
  });
});
