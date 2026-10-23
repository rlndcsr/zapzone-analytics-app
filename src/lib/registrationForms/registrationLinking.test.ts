import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  RegistrationCounts,
  RegistrationEventOption,
  RegistrationFormDetail,
} from "../../services/registrationFormsService.ts";
import {
  applySourceFill,
  canRetryFailure,
  describeFailure,
  editionLabel,
  formatEventDates,
  fromEventOutcome,
  hiddenEntriesLink,
  markRegistrationFormsStale,
  matchingEventAt,
  nextYearDate,
  safeReturnPath,
  signDateLine,
  sourceChoices,
  takeRegistrationFormsNotice,
  totalEntriesHint,
  venuesForSource,
  yearShift,
} from "./registrationForms.ts";

const option = (over: Partial<RegistrationEventOption> = {}): RegistrationEventOption => ({
  id: 1,
  name: "Halloween Bash",
  startDate: "2026-10-31",
  endDate: "2026-10-31",
  locationId: 1,
  locationName: "Brighton | Zap Zone",
  description: "Costumes welcome",
  image: null,
  hasImage: false,
  isActive: true,
  registrationFormIds: [],
  registrationGroups: [],
  ...over,
});

const counts: RegistrationCounts = {
  totalEntries: 10,
  uniqueRegistrations: 8,
  duplicateGroups: 1,
  entriesInDuplicateGroups: 2,
  returningContacts: 0,
  previousEditionRegistrants: 0,
  hiddenEntries: 0,
};

const detail = (over: Partial<RegistrationFormDetail> = {}): RegistrationFormDetail => ({
  id: 40,
  name: "Halloween Bash 2026",
  publicCode: "abc12345",
  publicUrl: "https://zap.example/register/abc12345",
  eventDate: "2026-10-31",
  status: "open",
  isOpen: true,
  description: "Costumes welcome",
  confirmationMessage: "See you at 6!",
  headerImagePath: "registration-headers/a.jpg",
  locationId: 4,
  locationName: "Brighton | Zap Zone",
  group: null,
  event: null,
  previousEdition: null,
  nextEdition: null,
  totalEntries: 0,
  uniqueRegistrations: 0,
  photoFrames: null,
  counts,
  locationLocked: false,
  canManageEvent: true,
  groupFormCount: 1,
  ...over,
});

describe("matchingEventAt — the same event at another location", () => {
  const source = option({ id: 1, locationId: 1 });

  it("is the source itself at the source's own location", () => {
    assert.equal(matchingEventAt(source, 1, [source]), source);
  });

  it("matches the same name (spacing and case aside) within three weeks", () => {
    const near = option({ id: 2, locationId: 2, name: "  halloween   bash ", startDate: "2026-11-14", endDate: "2026-11-14" });
    const far = option({ id: 3, locationId: 3, startDate: "2026-11-30", endDate: "2026-11-30" });
    assert.equal(matchingEventAt(source, 2, [source, near, far])?.id, 2);
    assert.equal(matchingEventAt(source, 3, [source, near, far]), null);
  });

  it("never matches a differently named event", () => {
    const other = option({ id: 2, locationId: 2, name: "Christmas Party" });
    assert.equal(matchingEventAt(source, 2, [source, other]), null);
  });

  it("prefers an upcoming run over one that has finished, then the closest", () => {
    const finished = option({ id: 2, locationId: 2, startDate: "2026-10-29", endDate: "2026-10-29" });
    const upcoming = option({ id: 3, locationId: 2, startDate: "2026-11-10", endDate: "2026-11-10" });
    assert.equal(matchingEventAt(source, 2, [source, finished, upcoming], "2026-10-30")?.id, 3);
    assert.equal(matchingEventAt(source, 2, [source, finished, upcoming])?.id, 2);
  });
});

describe("venuesForSource — which locations are ticked for a company admin", () => {
  it("ticks the source's location and others running it that are active, upcoming and formless", () => {
    const source = option({ id: 1, locationId: 1 });
    const options = [
      source,
      option({ id: 2, locationId: 2 }),
      option({ id: 3, locationId: 3, registrationFormIds: [77] }),
      option({ id: 4, locationId: 4, isActive: false }),
    ];
    assert.deepEqual(venuesForSource(source, [1, 2, 3, 4, 5], options, "2026-10-01"), [1, 2]);
  });

  it("leaves out a location whose event has already finished", () => {
    const source = option({ id: 1, locationId: 1, startDate: "2026-10-31", endDate: "2026-11-02" });
    const ended = option({ id: 2, locationId: 2, startDate: "2026-10-20", endDate: "2026-10-20" });
    assert.deepEqual(venuesForSource(source, [1, 2], [source, ended], "2026-10-25"), [1]);
  });
});

describe("sourceChoices — events offered to start from", () => {
  it("offers upcoming events at the allowed locations, soonest first, keeping the current pick", () => {
    const past = option({ id: 1, startDate: "2026-09-01", endDate: "2026-09-01" });
    const later = option({ id: 2, name: "Christmas", startDate: "2026-12-24", endDate: "2026-12-24" });
    const sooner = option({ id: 3, startDate: "2026-10-31", endDate: "2026-10-31" });
    const elsewhere = option({ id: 4, locationId: 9 });
    const all = [past, later, sooner, elsewhere];
    assert.deepEqual(sourceChoices(all, new Set([1]), null, "2026-10-01").map((o) => o.id), [3, 2]);
    assert.deepEqual(sourceChoices(all, new Set([1]), 1, "2026-10-01").map((o) => o.id), [1, 3, 2]);
  });
});

