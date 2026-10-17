import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backendOnlyHint,
  canChangeOnlineAvailability,
  duplicateBackendOnlyNote,
  importStayedOnline,
  isStaffLoginRefusal,
  onlineFieldHelp,
  onlineToggleDone,
  onlineToggleQuestion,
} from "./onlineAvailability.ts";

describe("who may change Front-End Availability", () => {
  it("is managers and admins, as on the server", () => {
    assert.equal(canChangeOnlineAvailability("company_admin"), true);
    assert.equal(canChangeOnlineAvailability("admin"), true);
    assert.equal(canChangeOnlineAvailability("location_manager"), true);
  });

  it("never an attendant, or no one signed in", () => {
    assert.equal(canChangeOnlineAvailability("attendant"), false);
    assert.equal(canChangeOnlineAvailability(undefined), false);
    assert.equal(canChangeOnlineAvailability(null), false);
  });
});

describe("the wording", () => {
  it("does not promise a staff booking for a package that is switched off", () => {
    assert.match(backendOnlyHint(true), /Staff can still book it/);
    assert.match(backendOnlyHint(false), /once it is switched on/);
    assert.match(onlineToggleQuestion("Party", true, false).message, /nobody can book it yet/);
    assert.match(onlineFieldHelp(false, false), /once it is switched on/);
  });

  it("asks before each direction of the switch", () => {
    assert.equal(onlineToggleQuestion("Party", true, true).title, 'Make "Party" backend only?');
    assert.equal(onlineToggleQuestion("Party", false, true).title, 'Show "Party" on the booking site again?');
    assert.equal(onlineToggleQuestion("Party", false, false).title, 'Let customers book "Party" online?');
  });

  it("says what was saved", () => {
    assert.equal(onlineToggleDone("Party", false, true), '"Party" is now backend only.');
    assert.equal(onlineToggleDone("Party", true, true), '"Party" is on the booking site again.');
    assert.equal(onlineToggleDone("Party", true, false), '"Party" can be booked online once it is switched on.');
  });

  it("tells an attendant a copy will not stay backend only", () => {
    assert.match(duplicateBackendOnlyNote(true), /copy will be backend only too/);
    assert.match(duplicateBackendOnlyNote(false), /Only a location manager or an admin/);
  });
});

describe("a staff booking refused as an online one", () => {
  it("is the 422 PACKAGE_NOT_BOOKABLE_ONLINE refusal only", () => {
    assert.equal(isStaffLoginRefusal({ status: 422, body: { code: "PACKAGE_NOT_BOOKABLE_ONLINE" } }), true);
    assert.equal(isStaffLoginRefusal({ status: 422, body: { code: "BOOKED_SAME_TIME" } }), false);
    assert.equal(isStaffLoginRefusal({ status: 403, body: { code: "PACKAGE_NOT_BOOKABLE_ONLINE" } }), false);
    assert.equal(isStaffLoginRefusal(new Error("x")), false);
    assert.equal(isStaffLoginRefusal(null), false);
  });
});

describe("an import that asked for backend-only packages", () => {
  it("counts the ones the server left online, skipping failed rows", () => {
    // Rows 0 and 2 asked for backend only; row 1 failed, so the server's list is rows 0, 2, 3.
    assert.equal(importStayedOnline([false, false, false, true], new Set([1]), [true, false, true]), 1);
    assert.equal(importStayedOnline([false, true], new Set(), [false, true]), 0);
    assert.equal(importStayedOnline([false], new Set(), [null]), 1);
  });
});
