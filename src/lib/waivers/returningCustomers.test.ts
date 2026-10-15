import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canSaveDependent,
  canSaveProfile,
  dateOfBirthError,
  dependentMeta,
  dependentPayload,
  emptyListMessage,
  formatDateLong,
  listCountParts,
  mapProfileRow,
  mapProfileView,
  profilePayload,
  recordName,
  recordSubtitle,
  reviewNoticeBody,
  sharedPhoneLine,
  sourceLabel,
  statusWord,
} from "./returningCustomers.ts";

describe("mapping the API's rows", () => {
  it("reads a list row the way WaiverProfileController::presentRow writes it", () => {
    const row = mapProfileRow({
      id: 7,
      first_name: "Alaya",
      last_name: "Verbrugge",
      full_name: "Alaya Verbrugge",
      email: "laymarie.1@icloud.com",
      phone: "5863392445",
      phone_digits: "5863392445",
      date_of_birth: null,
      needs_staff_review: true,
      submissions_count: 1,
      last_waiver_at: "2026-10-14T20:42:00-04:00",
      dependents_count: 0,
      last_location_id: 3,
      last_location_name: "Sterling Heights | Best In Games",
    });
    assert.equal(row.fullName, "Alaya Verbrugge");
    assert.equal(row.needsStaffReview, true);
    assert.equal(row.dependentsCount, 0);
    assert.equal(row.lastLocationName, "Sterling Heights | Best In Games");
  });

  it("treats missing counts as zero and empty strings as missing", () => {
    const row = mapProfileRow({ id: 1, full_name: "", email: "", phone: null });
    assert.equal(row.submissionsCount, 0);
    assert.equal(row.dependentsCount, 0);
    assert.equal(row.email, null);
    assert.equal(row.needsStaffReview, false);
  });

  it("reads the detail view: dependents, history and shared-phone records", () => {
    const view = mapProfileView({
      profile: {
        id: 9,
        full_name: "Eva Hernandez Rosas",
        created_at: "2026-10-13T18:00:00-04:00",
        dependents: [
          { id: 1, first_name: "Mia", last_name: "Rosas", full_name: "Mia Rosas", is_active: true },
          { id: 2, first_name: "Leo", last_name: "Rosas", full_name: "Leo Rosas", is_active: 0 },
        ],
      },
      history: [
        {
          id: 55,
          status: "completed",
          source: "kiosk",
          has_signature: 1,
          dependents: [{ id: 3, name: "Mia Rosas", was_new_this_visit: true }],
          new_dependents_count: 1,
        },
      ],
      shared_phone_profiles: [{ id: 10, name: "Other Person", submissions_count: 2 }],
    });
    assert.equal(view.profile.dependents[0].isActive, true);
    assert.equal(view.profile.dependents[1].isActive, false);
    assert.equal(view.history[0].hasSignature, true);
    assert.equal(view.history[0].dependents[0].wasNewThisVisit, true);
    assert.equal(view.sharedPhoneProfiles[0].submissionsCount, 2);
  });

  it("copes with a view that has no history or shared phones", () => {
    const view = mapProfileView({ profile: { id: 4 } });
    assert.deepEqual(view.history, []);
    assert.deepEqual(view.sharedPhoneProfiles, []);
    assert.deepEqual(view.profile.dependents, []);
  });
});

