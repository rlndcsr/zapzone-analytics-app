import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveBrandLogoPath, resolveEffectiveLocationId } from "./brandLogo.ts";

describe("resolveEffectiveLocationId", () => {
  it("uses the company admin's active selection", () => {
    const id = resolveEffectiveLocationId(
      { role: "company_admin", location_id: null },
      7,
    );
    assert.equal(id, 7);
  });

  it("gives a company admin no location context when 'All Locations' is active", () => {
    const id = resolveEffectiveLocationId(
      { role: "company_admin", location_id: null },
      "all",
    );
    assert.equal(id, null);
  });

  it("uses a manager's own assigned location, ignoring any active selection", () => {
    const id = resolveEffectiveLocationId(
      { role: "location_manager", location_id: 3 },
      "all",
    );
    assert.equal(id, 3);
  });

  it("uses an attendant's own assigned location", () => {
    const id = resolveEffectiveLocationId(
      { role: "attendant", location_id: 9 },
      null,
    );
    assert.equal(id, 9);
  });

  it("is null for a signed-out user", () => {
    assert.equal(resolveEffectiveLocationId(null, 7), null);
  });

  it("is null for a manager with no assigned location", () => {
    const id = resolveEffectiveLocationId(
      { role: "location_manager", location_id: null },
      null,
    );
    assert.equal(id, null);
  });
});

describe("resolveBrandLogoPath", () => {
  it("prefers the location logo when one exists", () => {
    assert.equal(resolveBrandLogoPath("location.png", "company.png"), "location.png");
  });

  it("falls back to the company logo when the location has none", () => {
    assert.equal(resolveBrandLogoPath(null, "company.png"), "company.png");
    assert.equal(resolveBrandLogoPath(undefined, "company.png"), "company.png");
    assert.equal(resolveBrandLogoPath("", "company.png"), "company.png");
  });

  it("is null when neither logo exists, so the caller shows the bundled default", () => {
    assert.equal(resolveBrandLogoPath(null, null), null);
    assert.equal(resolveBrandLogoPath(undefined, undefined), null);
  });
});
