import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adHoldSeconds,
  classifyLookupFailure,
  classifyLookupResponse,
  mapKioskAd,
  mapKioskSettings,
  mapReturningProfile,
  minorCapReached,
  RATE_LIMITED_MESSAGE,
} from "./kioskContract.ts";

describe("reading the kiosk settings block", () => {
  it("takes the server's switches as given", () => {
    const s = mapKioskSettings({
      inactivity_timeout_seconds: 90,
      disable_autofill: false,
      gps_capture_enabled: true,
      returning_enabled: true,
    });
    assert.equal(s.inactivityTimeoutSeconds, 90);
    assert.equal(s.disableAutofill, false);
    assert.equal(s.gpsCaptureEnabled, true);
    assert.equal(s.returningEnabled, true);
  });

  it("leaves the returning flow off unless the server turns it on", () => {
    assert.equal(mapKioskSettings({}).returningEnabled, false);
    assert.equal(mapKioskSettings(undefined).returningEnabled, false);
    assert.equal(
      mapKioskSettings({ returning_enabled: false }).returningEnabled,
      false,
    );
  });

  it("does not treat a truthy non-true value as enabled", () => {
    assert.equal(mapKioskSettings({ returning_enabled: 1 }).returningEnabled, false);
    assert.equal(
      mapKioskSettings({ returning_enabled: "yes" }).returningEnabled,
      false,
    );
  });

  it("keeps suppressing autofill at a shared kiosk by default", () => {
    assert.equal(mapKioskSettings({}).disableAutofill, true);
  });

  it("falls back to the backend's own timeout when none is reported", () => {
    assert.equal(mapKioskSettings({}).inactivityTimeoutSeconds, 120);
    assert.equal(
      mapKioskSettings({ inactivity_timeout_seconds: 0 }).inactivityTimeoutSeconds,
      120,
    );
    assert.equal(
      mapKioskSettings({ inactivity_timeout_seconds: "x" }).inactivityTimeoutSeconds,
      120,
    );
  });

  it("survives a backend that predates the settings block entirely", () => {
    const s = mapKioskSettings(null);
    assert.equal(s.returningEnabled, false);
    assert.equal(s.gpsCaptureEnabled, false);
  });
});

describe("reading a post-waiver ad", () => {
  const AD = {
    id: 7,
    name: "Summer Pass",
    image_path: "images/ads/summer.jpg",
    display_seconds: 8,
    has_link: true,
  };

  it("reads the ad the server sent", () => {
    const ad = mapKioskAd(AD);
    assert.equal(ad?.id, 7);
    assert.equal(ad?.name, "Summer Pass");
    assert.equal(ad?.imagePath, "images/ads/summer.jpg");
    assert.equal(ad?.displaySeconds, 8);
    assert.equal(ad?.hasLink, true);
  });

  it("is null when the response carries no ad", () => {
    assert.equal(mapKioskAd(null), null);
    assert.equal(mapKioskAd(undefined), null);
  });

  it("is null rather than a broken screen when the ad is unusable", () => {
    assert.equal(mapKioskAd({ ...AD, id: null }), null);
    assert.equal(mapKioskAd({ ...AD, image_path: "" }), null);
    assert.equal(mapKioskAd({ ...AD, image_path: undefined }), null);
    assert.equal(mapKioskAd("nonsense"), null);
  });

  it("falls back to a sane duration when the server reports none", () => {
    assert.equal(mapKioskAd({ ...AD, display_seconds: 0 })?.displaySeconds, 5);
    assert.equal(mapKioskAd({ ...AD, display_seconds: null })?.displaySeconds, 5);
  });

  it("offers Learn More only when the ad actually has a link", () => {
    assert.equal(mapKioskAd({ ...AD, has_link: false })?.hasLink, false);
    assert.equal(mapKioskAd({ ...AD, has_link: undefined })?.hasLink, false);
  });

  it("treats a blank name as no name", () => {
    assert.equal(mapKioskAd({ ...AD, name: "" })?.name, null);
  });

  it("holds the ad for the confirmation beat plus its own duration", () => {
    assert.equal(adHoldSeconds({ displaySeconds: 8 }), 10);
    assert.equal(adHoldSeconds({ displaySeconds: 1 }), 3);
  });
});