describe("the web's wording", () => {
  it("falls back to the record number when there is no name", () => {
    assert.equal(recordName({ id: 12, fullName: "" }), "Record #12");
    assert.equal(recordName({ id: 12, fullName: "Bri Phares" }), "Bri Phares");
  });

  it("counts records and the page's review flags", () => {
    assert.deepEqual(listCountParts(7310, 25), {
      total: "7310",
      noun: "records",
      review: " · 25 on this page need review",
    });
    assert.deepEqual(listCountParts(1, 0), { total: "1", noun: "record", review: null });
  });

  it("explains an empty list differently when a search or filter is on", () => {
    assert.equal(emptyListMessage(true), "No returning customers match this search.");
    assert.match(emptyListMessage(false), /^No returning customers yet\./);
  });

  it("writes the record subtitle with the right plural", () => {
    assert.equal(
      recordSubtitle({ id: 3, submissionsCount: 1, createdAt: "2026-03-04T10:00:00-05:00" }),
      "Customer record #3 · 1 waiver signed · on file since March 4, 2026",
    );
    assert.equal(
      recordSubtitle({ id: 3, submissionsCount: 2, createdAt: null }),
      "Customer record #3 · 2 waivers signed",
    );
  });

  it("picks the review reason the web shows", () => {
    assert.match(reviewNoticeBody(1), /More than one customer answers to this phone number/);
    assert.match(reviewNoticeBody(0), /under a different name/);
  });

  it("lists another record on the same number", () => {
    assert.equal(
      sharedPhoneLine({
        id: 1,
        name: "A",
        email: "a@x.com",
        submissionsCount: 2,
        lastWaiverAt: "2026-10-11T21:00:00-04:00",
      }),
      " · a@x.com · 2 signed · last October 11, 2026",
    );
    assert.equal(
      sharedPhoneLine({ id: 1, name: "A", email: null, submissionsCount: 0, lastWaiverAt: null }),
      " · 0 signed",
    );
  });

  it("formats dates without shifting them across a time zone", () => {
    assert.equal(formatDateLong("2015-01-01"), "January 1, 2015");
    assert.equal(formatDateLong("2026-10-11T23:30:00+00:00"), "October 11, 2026");
    assert.equal(formatDateLong(null), "—");
    assert.equal(formatDateLong("garbage"), "—");
  });

  it("labels sources, keeping an unknown one as sent", () => {
    assert.equal(sourceLabel("kiosk"), "Kiosk");
    assert.equal(sourceLabel("bulk_invite"), "Group invite");
    assert.equal(sourceLabel("something_new"), "something_new");
    assert.equal(sourceLabel(null), null);
  });

  it("capitalises a history status", () => {
    assert.equal(statusWord("expired"), "Expired");
  });

  it("describes a dependent by birthday and relationship", () => {
    assert.equal(
      dependentMeta({ dateOfBirth: "2016-05-20", relationship: "Son" }),
      "May 20, 2016 · Son",
    );
    assert.equal(dependentMeta({ dateOfBirth: null, relationship: null }), "—");
  });
});

describe("the forms", () => {
  const filled = {
    firstName: " Alaya ",
    lastName: "Verbrugge",
    email: " ",
    dateOfBirth: "",
    phone: " 586-339-2445 ",
  };

  it("sends trimmed details, with blanks as null, like the web", () => {
    assert.deepEqual(profilePayload(filled), {
      first_name: "Alaya",
      last_name: "Verbrugge",
      email: null,
      date_of_birth: null,
      phone: "586-339-2445",
    });
  });

  it("needs both names and a phone to save", () => {
    assert.equal(canSaveProfile(filled), true);
    assert.equal(canSaveProfile({ ...filled, lastName: "  " }), false);
    assert.equal(canSaveProfile({ ...filled, phone: "" }), false);
  });

  it("refuses a date of birth that isn't a real YYYY-MM-DD date", () => {
    assert.equal(dateOfBirthError(""), null);
    assert.equal(dateOfBirthError("2015-02-28"), null);
    assert.equal(dateOfBirthError("02/28/2015"), "Use the format YYYY-MM-DD.");
    assert.equal(dateOfBirthError("2015-02-30"), "That date does not exist.");
    assert.equal(canSaveProfile({ ...filled, dateOfBirth: "2015-13-01" }), false);
  });

  it("needs both names on a dependent, and sends blanks as null", () => {
    const draft = { firstName: "Mia", lastName: "Rosas", dateOfBirth: "", relationship: " " };
    assert.equal(canSaveDependent(draft), true);
    assert.equal(canSaveDependent({ ...draft, firstName: "" }), false);
    assert.deepEqual(dependentPayload(draft), {
      first_name: "Mia",
      last_name: "Rosas",
      date_of_birth: null,
      relationship: null,
    });
  });
});
