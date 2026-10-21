import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RegistrationFormDetail } from "../../services/registrationFormsService.ts";
import {
  changedFormFields,
  multipartEntries,
  registrationCreateBody,
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
  event: { id: 7, name: "Halloween Bash", startDate: "2026-10-31", endDate: "2026-10-31" },
  previousEdition: { id: 30, name: "Halloween Bash", eventDate: "2025-10-31" },
  nextEdition: null,
  totalEntries: 0,
  uniqueRegistrations: 0,
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
};

/** The editor as loaded from `original`, before any change. */
const untouched: RegistrationFormDraft = {
  name: "Halloween Bash",
  locationId: 4,
  eventDate: "2026-10-31",
  description: "",
  confirmationMessage: "See you at 6!",
  previousEditionId: 30,
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

  it("sends a cleared link or edition as an explicit null", () => {
    const patch = changedFormFields(original, { ...untouched, eventId: null, previousEditionId: null });
    assert.deepEqual(patch, { eventId: null, previousEditionId: null });
    assert.deepEqual(registrationUpdateBody(patch), { event_id: null, previous_edition_id: null });
  });

  it("sends a new location, date and texts", () => {
    assert.deepEqual(
      changedFormFields(original, {
        ...untouched,
        locationId: 5,
        eventDate: "2026-11-01",
        description: "Costumes",
        confirmationMessage: "",
      }),
      { locationId: 5, eventDate: "2026-11-01", description: "Costumes", confirmationMessage: "" },
    );
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

describe("registrationCreateBody — one form per location", () => {
  const input = {
    name: "Halloween Bash",
    locationIds: [1, 2],
    eventDate: "2026-10-31",
    description: "",
    confirmationMessage: "",
    previousEditionId: null,
    eventId: 7,
    eventLinks: { 1: 7, 2: 9 },
    useEventImage: false,
    copyHeaderImageFrom: null,
    isOpen: true,
    headerImage: null,
  };

  it("sends the locations, the source event and each location's own event", () => {
    assert.deepEqual(registrationCreateBody(input), {
      name: "Halloween Bash",
      location_ids: [1, 2],
      event_date: "2026-10-31",
      description: "",
      confirmation_message: "",
      previous_edition_id: null,
      event_id: 7,
      event_links: { 1: 7, 2: 9 },
      is_open: true,
    });
  });

  it("only asks for the event's picture or a copied header when wanted", () => {
    const body = registrationCreateBody({ ...input, useEventImage: true, copyHeaderImageFrom: 40 });
    assert.equal(body.use_event_image, true);
    assert.equal(body.copy_header_image_from, 40);
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