describe("reading a returning customer's saved record", () => {
  const PROFILE = {
    id: 42,
    first_name: "Dana",
    last_name: "Reyes",
    email: "dana@example.com",
    phone: "(555) 010-2030",
    date_of_birth: "1990-04-11",
    dependents: [
      { id: 5, first_name: "Kit", last_name: "Reyes", age: 7, relationship: "Daughter" },
      { id: 6, first_name: "Sam", last_name: "Reyes", age: 11, relationship: null },
    ],
  };

  it("reads the saved signer", () => {
    const p = mapReturningProfile(PROFILE);
    assert.equal(p?.id, 42);
    assert.equal(p?.firstName, "Dana");
    assert.equal(p?.email, "dana@example.com");
    assert.equal(p?.dateOfBirth, "1990-04-11");
  });

  it("carries dependents as an age, which is all the public lookup returns", () => {
    const p = mapReturningProfile(PROFILE);
    assert.equal(p?.dependents.length, 2);
    assert.equal(p?.dependents[0].age, 7);
    assert.equal(p?.dependents[0].relationship, "Daughter");
    assert.equal(p?.dependents[1].relationship, null);
    // There is deliberately no date of birth on a dependent here.
    assert.equal("dateOfBirth" in p!.dependents[0], false);
  });

  it("reads a missing age as unknown rather than zero", () => {
    const p = mapReturningProfile({
      ...PROFILE,
      dependents: [{ id: 5, first_name: "Kit", last_name: "Reyes" }],
    });
    assert.equal(p?.dependents[0].age, null);
  });

  it("drops a dependent with no id, since it could never be selected", () => {
    const p = mapReturningProfile({
      ...PROFILE,
      dependents: [{ first_name: "Ghost", last_name: "Reyes", age: 4 }],
    });
    assert.equal(p?.dependents.length, 0);
  });

  it("tolerates a record with no dependents at all", () => {
    assert.deepEqual(mapReturningProfile({ id: 1 })?.dependents, []);
    assert.deepEqual(
      mapReturningProfile({ id: 1, dependents: null })?.dependents,
      [],
    );
  });

  it("is null for anything that is not a usable record", () => {
    assert.equal(mapReturningProfile(null), null);
    assert.equal(mapReturningProfile({}), null);
    assert.equal(mapReturningProfile({ id: "abc" }), null);
  });

  it("reads blank contact fields as absent rather than empty strings", () => {
    const p = mapReturningProfile({ ...PROFILE, email: "", phone: null });
    assert.equal(p?.email, null);
    assert.equal(p?.phone, null);
  });
});

describe("what a lookup came back as", () => {
  const PROFILE = { id: 42, first_name: "Dana", last_name: "Reyes" };

  it("reports a found record with the profile to show", () => {
    const r = classifyLookupResponse("found", PROFILE);
    assert.equal(r.status, "found");
    assert.equal(r.profile?.id, 42);
  });

  it("reports needs_staff, which the guest cannot self-serve past", () => {
    const r = classifyLookupResponse("needs_staff", null);
    assert.equal(r.status, "needs_staff");
    assert.equal(r.profile, null);
  });

  it("reports not_found", () => {
    assert.equal(classifyLookupResponse("not_found", null).status, "not_found");
  });

  it("treats a found with no readable record as a miss, so the guest moves on", () => {
    assert.equal(classifyLookupResponse("found", null).status, "not_found");
    assert.equal(classifyLookupResponse("found", { id: "x" }).status, "not_found");
  });

  it("treats an unrecognised status as a miss rather than throwing", () => {
    assert.equal(classifyLookupResponse("something_new", null).status, "not_found");
    assert.equal(classifyLookupResponse(undefined, null).status, "not_found");
  });
});

describe("when a lookup fails", () => {
  it("separates a throttled kiosk from a fault", () => {
    const r = classifyLookupFailure(429);
    assert.equal(r.status, "rate_limited");
    assert.equal(r.message, RATE_LIMITED_MESSAGE);
    assert.equal(r.profile, null);
  });

  it("does not report a 429 as an error, so the kiosk asks the guest to wait", () => {
    assert.notEqual(classifyLookupFailure(429).status, "error");
  });

  it("carries the server's own words for anything else", () => {
    const r = classifyLookupFailure(503, "We could not check that number right now.");
    assert.equal(r.status, "error");
    assert.equal(r.message, "We could not check that number right now.");
  });

  it("still says something useful when the failure carries no message", () => {
    const r = classifyLookupFailure(0, null);
    assert.equal(r.status, "error");
    assert.ok(r.message && r.message.length > 0);
  });
});

describe("how many children a waiver still has room for", () => {
  it("counts saved dependents and new ones against the same allowance", () => {
    // The backend merges both lists and caps the total, so the kiosk must too.
    assert.equal(minorCapReached(4, 2, 1), false);
    assert.equal(minorCapReached(4, 2, 2), true);
    assert.equal(minorCapReached(4, 4, 0), true);
    assert.equal(minorCapReached(4, 0, 4), true);
  });

  it("leaves the ordinary new-customer case unchanged", () => {
    assert.equal(minorCapReached(10, 0, 9), false);
    assert.equal(minorCapReached(10, 0, 10), true);
  });

  it("admits nobody when the template allows no minors", () => {
    assert.equal(minorCapReached(0, 0, 0), true);
  });
});
