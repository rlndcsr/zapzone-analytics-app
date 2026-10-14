import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConcernRow } from "../../services/checkoutConcernsService";
import {
  LEAD_FILTER_OPTIONS,
  bookedLabel,
  matchesLeadFilter,
  type LeadFilter,
} from "./leadFilter.ts";

const concern = (o: Partial<ConcernRow>): ConcernRow => ({
  id: 1,
  kind: "abandoned_checkout",
  status: "new",
  name: "Sam Rivera",
  phone: "555-0100",
  email: "sam@example.com",
  message: "",
  entityName: "Birthday Bash",
  preferredDate: "2026-10-20",
  preferredTime: "6:30 PM",
  stepLabel: "Payment",
  locationName: "Brighton",
  handlerName: "",
  createdAt: "2026-10-14T15:00:00Z",
  completedBooking: false,
  ...o,
});

const rows: ConcernRow[] = [
  concern({ id: 1, kind: "abandoned_checkout", completedBooking: true }),
  concern({ id: 2, kind: "abandoned_checkout" }),
  concern({ id: 3, kind: "abandoned_checkout", status: "resolved" }),
  concern({ id: 4, kind: "schedule_help" }),
  concern({ id: 5, kind: "call_to_book", status: "contacted", completedBooking: true }),
  concern({ id: 6, kind: "call_to_book", status: "resolved" }),
];

const ids = (value: LeadFilter | "all") =>
  rows.filter((c) => matchesLeadFilter(c, value)).map((c) => c.id);

describe("matchesLeadFilter", () => {
  it("All leads keeps every row", () => {
    assert.deepEqual(ids("all"), [1, 2, 3, 4, 5, 6]);
  });

  it("Completed booking is any concern whose guest went on to book", () => {
    assert.deepEqual(ids("completed"), [1, 5]);
  });

  it("Did not complete booking is an unbooked abandoned checkout, whatever its status", () => {
    assert.deepEqual(ids("not_completed"), [2, 3]);
  });

  it("Requested help is schedule help or call to book, booked or not", () => {
    assert.deepEqual(ids("requested_help"), [4, 5, 6]);
  });

  it("Needs a follow-up call is anything unresolved the guest has not booked", () => {
    assert.deepEqual(ids("needs_follow_up"), [2, 4]);
  });

  it("combines with the status filter rather than replacing it", () => {
    const resolvedNotBooked = rows
      .filter((c) => matchesLeadFilter(c, "not_completed"))
      .filter((c) => c.status === "resolved")
      .map((c) => c.id);
    assert.deepEqual(resolvedNotBooked, [3]);
  });

  it("only a real true counts as booked", () => {
    const missing = { ...concern({}), completedBooking: undefined } as unknown as ConcernRow;
    assert.equal(matchesLeadFilter(missing, "completed"), false);
    assert.equal(matchesLeadFilter(missing, "not_completed"), true);
  });
});

describe("lead filter wording", () => {
  it("offers the web's options in the web's order", () => {
    assert.deepEqual(
      LEAD_FILTER_OPTIONS.map((o) => o.label),
      [
        "All leads",
        "Completed booking",
        "Did not complete booking",
        "Requested help",
        "Needs a follow-up call",
      ],
    );
  });

  it("labels the Booked? cell the web's way", () => {
    assert.equal(bookedLabel({ completedBooking: true }), "Completed booking");
    assert.equal(bookedLabel({ completedBooking: false }), "Not booked yet");
  });
});
