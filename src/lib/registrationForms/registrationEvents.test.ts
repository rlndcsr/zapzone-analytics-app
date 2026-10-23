import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  RegistrationEventGroupDetail,
  RegistrationEventOption,
  RegistrationFormDetail,
  RegistrationFormRow,
  RegistrationGroupExportRow,
  RegistrationMergeCandidate,
} from "../../services/registrationFormsService.ts";
import {
  candidatesByLocation,
  decodeEventLinks,
  decodeIds,
  encodeEventLinks,
  existingGroupFor,
  formRemoval,
  groupAddInput,
  groupCsvFilename,
  groupDeleteWarning,
  groupEditInput,
  groupExportTable,
  groupOpenState,
  groupScope,
  groupSuggestion,
  moveSourceLine,
  nextEventPrefill,
  pendingAddLocations,
  previousGroupChoices,
  shortVenueName,
  validateRegistrationEvent,
  venueSummary,
  yearChoices,
  type RegistrationEventDraft,
} from "./registrationForms.ts";

const formRow = (over: Partial<RegistrationFormRow> = {}): RegistrationFormRow => ({
  id: 101,
  name: "Trunk or Treat 2026",
  publicCode: "abc12345",
  publicUrl: "https://zap.example/register/abc12345",
  eventDate: "2026-10-31",
  status: "open",
  isOpen: true,
  description: null,
  confirmationMessage: null,
  headerImagePath: null,
  locationId: 1,
  locationName: "Brighton | Zap Zone",
  group: { id: 9, name: "Trunk or Treat 2026", eventDate: "2026-10-31" },
  event: null,
  previousEdition: null,
  nextEdition: null,
  totalEntries: 0,
  uniqueRegistrations: 0,
  photoFrames: null,
  ...over,
});

const group =(over: Partial<RegistrationEventGroupDetail> = {}): RegistrationEventGroupDetail => ({
  id: 9,
  name: "Trunk or Treat 2026",
  eventDate: "2026-10-31",
  description: "Costumes welcome",
  confirmationMessage: "See you at 6!",
  headerImagePath: "registration-headers/t.jpg",
  status: "open",
  canManage: true,
  locationFormsTotal: 2,
  previousGroup: null,
  nextGroup: null,
  // The event's combined numbers — not the sum the screen could make from its forms.
  counts: { totalEntries: 30, uniqueRegistrations: 24, registeredBefore: 5, locationForms: 2 },
  forms: [
    formRow({ id: 101, locationId: 1, totalEntries: 20, uniqueRegistrations: 15 }),
    formRow({ id: 102, locationId: 2, locationName: "Novi | Zap Zone", totalEntries: 10, uniqueRegistrations: 9 }),
  ],
  mergeCandidates: [],
  ...over,
});

const option = (over: Partial<RegistrationEventOption> = {}): RegistrationEventOption => ({
  id: 1,
  name: "Trunk or Treat",
  startDate: "2026-10-31",
  endDate: "2026-10-31",
  locationId: 1,
  locationName: "Brighton | Zap Zone",
  description: null,
  image: null,
  hasImage: false,
  isActive: true,
  registrationFormIds: [],
  registrationGroups: [],
  ...over,
});

const candidate = (over: Partial<RegistrationMergeCandidate> = {}): RegistrationMergeCandidate => ({
  id: 300,
  locationId: 3,
  locationName: "Howell | Zap Zone",
  eventDate: "2026-10-30",
  status: "open",
  totalEntries: 4,
  groupId: 50,
  groupName: "Trunk or Treat",
  groupEventDate: "2026-10-30",
  groupLocationForms: 2,
  ...over,
});

const draftOf = (g: RegistrationEventGroupDetail): RegistrationEventDraft => ({
  name: g.name,
  eventDate: g.eventDate,
  description: g.description ?? "",
  confirmationMessage: g.confirmationMessage ?? "",
  previousGroupId: g.previousGroup?.id ?? null,
  locationIds: g.forms.map((form) => form.locationId),
  eventLinks: {},
  moveFormIds: [],
  isOpen: groupOpenState(g).allOpen,
  openTouched: false,
});

