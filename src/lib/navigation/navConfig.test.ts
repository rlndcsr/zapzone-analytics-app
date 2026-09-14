import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_TABS, getRoleTabs, isTabRoute } from "./navConfig.ts";

describe("getRoleTabs", () => {
  it("gives Location Manager the Activity tab in place of Locations", () => {
    const tabs = getRoleTabs("location_manager");
    assert.ok(tabs.includes("activity"));
    assert.ok(!tabs.includes("location"));
  });

  it("falls back to the default set for an unknown or missing role", () => {
    assert.deepEqual(getRoleTabs("something_new"), DEFAULT_TABS);
    assert.deepEqual(getRoleTabs(null), DEFAULT_TABS);
    assert.deepEqual(getRoleTabs(undefined), DEFAULT_TABS);
  });
});

describe("isTabRoute", () => {
  it("recognises every tab screen, whichever role can see it", () => {
    for (const path of [
      "/home",
      "/location",
      "/activity",
      "/navigation",
      "/calendar",
      "/profile",
    ]) {
      assert.equal(isTabRoute(path), true, path);
    }
  });

  it("does not treat a pushed screen under a tab's name as a tab", () => {
    // This is the case that matters: /profile has a tab bar beneath it and
    // /profile/edit-profile does not, so an overlay anchored to the bottom
    // would float too high on the pushed screen.
    assert.equal(isTabRoute("/profile/edit-profile"), false);
    assert.equal(isTabRoute("/profile/saved-accounts"), false);
  });

  it("is false for the stack screens and the public routes", () => {
    for (const path of [
      "/",
      "/splash",
      "/settings/settings",
      "/bookings",
      "/switch-account",
    ]) {
      assert.equal(isTabRoute(path), false, path);
    }
  });
});