describe("applySourceFill — a new pick only replaces what the last pick filled in", () => {
  const first = option({ id: 1, name: "Halloween Bash", description: "Costumes", startDate: "2026-10-30", endDate: "2026-10-31" });
  const second = option({ id: 2, name: "Christmas Party", description: "Bring a gift", startDate: "2026-12-24", endDate: "2026-12-24" });

  it("fills empty fields, using the event's last day as the form date", () => {
    const fill = applySourceFill({ name: "", description: "", date: "" }, {}, first);
    assert.deepEqual(fill.values, { name: "Halloween Bash", description: "Costumes", date: "2026-10-31" });
  });

  it("replaces the previous pick's text but keeps what staff typed", () => {
    const one = applySourceFill({ name: "", description: "", date: "" }, {}, first);
    const typed = { ...one.values, name: "Spooky Night" };
    const two = applySourceFill(typed, one.filled, second);
    assert.deepEqual(two.values, { name: "Spooky Night", description: "Bring a gift", date: "2026-12-24" });
  });
});

describe("next year's edition", () => {
  it("moves every year in the name on by one", () => {
    assert.equal(yearShift("Halloween Bash 2026", 1), "Halloween Bash 2027");
    assert.equal(yearShift("Winter 2026/2027", 1), "Winter 2027/2028");
    assert.equal(yearShift("Bash 12026", 1), "Bash 12026");
  });

  it("keeps the day, turning 29 February into the 28th", () => {
    assert.equal(nextYearDate("2026-10-31"), "2027-10-31");
    assert.equal(nextYearDate("2028-02-29"), "2029-02-28");
    assert.equal(nextYearDate("bad"), "bad");
  });

  it("labels an edition with its year unless the name already has it", () => {
    assert.equal(editionLabel(null), "");
    assert.equal(editionLabel({ id: 1, name: "Halloween Bash", eventDate: "2025-10-31" }), "Halloween Bash (2025)");
    assert.equal(editionLabel({ id: 1, name: "Halloween 2025", eventDate: "2025-10-31" }), "Halloween 2025");
  });
});

describe("linked event dates", () => {
  it("shows one day, or the span of a multi-day event", () => {
    assert.equal(formatEventDates({ startDate: "2026-10-31", endDate: "2026-10-31" }), "October 31, 2026");
    assert.equal(
      formatEventDates({ startDate: "2026-10-30", endDate: "2026-10-31" }),
      "October 30, 2026 – October 31, 2026",
    );
    assert.equal(formatEventDates({ startDate: null, endDate: null }), "");
  });

  it("prints the event's span on the QR sign when the form closes on its last day", () => {
    const event = { id: 5, name: "Bash", startDate: "2026-10-30", endDate: "2026-10-31" };
    assert.equal(signDateLine(detail({ event })), "October 30, 2026 – October 31, 2026");
    assert.equal(signDateLine(detail({ event: null })), "October 31, 2026");
    assert.equal(signDateLine(detail({ event, eventDate: "2026-10-30" })), "October 30, 2026");
  });
});

describe("fromEventOutcome — Manage Events' Registration form button", () => {
  it("opens the newest linked form, and starts a new event when there's none", () => {
    assert.deepEqual(fromEventOutcome(option({ registrationFormIds: [12] })), { kind: "open", formId: 12 });
    assert.deepEqual(fromEventOutcome(option({ registrationFormIds: [12, 13] })), { kind: "open", formId: 13 });
    assert.deepEqual(fromEventOutcome(option()), { kind: "create" });
    assert.deepEqual(fromEventOutcome(undefined), { kind: "missing" });
  });
});

describe("hidden entries in the counts", () => {
  it("says when hidden entries aren't counted, and links to them", () => {
    assert.equal(totalEntriesHint(counts), "Every form submitted, including repeats.");
    assert.equal(
      totalEntriesHint({ ...counts, hiddenEntries: 1 }),
      "Every form submitted, including repeats. 1 hidden entry is not counted.",
    );
    assert.equal(
      totalEntriesHint({ ...counts, hiddenEntries: 3 }),
      "Every form submitted, including repeats. 3 hidden entries are not counted.",
    );
    assert.equal(hiddenEntriesLink(1), "View 1 hidden entry");
    assert.equal(hiddenEntriesLink(3), "View 3 hidden entries");
  });
});

describe("error page", () => {
  const error = (status: number, body?: unknown) => Object.assign(new Error("x"), { status, body });

  it("offers Try again for no response or a server failure only", () => {
    assert.equal(canRetryFailure(describeFailure(error(0), "f")), true);
    assert.equal(canRetryFailure(describeFailure(error(500), "f")), true);
    assert.equal(canRetryFailure(describeFailure(error(404), "f")), false);
    assert.equal(canRetryFailure(describeFailure(error(403, { switch_location_id: 9 }), "f")), false);
    assert.equal(describeFailure(null, "f").status, null);
  });

  it("only reopens an in-app path after a location switch", () => {
    assert.equal(
      safeReturnPath("/events/registration-form-details?id=12"),
      "/events/registration-form-details?id=12",
    );
    assert.equal(safeReturnPath("//evil.example"), null);
    assert.equal(safeReturnPath("https://evil.example"), null);
    assert.equal(safeReturnPath(undefined), null);
  });
});

describe("list notice", () => {
  it("is shown once", () => {
    takeRegistrationFormsNotice();
    markRegistrationFormsStale('Deleted "Halloween Bash"');
    assert.equal(takeRegistrationFormsNotice(), 'Deleted "Halloween Bash"');
    assert.equal(takeRegistrationFormsNotice(), null);
    markRegistrationFormsStale();
    assert.equal(takeRegistrationFormsNotice(), null);
  });
});
