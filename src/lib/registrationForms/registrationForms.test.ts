import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RegistrationCounts } from "../../services/registrationFormsService.ts";
import {
  MODULE_UNAVAILABLE_MESSAGE,
  consumeRegistrationFormsStale,
  describeFailure,
  duplicateHint,
  emptyListMessage,
  fieldErrorsFrom,
  fileSlug,
  filterOptions,
  foldLocationErrors,
  headerImageProblem,
  historyButtonLabel,
  kioskUrl,
  listSummary,
  locationDisplayName,
  markRegistrationFormsStale,
  previewUrl,
  registrationExportTable,
  registrationsCsvFilename,
  validateRegistrationForm,
} from "./registrationForms.ts";

/** The `ApiError` shape: status + message, the parsed body, 422 field errors. */
const apiError = (
  status: number,
  message: string,
  body?: unknown,
  fieldErrors?: Record<string, string[]>,
) => Object.assign(new Error(message), { status, body, fieldErrors });

const counts = (over: Partial<RegistrationCounts> = {}): RegistrationCounts => ({
  totalEntries: 0,
  uniqueRegistrations: 0,
  duplicateGroups: 0,
  entriesInDuplicateGroups: 0,
  returningContacts: 0,
  previousEditionRegistrants: 0,
  hiddenEntries: 0,
  ...over,
});

describe("describeFailure — what staff are told when a request fails", () => {
  it("says the module isn't set up when the backend reports MODULE_UNAVAILABLE", () => {
    const failure = describeFailure(
      apiError(503, "Registration forms are not set up yet.", {
        code: "MODULE_UNAVAILABLE",
      }),
      "Registration forms could not be loaded.",
    );
    assert.equal(failure.message, MODULE_UNAVAILABLE_MESSAGE);
    assert.equal(failure.unavailable, true);
  });

  it("keeps the server's refusal and the location to switch to", () => {
    const reason =
      "That registration form belongs to Novi. Switch to Novi in the sidebar to work with it.";
    const failure = describeFailure(
      apiError(403, reason, { switch_location_id: 9 }),
      "This registration form could not be loaded.",
    );
    assert.equal(failure.message, reason);
    assert.equal(failure.switchLocationId, 9);
    assert.equal(failure.unavailable, false);
  });

  it("falls back on a missing form or a server failure", () => {
    const fallback = "This registration form could not be loaded.";
    assert.equal(
      describeFailure(apiError(404, "That registration form could not be found."), fallback).message,
      fallback,
    );
    assert.equal(
      describeFailure(apiError(500, "Something went wrong. Please try again."), fallback).message,
      fallback,
    );
    assert.equal(describeFailure(apiError(500, "x"), fallback).switchLocationId, null);
  });
});

describe("fieldErrorsFrom — a 422's first message per field", () => {
  it("maps each field to its first message", () => {
    const err = apiError(422, "Choose the event date.", undefined, {
      event_date: ["Choose the event date.", "second"],
      previous_edition_id: ["Choose an earlier event from the same location."],
    });
    assert.deepEqual(fieldErrorsFrom(err), {
      event_date: "Choose the event date.",
      previous_edition_id: "Choose an earlier event from the same location.",
    });
  });

  it("is empty when the failure carries no field errors", () => {
    assert.deepEqual(fieldErrorsFrom(apiError(403, "Forbidden")), {});
    assert.deepEqual(fieldErrorsFrom(null), {});
  });
});

describe("links — the server's public_url is used as-is", () => {
  it("adds the web's kiosk and preview flags to the canonical link", () => {
    const url = "https://zap.example/register/abc12345";
    assert.equal(kioskUrl(url), `${url}?kiosk=1`);
    assert.equal(previewUrl(url), `${url}?preview=1`);
  });
});

describe("display helpers", () => {
  it("shows a 'City | Brand' venue as 'City (Brand)'", () => {
    assert.equal(locationDisplayName("Brighton | Zap Zone"), "Brighton (Zap Zone)");
    assert.equal(locationDisplayName("Novi"), "Novi");
  });

  it("slugs a file name and falls back when nothing is left", () => {
    assert.equal(fileSlug("Halloween Bash 2026!", "registrations"), "halloween-bash-2026");
    assert.equal(fileSlug("!!!", "registrations"), "registrations");
    assert.equal(
      registrationsCsvFilename("Halloween Bash", null, "2026-10-21"),
      "halloween-bash-registrations-2026-10-21.csv",
    );
  });

  it("names a location form's CSV after its location too", () => {
    assert.equal(
      registrationsCsvFilename("Halloween Bash", "Brighton | Zap Zone", "2026-10-21"),
      "halloween-bash-brighton-zap-zone-registrations-2026-10-21.csv",
    );
  });

  it("describes the same-contact groups", () => {
    assert.equal(duplicateHint(counts({ duplicateGroups: 1, entriesInDuplicateGroups: 1 })), "1 contact with multiple entries.");
    assert.equal(duplicateHint(counts({ duplicateGroups: 2, entriesInDuplicateGroups: 5 })), "2 contacts with multiple entries.");
  });

  it("labels the history button with the other forms", () => {
    assert.equal(historyButtonLabel(0), "Registration history");
    assert.equal(historyButtonLabel(1), "Registration history (1 other form)");
    assert.equal(historyButtonLabel(3), "Registration history (3 other forms)");
  });

  it("only blames the empty list on no sign-ups when nothing narrows it", () => {
    assert.equal(emptyListMessage("all", ""), "No one has registered yet.");
    assert.equal(emptyListMessage("all", "ann"), "No registrations match.");
    assert.equal(emptyListMessage("hidden", ""), "No registrations match.");
  });
});

