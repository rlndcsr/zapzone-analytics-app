import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeTerminals,
  canManageStaffPins,
  matchesStaffSearch,
  parseIdleSeconds,
  staffRoleLabel,
  validateStaffPin,
} from "./staffPins.ts";

describe("staffRoleLabel", () => {
  it("uses the web's labels", () => {
    assert.equal(staffRoleLabel("company_admin"), "Administrator");
    assert.equal(staffRoleLabel("location_manager"), "Location manager");
    assert.equal(staffRoleLabel("attendant"), "Attendant");
  });

  it("falls back to the raw role", () => {
    assert.equal(staffRoleLabel("customer"), "customer");
  });
});

describe("canManageStaffPins", () => {
  it("allows managers and administrators only", () => {
    assert.equal(canManageStaffPins("company_admin"), true);
    assert.equal(canManageStaffPins("location_manager"), true);
    assert.equal(canManageStaffPins("attendant"), false);
    assert.equal(canManageStaffPins(null), false);
  });
});

describe("validateStaffPin", () => {
  it("accepts exactly the server's length in digits", () => {
    assert.equal(validateStaffPin("123456", 6), null);
    assert.equal(validateStaffPin("1234", 4), null);
  });

  it("rejects short, long and non-digit PINs", () => {
    assert.equal(validateStaffPin("12345", 6), "The PIN must be 6 digits.");
    assert.equal(validateStaffPin("1234567", 6), "The PIN must be 6 digits.");
    assert.equal(validateStaffPin("12a456", 6), "The PIN must be 6 digits.");
    assert.equal(validateStaffPin("", 6), "The PIN must be 6 digits.");
  });
});

describe("parseIdleSeconds", () => {
  it("accepts whole seconds inside the backend's range", () => {
    assert.deepEqual(parseIdleSeconds("15"), { ok: true, seconds: 15 });
    assert.deepEqual(parseIdleSeconds(" 90 "), { ok: true, seconds: 90 });
    assert.deepEqual(parseIdleSeconds("3600"), { ok: true, seconds: 3600 });
  });

  it("refuses empty, fractional and out-of-range values instead of letting the server clamp them", () => {
    for (const bad of ["", "14", "3601", "1.5", "-20", "abc"]) {
      assert.equal(parseIdleSeconds(bad).ok, false, bad);
    }
  });
});

describe("activeTerminals", () => {
  it("drops revoked terminals", () => {
    const list = [
      { id: 1, revoked_at: null },
      { id: 2, revoked_at: "2026-10-01T10:00:00Z" },
      { id: 3 },
    ];
    assert.deepEqual(
      activeTerminals(list).map((t) => t.id),
      [1, 3],
    );
  });
});

describe("matchesStaffSearch", () => {
  const dana = { name: "Dana Hermann", email: "Dana@bestinggames.com" };

  it("matches name or email, ignoring case", () => {
    assert.equal(matchesStaffSearch(dana, "herm"), true);
    assert.equal(matchesStaffSearch(dana, "BESTING"), true);
    assert.equal(matchesStaffSearch(dana, "  "), true);
    assert.equal(matchesStaffSearch(dana, "zap-zone"), false);
  });
});
