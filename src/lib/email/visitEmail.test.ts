import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminLocationField,
  canDuplicateNotification,
  canCreateVisitEmail,
  defaultVisitPayloadFields,
  isVisitTrigger,
  lockedToggleMessage,
  planBulkToggle,
  promoOptionLabel,
  promoProblems,
  promoScopeLine,
  readOnlyVisitEmailMessage,
  triggerForEntity,
  triggerGroupsFor,
  visitFollowupTiming,
  VISIT_COMPLETED_TIMING_NOTE,
  visitPayloadFields,
  type SharedPromo,
} from "./visitEmail.ts";

const triggersOf = (entity: string) =>
  triggerGroupsFor(entity).flatMap((g) => g.options.map((o) => o.value));

describe("trigger choices", () => {
  it("retires the never-sent completed / follow-up triggers", () => {
    for (const retired of ["booking_completed", "booking_followup", "purchase_completed", "purchase_followup"]) {
      assert.equal(triggersOf("all").includes(retired), false, retired);
    }
  });

  it("adds the visit triggers where they apply", () => {
    assert.equal(triggersOf("all").includes("visit_completed"), true);
    assert.equal(triggersOf("package").includes("visit_followup"), true);
    assert.equal(triggersOf("attraction").includes("visit_completed"), false);
    assert.deepEqual(triggersOf("event"), ["visit_completed", "visit_followup"]);
  });

  it("keeps a still-allowed trigger when Apply To changes, else picks the first", () => {
    assert.equal(triggerForEntity("package", "visit_followup"), "visit_followup");
    assert.equal(triggerForEntity("event", "booking_created"), "visit_completed");
    assert.equal(triggerForEntity("attraction", "visit_completed"), "purchase_created");
  });

  it("recognises visit triggers", () => {
    assert.equal(isVisitTrigger("visit_completed"), true);
    assert.equal(isVisitTrigger("booking_followup"), false);
    assert.equal(isVisitTrigger(null), false);
  });
});

describe("duplicating built-in emails", () => {
  it("duplicates any custom email", () => {
    assert.equal(canDuplicateNotification(false, "booking_created"), true);
    assert.equal(canDuplicateNotification(false, "visit_followup"), true);
  });

  it("duplicates the two built-in follow-ups", () => {
    assert.equal(canDuplicateNotification(true, "visit_completed"), true);
    assert.equal(canDuplicateNotification(true, "visit_followup"), true);
  });

  it("hides Duplicate on every other built-in email", () => {
    assert.equal(canDuplicateNotification(true, "booking_confirmed"), false);
    assert.equal(canDuplicateNotification(true, "end_of_day_sales_report"), false);
    assert.equal(canDuplicateNotification(true, null), false);
  });
});

describe("who may set up and change follow-up emails", () => {
  it("lets managers and company admins create them", () => {
    assert.equal(canCreateVisitEmail("company_admin"), true);
    assert.equal(canCreateVisitEmail("location_manager"), true);
    assert.equal(canCreateVisitEmail("attendant"), false);
    assert.equal(canCreateVisitEmail(null), false);
  });

  it("explains the read-only view by scope", () => {
    assert.match(readOnlyVisitEmailMessage(null), /every location, so only a company admin can change it/);
    assert.equal(
      readOnlyVisitEmailMessage(4),
      "Only a manager of this location or a company admin can change this follow-up email.",
    );
    assert.match(lockedToggleMessage(undefined), /only a company admin can switch it on or off/);
  });

  it("skips locked emails in a bulk activate", () => {
    const rows = [
      { id: 1, isActive: false, canEdit: true },
      { id: 2, isActive: false, canEdit: false },
      { id: 3, isActive: true, canEdit: false },
    ];
    assert.deepEqual(planBulkToggle(rows, new Set([1, 2, 3]), true), { targets: [1], locked: 1 });
    assert.deepEqual(planBulkToggle(rows, new Set([2]), true), { targets: [], locked: 1 });
    assert.deepEqual(planBulkToggle(rows, new Set([3]), true), { targets: [], locked: 0 });
  });
});