describe("an event across its location forms", () => {
  it("says whether it shows every location in the event or only the user's", () => {
    assert.deepEqual(groupScope(group()), { allLocations: true, soleVenue: null, label: "All participating locations" });
    const managerView = group({ locationFormsTotal: 3, forms: [group().forms[1]] });
    assert.deepEqual(groupScope(managerView), {
      allLocations: false,
      soleVenue: "Novi (Zap Zone)",
      label: "Novi (Zap Zone) only",
    });
    assert.equal(groupScope(group({ locationFormsTotal: 5 })).label, "2 of your locations");
  });

  it("names the one location of a single-location event, otherwise counts its forms", () => {
    assert.equal(venueSummary(["Brighton | Zap Zone"], 1), "Brighton (Zap Zone)");
    assert.equal(venueSummary(["Brighton | Zap Zone", "Novi | Zap Zone"], 2), "2 location forms");
    assert.equal(venueSummary([], 1), "1 location form");
  });

  it("offers every year with events, this year and the one shown, newest first", () => {
    assert.deepEqual(yearChoices([2025, 2024], 2026, 2026), [2026, 2025, 2024]);
    assert.deepEqual(yearChoices([2026], 2026, 2023), [2026, 2023]);
  });

  it("shortens a venue to its city for per-location copy", () => {
    assert.equal(shortVenueName("Brighton | Zap Zone"), "Brighton");
    assert.equal(shortVenueName("Novi"), "Novi");
    assert.equal(shortVenueName(null), null);
  });
});

describe("next year's event", () => {
  it("copies the event a year forward at the same locations, linked back to it", () => {
    assert.deepEqual(nextEventPrefill(group()), {
      name: "Trunk or Treat 2027",
      eventDate: "2027-10-31",
      description: "Costumes welcome",
      confirmationMessage: "See you at 6!",
      locationIds: [1, 2],
      previousGroupId: 9,
      previousGroupName: "Trunk or Treat 2026",
      copyHeaderFromGroup: 9,
      headerImagePath: "registration-headers/t.jpg",
    });
  });

  it("adds next year to a name without one, keeps 28 February for a leap day, and copies no missing image", () => {
    const prefill = nextEventPrefill(group({ name: "Leap Party", eventDate: "2028-02-29", headerImagePath: null }));
    assert.equal(prefill.name, "Leap Party 2029");
    assert.equal(prefill.eventDate, "2029-02-28");
    assert.equal(prefill.copyHeaderFromGroup, null);
  });

  it("lists earlier events as last year's, never the event itself, keeping the current pick", () => {
    const summary = (id: number, eventDate: string) => ({
      id,
      name: `Event ${id}`,
      eventDate,
      status: "past" as const,
      locationForms: 1,
      locationNames: [],
      totalEntries: 0,
      uniqueRegistrations: 0,
      canManage: true,
    });
    const options = [summary(1, "2025-10-31"), summary(9, "2026-10-31"), summary(3, "2026-12-01"), summary(1, "2025-10-31")];
    assert.deepEqual(previousGroupChoices(options, 9, "2026-10-31", null).map((o) => o.id), [1]);
    assert.deepEqual(previousGroupChoices(options, 9, "2026-10-31", 3).map((o) => o.id), [3, 1]);
  });
});

describe("groupEditInput — Edit event sends only what changed", () => {
  it("sends nothing when nothing changed, and never the open state it loaded", () => {
    assert.deepEqual(groupEditInput(group(), draftOf(group())), {});
  });

  it("sends a rename, a date move and a cleared last-year link", () => {
    const g = group({ previousGroup: { id: 4, name: "Trunk or Treat 2025", eventDate: "2025-10-31" } });
    assert.deepEqual(
      groupEditInput(g, { ...draftOf(g), name: " Trunk or Treat!  ", eventDate: "2026-11-01", previousGroupId: null }),
      { name: "Trunk or Treat!", eventDate: "2026-11-01", previousGroupId: null },
    );
  });

  it("sends the whole location set with the locations it showed, so a concurrent change is refused", () => {
    const input = groupEditInput(group(), {
      ...draftOf(group()),
      locationIds: [1, 3],
      eventLinks: { 3: 77 },
      moveFormIds: [300],
    });
    assert.deepEqual(input, {
      locationIds: [1, 3],
      expectedLocationIds: [1, 2],
      eventLinks: { 3: 77 },
      moveFormIds: [300],
    });
  });

  it("opens or closes every form only once staff touch it — including a mix of states", () => {
    const mixed = group({ forms: [formRow({ locationId: 1, isOpen: true }), formRow({ id: 102, locationId: 2, isOpen: false })] });
    assert.deepEqual(groupOpenState(mixed), { allOpen: false, mixedOpen: true });
    assert.deepEqual(groupEditInput(mixed, draftOf(mixed)), {});
    assert.deepEqual(groupEditInput(mixed, { ...draftOf(mixed), openTouched: true }), { isOpen: false });
    assert.deepEqual(groupEditInput(group(), { ...draftOf(group()), openTouched: true }), {});
    assert.deepEqual(groupEditInput(group(), { ...draftOf(group()), isOpen: false, openTouched: true }), { isOpen: false });
  });
});

