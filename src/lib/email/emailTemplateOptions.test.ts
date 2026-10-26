import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canDuplicateTemplate,
  canManageEventPhotoEmails,
  emailTemplateCategoryLabel,
  isCompanyLevelRole,
  isSharedEventPhotoTemplate,
  registrantGapMessage,
  templateLocationIds,
  templateLocationsFrom,
  templateLocationSummary,
  templatePreviewLocationId,
  templateReadOnlyReason,
  templateVariableGroups,
  usesPhotoLink,
  type TemplateTargeting,
} from "./emailTemplateOptions.ts";

const target = (over: Partial<TemplateTargeting> = {}): TemplateTargeting => ({
  categoryValue: null,
  allLocations: false,
  locationIds: [1],
  locationNames: ["Brighton"],
  targetLocations: [{ id: 1, name: "Brighton", active: true }],
  ...over,
});

const eventPhotos = (over: Partial<TemplateTargeting> = {}) =>
  target({ categoryValue: "event_photos", ...over });

describe("roles — the web's lists", () => {
  it("company-level staff are company admins, admins and owners", () => {
    for (const role of ["company_admin", "admin", "owner"]) assert.equal(isCompanyLevelRole(role), true);
    for (const role of ["location_manager", "attendant", null, undefined]) assert.equal(isCompanyLevelRole(role), false);
  });

  it("managers can also run event photo emails; attendants cannot", () => {
    assert.equal(canManageEventPhotoEmails("location_manager"), true);
    assert.equal(canManageEventPhotoEmails("owner"), true);
    assert.equal(canManageEventPhotoEmails("attendant"), false);
    assert.equal(canManageEventPhotoEmails(null), false);
  });
});

describe("emailTemplateCategoryLabel", () => {
  it("names known categories, keeps unknown ones and calls none General", () => {
    assert.equal(emailTemplateCategoryLabel("event_photos"), "Event photos");
    assert.equal(emailTemplateCategoryLabel("marketing"), "Marketing");
    assert.equal(emailTemplateCategoryLabel("seasonal"), "seasonal");
    assert.equal(emailTemplateCategoryLabel(null), "General");
    assert.equal(emailTemplateCategoryLabel("  "), "General");
  });
});

describe("templateLocationSummary", () => {
  it("says every location, lists up to two names, then counts the rest", () => {
    assert.equal(templateLocationSummary(target({ allLocations: true, locationIds: [], locationNames: [] })), "Every location");
    assert.equal(templateLocationSummary(target({ locationNames: ["Brighton", "Novi"] })), "Brighton, Novi");
    assert.equal(templateLocationSummary(target({ locationNames: ["Brighton", "Novi", "Troy"] })), "Brighton + 2 more");
  });

  it("counts locations whose names it doesn't have", () => {
    assert.equal(templateLocationSummary(target({ locationNames: [], locationIds: [4] })), "1 location");
    assert.equal(templateLocationSummary(target({ locationNames: [], locationIds: [4, 5] })), "2 locations");
  });
});

describe("location choice", () => {
  it("drops deleted locations from the saved targeting", () => {
    const value = templateLocationsFrom(
      target({
        locationIds: [1, 9],
        targetLocations: [
          { id: 1, name: "Brighton", active: true },
          { id: 9, name: null, active: false },
        ],
      }),
    );
    assert.deepEqual(value, { allLocations: false, selectedIds: [1] });
  });

  it("sends an empty list for every location and the ticked ids otherwise", () => {
    assert.deepEqual(templateLocationIds({ allLocations: true, selectedIds: [3] }), []);
    assert.deepEqual(templateLocationIds({ allLocations: false, selectedIds: [3, 4] }), [3, 4]);
  });

  it("previews with the first ticked location this user can see", () => {
    const locations = [{ id: 4 }, { id: 5 }];
    assert.equal(templatePreviewLocationId({ allLocations: false, selectedIds: [8, 5] }, locations), 5);
    assert.equal(templatePreviewLocationId({ allLocations: false, selectedIds: [8] }, locations), 8);
    assert.equal(templatePreviewLocationId({ allLocations: true, selectedIds: [] }, locations), undefined);
  });
});

describe("read-only templates", () => {
  it("is shared only for an event photo email on more than one picked location", () => {
    assert.equal(isSharedEventPhotoTemplate(eventPhotos({ locationIds: [1, 2] })), true);
    assert.equal(isSharedEventPhotoTemplate(eventPhotos({ locationIds: [1] })), false);
    assert.equal(isSharedEventPhotoTemplate(eventPhotos({ allLocations: true, locationIds: [] })), false);
    assert.equal(isSharedEventPhotoTemplate(target({ locationIds: [1, 2] })), false);
  });

  it("gives no reason for a template this user can change", () => {
    assert.equal(templateReadOnlyReason({ ...target(), canManage: true }, true), "");
  });

  it("explains each kind of read-only template as the web does", () => {
    assert.match(templateReadOnlyReason({ ...eventPhotos(), canManage: false }, false), /^Only managers and admins/);
    assert.match(templateReadOnlyReason({ ...eventPhotos({ locationIds: [1, 2] }), canManage: false }, true), /shared by several locations/);
    assert.match(templateReadOnlyReason({ ...target({ allLocations: true, locationIds: [] }), canManage: false }, true), /used at every location/);
    assert.match(templateReadOnlyReason({ ...target({ locationIds: [2] }), canManage: false }, true), /used at other locations/);
  });

  it("offers Duplicate as the web list does", () => {
    assert.equal(canDuplicateTemplate(target(), "attendant"), true);
    assert.equal(canDuplicateTemplate(eventPhotos(), "attendant"), false);
    assert.equal(canDuplicateTemplate(eventPhotos({ locationIds: [1, 2] }), "location_manager"), false);
    assert.equal(canDuplicateTemplate(eventPhotos({ locationIds: [1, 2] }), "company_admin"), true);
    assert.equal(canDuplicateTemplate(eventPhotos({ allLocations: true, locationIds: [] }), "location_manager"), true);
  });
});

describe("templateVariableGroups", () => {
  const data = {
    default: [{ name: "recipient_email", description: "" }],
    customer: [],
    user: [{ name: "user_name", description: "" }],
    event: [{ name: "photo_link", description: "" }],
  };

  it("leads with event photo fields for an event photo email, keeping only the default ones besides", () => {
    assert.deepEqual(
      templateVariableGroups(data, true).map((group) => group.title),
      ["Event Photo Variables", "Default Variables"],
    );
  });

  it("puts the event fields last otherwise and leaves out empty groups", () => {
    assert.deepEqual(
      templateVariableGroups(data, false).map((group) => group.title),
      ["Default Variables", "User Variables", "Event Photo Variables"],
    );
  });

  it("leaves the event group out when an older server sends none", () => {
    assert.deepEqual(
      templateVariableGroups({ ...data, event: [] }, true).map((group) => group.title),
      ["Default Variables"],
    );
  });
});

describe("event registrant campaigns", () => {
  it("spots {{ photo_link }} in the subject or body, spaces or not", () => {
    assert.equal(usesPhotoLink("", '<a href="{{ photo_link }}">x</a>'), true);
    assert.equal(usesPhotoLink("{{photo_link}}", ""), true);
    assert.equal(usesPhotoLink("Hi", "{{ photo_count }} photos"), false);
  });

  it("says why nobody would get it", () => {
    assert.match(registrantGapMessage(true), /has photos ready yet/);
    assert.match(registrantGapMessage(false), /no one gave an email address/);
  });
});