describe("visit email payload", () => {
  const base = {
    triggerType: "visit_completed",
    entityType: "all",
    promoId: 9,
    fromName: "  Escape Room Zone ",
    reviewUrl: " ",
    activityFilter: "escape_room" as const,
  };

  it("always sends visit emails to the guest, with the sender and promo", () => {
    assert.deepEqual(visitPayloadFields(base), {
      recipient_types: ["customer"],
      custom_emails: [],
      include_qr_code: false,
      from_name: "Escape Room Zone",
      review_url: null,
      activity_filter: "escape_room",
      promo_id: 9,
    });
  });

  it("drops the promo for the review request and the activity for events", () => {
    const fields = visitPayloadFields({ ...base, triggerType: "visit_followup", entityType: "event" });
    assert.equal(fields.promo_id, null);
    assert.equal(fields.activity_filter, null);
  });

  it("clears the visit-only settings on other triggers", () => {
    assert.deepEqual(visitPayloadFields({ ...base, triggerType: "booking_created" }), {
      from_name: null,
      review_url: null,
      activity_filter: null,
      promo_id: null,
    });
  });

  it("leaves a default email's activity alone", () => {
    const fields = defaultVisitPayloadFields(base);
    assert.equal(fields.promo_id, 9);
    assert.equal("activity_filter" in fields, false);
    assert.deepEqual(defaultVisitPayloadFields({ ...base, triggerType: "booking_created" }), {});
  });

  it("saves a company admin's All Locations choice explicitly", () => {
    assert.deepEqual(adminLocationField("company_admin", null), { location_id: null });
    assert.deepEqual(adminLocationField("company_admin", undefined), { location_id: null });
  });

  it("keeps a location-scoped email on its location", () => {
    assert.deepEqual(adminLocationField("company_admin", 4), { location_id: 4 });
    // a manager's scope is decided by the server, as on the web
    assert.deepEqual(adminLocationField("location_manager", 4), {});
    assert.deepEqual(adminLocationField("location_manager", null), {});
  });

  it("explains how old, future and earlier-day visits are emailed", () => {
    assert.equal(
      VISIT_COMPLETED_TIMING_NOTE,
      "Party bookings and event purchases more than 3 days old, or still in the future, are marked Completed without an email. Staff can still send it with Send now on the booking or purchase. Escape-room games from an earlier day are emailed when staff complete them on the game screen, which asks first.",
    );
  });

  it("words the review request timing", () => {
    assert.equal(
      visitFollowupTiming(24),
      "24 hours after staff mark the visit complete, never between 8 PM and 9 AM",
    );
  });
});

describe("return-visit promo picker", () => {
  const promo = (over: Partial<SharedPromo> = {}): SharedPromo => ({
    id: 1,
    code: "COMEBACK",
    name: "Come back",
    type: "percentage",
    value: 10,
    status: "active",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    usageLimitTotal: null,
    currentUsage: 0,
    locationIds: [],
    itemLimited: false,
    ...over,
  });
  const locations = [{ id: 1, name: "Canton" }, { id: 2, name: "Brighton" }];
  const today = "2026-10-01";

  it("labels each code", () => {
    assert.equal(promoOptionLabel(promo()), "COMEBACK · 10% off · ends Dec 31, 2026");
    assert.equal(
      promoOptionLabel(promo({ type: "fixed", value: 7.5, status: "inactive", endDate: null })),
      "COMEBACK · $7.50 off · inactive",
    );
  });

  it("has no problems for a live, unrestricted code", () => {
    assert.deepEqual(promoProblems(promo(), 1, locations, today), []);
  });

  it("explains every reason the email leaves a code out", () => {
    const problems = promoProblems(
      promo({ status: "inactive", startDate: "2026-11-01", endDate: "2026-09-01", usageLimitTotal: 5, currentUsage: 5, locationIds: [2] }),
      1,
      locations,
      today,
    );
    assert.deepEqual(problems, [
      "This code is inactive, so the email leaves it out until it is active again.",
      "This code starts on Nov 1, 2026. Emails sent before then leave it out.",
      "This code expired on Sep 1, 2026, so the email leaves it out.",
      "This code has been used the maximum number of times, so the email leaves it out.",
      "This code does not work at Canton, so the email leaves it out there.",
    ]);
  });

  it("says where the code works", () => {
    assert.equal(promoScopeLine(promo(), locations), "Valid until Dec 31, 2026. Works at every location.");
    assert.equal(
      promoScopeLine(promo({ endDate: null, locationIds: [2] }), locations),
      "No end date. Works only at Brighton.",
    );
  });
});