describe("adding locations to an existing event", () => {
  it("keeps every location already in it and checks them against the server", () => {
    assert.deepEqual(groupAddInput(group(), { locationIds: [1, 2, 4], eventLinks: { 4: 12 }, moveFormIds: [] }), {
      locationIds: [1, 2, 4],
      expectedLocationIds: [1, 2],
      eventLinks: { 4: 12 },
    });
  });

  it("joins only locations not in the event yet, or says which already are", () => {
    assert.deepEqual(pendingAddLocations(group(), [2, 3]), { fresh: [3], alreadyMessage: null });
    assert.deepEqual(pendingAddLocations(group(), [2]), {
      fresh: [],
      alreadyMessage: "Novi (Zap Zone) is already in this event.",
    });
    assert.equal(pendingAddLocations(group(), [1, 2]).alreadyMessage, "Brighton (Zap Zone), Novi (Zap Zone) are already in this event.");
  });

  it("offers one existing form per location to move in", () => {
    const byLocation = candidatesByLocation([candidate({ id: 1 }), candidate({ id: 2 }), candidate({ id: 3, locationId: 4 })]);
    assert.deepEqual([...byLocation.values()].map((c) => c.id), [1, 3]);
  });

  it("says what happens to a moved form's old event", () => {
    assert.equal(
      moveSourceLine(candidate(), true, 1, "Howell"),
      "It's part of the other event “Trunk or Treat” (October 30, 2026); 1 of its 2 location forms will stay there.",
    );
    assert.equal(
      moveSourceLine(candidate(), true, 2, "Howell"),
      "Its other event “Trunk or Treat” (October 30, 2026) will be merged into this one.",
    );
    assert.equal(
      moveSourceLine(candidate(), false, 0, "Howell"),
      "Howell will then have two forms: the existing one stays in the other event “Trunk or Treat” (October 30, 2026).",
    );
    assert.equal(moveSourceLine(candidate({ groupName: null }), true, 0, "Howell"), null);
  });

  it("carries a join's locations and their own events through a route param", () => {
    assert.equal(encodeEventLinks({ 3: 77, 4: 12 }), "3:77,4:12");
    assert.deepEqual(decodeEventLinks("3:77,4:12,bad,5:0"), { 3: 77, 4: 12 });
    assert.deepEqual(decodeEventLinks(undefined), {});
    assert.deepEqual(decodeIds("3,4,x,0"), [3, 4]);
  });
});

describe("starting a new event from Manage Events when one already exists", () => {
  const existing = {
    id: 9,
    name: "Trunk or Treat 2026",
    canManage: true,
    forms: [{ id: 101, locationId: 1, eventId: 1, eventDate: "2026-10-31" }],
  };
  const source = option({ id: 1, locationId: 1, registrationFormIds: [101], registrationGroups: [existing] });
  const atNovi = option({ id: 2, locationId: 2, locationName: "Novi | Zap Zone" });
  const options = [source, atNovi];

  it("finds the event that already holds forms for it", () => {
    assert.equal(existingGroupFor(source, [1, 2], options, "2026-10-01", [1, 2])?.id, 9);
    assert.equal(existingGroupFor(atNovi, [2], [atNovi], "2026-10-01", [2]), null);
  });

  it("offers to add the other location instead of a duplicate event, and opens the one already in it", () => {
    const linkFor = (id: number) => (id === 1 ? source : id === 2 ? atNovi : null);
    assert.deepEqual(groupSuggestion(existing, [1, 2], linkFor), {
      joinVenues: [2],
      unlinked: [],
      already: [],
    });
    const unlinkedSource = option({ id: 1, locationId: 1 });
    const unlinked = { ...existing, forms: [{ ...existing.forms[0], eventId: null }] };
    assert.deepEqual(groupSuggestion(unlinked, [1], () => unlinkedSource), {
      joinVenues: [],
      unlinked: [{ locationId: 1, formId: 101, eventId: 1, formDate: "2026-10-31" }],
      already: [],
    });
    assert.deepEqual(groupSuggestion(existing, [1], () => null).already, [{ locationId: 1, formId: 101 }]);
  });

  it("prefers an event that doesn't split another one", () => {
    const a = { id: 20, name: "A", canManage: true, forms: [{ id: 1, locationId: 1, eventId: null, eventDate: "2026-10-31" }, { id: 2, locationId: 3, eventId: 5, eventDate: "2026-10-31" }] };
    const b = { id: 21, name: "B", canManage: true, forms: [{ id: 3, locationId: 2, eventId: 2, eventDate: "2026-10-31" }] };
    const src = option({ id: 1, locationId: 1, registrationGroups: [a] });
    const other = option({ id: 2, locationId: 2, registrationGroups: [b] });
    assert.equal(existingGroupFor(src, [1, 2], [src, other], "2026-10-01", [1, 2])?.id, 20);
  });
});

