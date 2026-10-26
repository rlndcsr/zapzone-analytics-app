import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RegistrationFormDetail } from "../../services/registrationFormsService.ts";
import {
  changedFormFields,
  multipartEntries,
  registrationGroupBody,
  registrationUpdateBody,
  type RegistrationFormDraft,
} from "./registrationPayload.ts";

const original: RegistrationFormDetail = {
  id: 40,
  name: "Halloween Bash",
  publicCode: "abc12345",
  publicUrl: "https://zap.example/register/abc12345",
  eventDate: "2026-10-31",
  status: "open",
  isOpen: true,
  description: null,
  confirmationMessage: "See you at 6!",
  headerImagePath: null,
  locationId: 4,
  locationName: "Brighton | Zap Zone",
  group: null,
  event: { id: 7, name: "Halloween Bash", startDate: "2026-10-31", endDate: "2026-10-31" },
  previousEdition: { id: 30, name: "Halloween Bash", eventDate: "2025-10-31" },
  nextEdition: null,
  totalEntries: 0,
  uniqueRegistrations: 0,
  photoFrames: null,
  counts: {
    totalEntries: 0,
    uniqueRegistrations: 0,
    duplicateGroups: 0,
    entriesInDuplicateGroups: 0,
    returningContacts: 0,
    previousEditionRegistrants: 0,
    hiddenEntries: 0,
  },
  locationLocked: false,
  canManageEvent: true,
  groupFormCount: 1,
  photoEmail: null,
};

/** The editor as loaded from `original`, before any change. */
const untouched: RegistrationFormDraft = {
  name: "Halloween Bash",
  eventDate: "2026-10-31",
  description: "",
  confirmationMessage: "See you at 6!",
  eventId: 7,
  isOpen: true,
};

describe("changedFormFields — an edit sends only what changed", () => {
  it("sends nothing when nothing changed (a null description reads as empty)", () => {
    assert.deepEqual(changedFormFields(original, untouched), {});
  });

  it("never re-sends the open state it loaded, so a stale screen can't reopen a closed form", () => {
    const patch = changedFormFields(original, { ...untouched, name: "Halloween Bash!" });
    assert.deepEqual(patch, { name: "Halloween Bash!" });
    assert.equal("isOpen" in registrationUpdateBody(patch), false);
    assert.equal("is_open" in registrationUpdateBody(patch), false);
  });

  it("sends an open/closed change made in the editor", () => {
    assert.deepEqual(changedFormFields(original, { ...untouched, isOpen: false }), { isOpen: false });
  });

  it("trims the name and compares the trimmed value", () => {
    assert.deepEqual(changedFormFields(original, { ...untouched, name: "  Halloween Bash  " }), {});
  });

  it("sends a cleared event link as an explicit null", () => {
    const patch = changedFormFields(original, { ...untouched, eventId: null });
    assert.deepEqual(patch, { eventId: null });
    assert.deepEqual(registrationUpdateBody(patch), { event_id: null });
  });

  it("sends a new date and texts", () => {
    assert.deepEqual(
      changedFormFields(original, {
        ...untouched,
        eventDate: "2026-11-01",
        description: "Costumes",
        confirmationMessage: "",
      }),
      { eventDate: "2026-11-01", description: "Costumes", confirmationMessage: "" },
    );
  });

  it("never renames a form in an event, which the backend refuses", () => {
    const grouped = { ...original, group: { id: 9, name: "Halloween Bash", eventDate: "2026-10-31" } };
    assert.deepEqual(changedFormFields(grouped, { ...untouched, name: "Spooky Night", isOpen: false }), {
      isOpen: false,
    });
  });
});

describe("registrationUpdateBody", () => {
  it("maps to the backend's keys and only asks to remove an image when none is being uploaded", () => {
    assert.deepEqual(registrationUpdateBody({ isOpen: false, removeHeaderImage: true }), {
      is_open: false,
      remove_header_image: true,
    });
    assert.deepEqual(
      registrationUpdateBody({
        headerImage: { uri: "file:///a.jpg", name: "a.jpg", type: "image/jpeg" },
        removeHeaderImage: true,
      }),
      {},
    );
  });
});

describe("registrationGroupBody — an event and its location forms", () => {
  const create = {
    name: "Halloween Bash",
    eventDate: "2026-10-31",
    description: "",
    confirmationMessage: "",
    locationIds: [1, 2],
    eventId: 7,
    eventLinks: { 1: 7, 2: 9 },
    useEventImage: false,
    copyHeaderImageFromGroup: null,
    previousGroupId: 12,
    isOpen: true,
    headerImage: null,
  };

  it("sends the locations, the source event, each location's own event and last year's event", () => {
    assert.deepEqual(registrationGroupBody(create), {
      name: "Halloween Bash",
      event_date: "2026-10-31",
      description: "",
      confirmation_message: "",
      location_ids: [1, 2],
      event_id: 7,
      event_links: { 1: 7, 2: 9 },
      previous_group_id: 12,
      is_open: true,
    });
  });

  it("only asks for the event's picture, a copied header or a removal when wanted", () => {
    const body = registrationGroupBody({ ...create, useEventImage: true, copyHeaderImageFromGroup: 40 });
    assert.equal(body.use_event_image, true);
    assert.equal(body.copy_header_image_from_group, 40);
    assert.equal("confirm_remove" in body, false);
    assert.equal("move_form_ids" in body, false);
  });

  it("sends only the keys present on an update, with the locations it expects", () => {
    assert.deepEqual(
      registrationGroupBody({
        locationIds: [1, 3],
        expectedLocationIds: [1, 2],
        eventLinks: {},
        moveFormIds: [55],
        confirmRemove: true,
      }),
      {
        location_ids: [1, 3],
        expected_location_ids: [1, 2],
        event_links: {},
        move_form_ids: [55],
        confirm_remove: true,
      },
    );
    assert.deepEqual(registrationGroupBody({ previousGroupId: null }), { previous_group_id: null });
  });
});

describe("multipartEntries — the same body when an image is uploaded", () => {
  it("writes lists as key[], maps as key[k], null as empty and booleans as 1/0", () => {
    assert.deepEqual(
      multipartEntries({
        name: "Bash",
        location_ids: [1, 2],
        event_links: { 1: 7 },
        event_id: null,
        is_open: false,
      }),
      [
        ["name", "Bash"],
        ["location_ids[]", "1"],
        ["location_ids[]", "2"],
        ["event_links[1]", "7"],
        ["event_id", ""],
        ["is_open", "0"],
      ],
    );
  });
});