describe("listSummary — the page range against the server's totals", () => {
  it("counts contacts across every page, not just this one", () => {
    assert.equal(
      listSummary({ currentPage: 2, lastPage: 3, perPage: 25, total: 60 }, 74, true),
      "Showing 26–50 of 60 contacts · 74 entries",
    );
    assert.equal(
      listSummary({ currentPage: 3, lastPage: 3, perPage: 25, total: 60 }, 74, true),
      "Showing 51–60 of 60 contacts · 74 entries",
    );
    assert.equal(
      listSummary({ currentPage: 1, lastPage: 1, perPage: 25, total: 1 }, 1, true),
      "Showing 1–1 of 1 contact · 1 entry",
    );
  });

  it("drops the form's entry total once a search or filter narrows the list", () => {
    assert.equal(
      listSummary({ currentPage: 1, lastPage: 1, perPage: 25, total: 3 }, 74, false),
      "Showing 1–3 of 3 contacts",
    );
  });

  it("says so when nothing matches", () => {
    assert.equal(
      listSummary({ currentPage: 1, lastPage: 1, perPage: 25, total: 0 }, 12, true),
      "No matching contacts",
    );
  });
});

describe("filterOptions — the list's Show dropdown", () => {
  it("offers last year's edition only when the form links one", () => {
    assert.deepEqual(
      filterOptions(null, 2).map((o) => o.value),
      ["all", "duplicates", "returning", "hidden"],
    );
    const linked = filterOptions("Halloween 2025", 0);
    assert.deepEqual(
      linked.map((o) => o.value),
      ["all", "duplicates", "returning", "previous_edition", "hidden"],
    );
    assert.equal(linked[3].label, "Registered for Halloween 2025");
    assert.equal(linked[4].label, "Hidden (0)");
  });
});

describe("validateRegistrationForm — one location form's own checks", () => {
  it("requires a name and a date on a form that isn't in an event", () => {
    assert.deepEqual(
      validateRegistrationForm({ name: "  ", eventDate: "", grouped: false }),
      { name: "Please give the form a name.", event_date: "Choose the event date." },
    );
    assert.deepEqual(validateRegistrationForm({ name: "Bash", eventDate: "2026-10-31", grouped: false }), {});
  });

  it("never asks for a name on a form that takes it from its event", () => {
    assert.deepEqual(validateRegistrationForm({ name: "", eventDate: "2026-10-31", grouped: true }), {});
  });

  it("shows a 422 on one of several locations under the location list", () => {
    assert.deepEqual(foldLocationErrors({ "location_ids.1": "Choose a location from the list." }), {
      "location_ids.1": "Choose a location from the list.",
      location_ids: "Choose a location from the list.",
    });
    assert.deepEqual(foldLocationErrors({ name: "x" }), { name: "x" });
  });
});

describe("headerImageProblem — the web's PNG/JPEG/WebP, 8 MB rule", () => {
  it("accepts the three image types up to 8 MB", () => {
    assert.equal(headerImageProblem("image/jpeg", 8 * 1024 * 1024), null);
    assert.equal(headerImageProblem("image/png", undefined), null);
    assert.equal(headerImageProblem("image/webp", 10), null);
  });

  it("refuses other types and larger files", () => {
    assert.equal(headerImageProblem("image/heic", 10), "Please choose a PNG, JPEG or WebP image.");
    assert.equal(headerImageProblem(null, 10), "Please choose a PNG, JPEG or WebP image.");
    assert.equal(
      headerImageProblem("image/jpeg", 8 * 1024 * 1024 + 1),
      "That image is larger than 8 MB. Please use a smaller file.",
    );
  });
});

describe("registrationExportTable — the web's CSV columns", () => {
  const row = {
    entryId: 7,
    registeredAt: "2026-10-01T21:06:00Z",
    name: "Ann Lee",
    email: "ann@example.com",
    phone: "8105889748",
    contactId: 3,
    sameContactEntries: 2,
    isDuplicate: true,
    returning: false,
    registeredPreviousEdition: true,
  };

  it("leaves the last-year column out when no edition is linked", () => {
    const table = registrationExportTable([row], "");
    assert.equal(table.headers.length, 9);
    assert.equal(table.headers[8], "Registered before");
    assert.equal(table.rows[0].length, 9);
  });

  it("writes each entry in the web's order, the last-year column named for that edition", () => {
    const table = registrationExportTable([row], "Halloween Bash (2025)");
    assert.equal(table.headers.length, 10);
    assert.equal(table.headers[9], "Registered for Halloween Bash (2025)");
    assert.deepEqual(table.rows[0], [
      7,
      "October 1, 2026 at 5:06 PM ET",
      "Ann Lee",
      "ann@example.com",
      "(810) 588-9748",
      3,
      2,
      "Yes",
      "No",
      "Yes",
    ]);
  });
});

describe("stale flag — the list refetches once after a change elsewhere", () => {
  it("is consumed by the first read", () => {
    consumeRegistrationFormsStale();
    assert.equal(consumeRegistrationFormsStale(), false);
    markRegistrationFormsStale();
    assert.equal(consumeRegistrationFormsStale(), true);
    assert.equal(consumeRegistrationFormsStale(), false);
  });
});