describe("removing a location form or a whole event", () => {
  const detail = (over: Partial<RegistrationFormDetail> = {}): RegistrationFormDetail => ({
    ...formRow(),
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
    groupFormCount: 2,
    photoEmailActive: true,
    ...over,
  });

  it("removes one location from an event that has others", () => {
    const removal = formRemoval(detail());
    assert.equal(removal.label, "Remove location");
    assert.equal(removal.leavesEvent, true);
    assert.match(removal.message, /^Remove Brighton \(Zap Zone\) from "Trunk or Treat 2026"\?/);
  });

  it("deletes the event with its last form, or a form that isn't in one", () => {
    assert.equal(formRemoval(detail({ groupFormCount: 1 })).label, "Delete event");
    const ungrouped = formRemoval(detail({ group: null, name: "Old form" }));
    assert.equal(ungrouped.label, "Delete form");
    assert.equal(ungrouped.leavesEvent, false);
    assert.equal(ungrouped.message, `Delete "Old form"? Its form, QR code and registration list will be removed.`);
  });

  it("warns how many location forms an event delete takes", () => {
    assert.equal(
      groupDeleteWarning(group()),
      `Delete "Trunk or Treat 2026"? Its 2 location forms, QR codes and registration lists will be removed.`,
    );
    assert.equal(
      groupDeleteWarning(group({ locationFormsTotal: 1 })),
      `Delete "Trunk or Treat 2026"? Its 1 location form, QR code and registration list will be removed.`,
    );
  });
});

describe("validateRegistrationEvent — the event editor's checks", () => {
  it("needs a name, a location and a date to create or edit", () => {
    assert.deepEqual(
      validateRegistrationEvent({ mode: "create", name: " ", locationIds: [], addedCount: 0, eventDate: "" }),
      {
        name: "Please give the event a name.",
        location_ids: "Choose at least one location.",
        event_date: "Choose the event date.",
      },
    );
    assert.deepEqual(
      validateRegistrationEvent({ mode: "edit", name: "Bash", locationIds: [1], addedCount: 0, eventDate: "2026-10-31" }),
      {},
    );
  });

  it("needs a newly ticked location to add one", () => {
    assert.deepEqual(
      validateRegistrationEvent({ mode: "add", name: "", locationIds: [1, 2], addedCount: 0, eventDate: "" }),
      { location_ids: "Tick the locations to add." },
    );
  });
});

describe("the event CSV", () => {
  const row = (over: Partial<RegistrationGroupExportRow> = {}): RegistrationGroupExportRow => ({
    locationId: 1,
    locationName: "Brighton | Zap Zone",
    entryId: 5,
    registeredAt: "2026-10-20T18:00:00Z",
    name: "Ann",
    email: "ann@example.com",
    phone: "5551234567",
    contactId: 7,
    sameContactEntries: 1,
    isDuplicate: false,
    returning: true,
    registeredPreviousEdition: true,
    ...over,
  });

  it("leads each entry with its location and adds last year's column only when linked", () => {
    const table = groupExportTable([row(), row({ locationName: null, entryId: 6 })], true);
    assert.deepEqual(table.headers, [
      "Location",
      "Entry ID",
      "Registered",
      "Name",
      "Email",
      "Phone",
      "Contact ID",
      "Entries with same contact",
      "Same contact details",
      "Registered before",
      "Registered for last year's event",
    ]);
    assert.equal(table.rows[0][0], "Brighton (Zap Zone)");
    assert.equal(table.rows[0][10], "Yes");
    assert.equal(table.rows[1][0], "");
    assert.equal(groupExportTable([row()], false).headers.includes("Registered for last year's event"), false);
  });

  it("names the file after the event", () => {
    assert.equal(groupCsvFilename("Trunk or Treat 2026", "2026-10-22"), "trunk-or-treat-2026-registrations-2026-10-22.csv");
  });
});
