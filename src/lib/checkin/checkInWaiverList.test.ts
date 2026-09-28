import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CalendarBooking } from "../../services/bookingsService";
import type { Waiver } from "../../services/waiversService";
import {
  deskWaiverState,
  filterDeskWaivers,
  matchesDeskBookingSearch,
  mergeDeskWaivers,
  peopleCovered,
  visitDateLabel,
  waiverLinkLabel,
  waiverSignerName,
  waiverTruncationNote,
} from "./checkInWaiverList.ts";

const waiver = (o: Partial<Waiver>): Waiver =>
  ({
    id: 1,
    referenceNumber: "WV20260925F8H8RI",
    status: "completed",
    selectedDate: "2026-09-28",
    adultFirstName: "Rhian",
    adultLastName: "Baria",
    adultEmail: "rhianbariaaa@gmail.com",
    adultPhone: "251-215-7738",
    templateTitle: "General Activity Waiver & Release of Liability",
    locationName: "Farmington | Escape Room",
    minorsCount: 0,
    minorNames: [],
    bookingId: 9,
    bookingReference: "BK20260925UIDQMZ",
    eventName: null,
    attractionPurchaseId: null,
    submittedAt: "2026-09-26T02:26:00Z",
    checkedInAt: null,
    ...o,
  }) as Waiver;

describe("row labels", () => {
  it("names the signer, or says Signer before anyone signs", () => {
    assert.equal(waiverSignerName(waiver({})), "Rhian Baria");
    assert.equal(
      waiverSignerName(waiver({ adultFirstName: null, adultLastName: null })),
      "Signer",
    );
  });

  it("links to the booking reference first, then booking id, ticket, event", () => {
    assert.equal(waiverLinkLabel(waiver({})), "Booking BK20260925UIDQMZ");
    assert.equal(
      waiverLinkLabel(waiver({ bookingReference: null })),
      "Booking #9",
    );
    assert.equal(
      waiverLinkLabel(
        waiver({
          bookingReference: null,
          bookingId: null,
          attractionPurchaseId: 4,
        }),
      ),
      "Ticket #4",
    );
    assert.equal(
      waiverLinkLabel(
        waiver({
          bookingReference: null,
          bookingId: null,
          eventName: "Glow Night",
        }),
      ),
      "Glow Night",
    );
    assert.equal(
      waiverLinkLabel(waiver({ bookingReference: null, bookingId: null })),
      null,
    );
  });

  it("reads the visit date as the day it names", () => {
    assert.equal(visitDateLabel("2026-09-28"), "September 28, 2026");
    assert.equal(
      visitDateLabel("2026-09-28T00:00:00.000000Z"),
      "September 28, 2026",
    );
    assert.equal(visitDateLabel(null), "—");
  });

  it("counts the adult plus minors", () => {
    assert.deepEqual(peopleCovered(waiver({})), {
      count: 1,
      detail: "(adult)",
    });
    assert.deepEqual(peopleCovered(waiver({ minorsCount: 2 })), {
      count: 3,
      detail: "(adult + 2 minors)",
    });
  });

  it("reads checked in over signed over not signed", () => {
    assert.equal(deskWaiverState(waiver({ checkedInAt: "x" })), "checked-in");
    assert.equal(deskWaiverState(waiver({})), "signed");
    assert.equal(deskWaiverState(waiver({ status: "pending" })), "not-signed");
  });
});

describe("filterDeskWaivers", () => {
  const list = [
    waiver({ id: 1 }),
    waiver({
      id: 2,
      adultFirstName: null,
      adultLastName: null,
      adultEmail: "sonoaxe@gmail.com",
      adultPhone: "(734) 730-4855",
      bookingReference: "BK20260926DYGGJA",
      referenceNumber: "WV20260926F5SKCL",
      locationName: "Canton | Zap Zone",
    }),
  ];

  it("returns everything for a blank term", () => {
    assert.equal(filterDeskWaivers(list, "  ").length, 2);
  });

  it("matches every word across the row", () => {
    assert.deepEqual(
      filterDeskWaivers(list, "rhian farmington").map((w) => w.id),
      [1],
    );
    assert.deepEqual(
      filterDeskWaivers(list, "canton sonoaxe").map((w) => w.id),
      [2],
    );
  });

  it("matches a phone typed as bare digits", () => {
    assert.deepEqual(
      filterDeskWaivers(list, "7347304855").map((w) => w.id),
      [2],
    );
    // "157" spans the dash in 251-215-7738, so only the digit rule finds it.
    assert.deepEqual(
      filterDeskWaivers(list, "157").map((w) => w.id),
      [1],
    );
  });

  it("does not treat one or two digits as a phone", () => {
    // "57" is in 2512157738's digits but not in its text.
    assert.deepEqual(
      filterDeskWaivers(list, "57").map((w) => w.id),
      [],
    );
  });

  it("finds a waiver by a minor it covers", () => {
    const withMinors = [
      ...list,
      waiver({ id: 3, minorsCount: 2, minorNames: ["Ava Baria", "Leo Baria"] }),
    ];
    assert.deepEqual(
      filterDeskWaivers(withMinors, "leo").map((w) => w.id),
      [3],
    );
    assert.deepEqual(
      filterDeskWaivers(withMinors, "ava baria").map((w) => w.id),
      [3],
    );
  });
});

describe("matchesDeskBookingSearch", () => {
  const booking = {
    guestName: "Tom Andersen",
    guestEmail: "sonoaxe@gmail.com",
    guestPhone: "734-730-4855",
    guestOfHonorName: "Mia",
    referenceNumber: "BK20260926DYGGJA",
    customerName: "Tom Andersen",
    customerEmail: "sonoaxe@gmail.com",
    customerPhone: null,
    packageNameRaw: "Witching Hour",
    roomName: "Room 2",
    locationName: "Canton | Zap Zone",
  } as unknown as CalendarBooking;

  it("matches across the row, every word", () => {
    assert.equal(matchesDeskBookingSearch(booking, "tom witching"), true);
    assert.equal(matchesDeskBookingSearch(booking, "mia canton"), true);
    assert.equal(matchesDeskBookingSearch(booking, "tom rage"), false);
  });

  it("matches a phone typed as digits", () => {
    assert.equal(matchesDeskBookingSearch(booking, "7347304855"), true);
    assert.equal(matchesDeskBookingSearch(booking, "(734) 730"), true);
    assert.equal(matchesDeskBookingSearch(booking, "734 999"), false);
    assert.equal(matchesDeskBookingSearch(booking, "7304"), true);
  });

  it("matches everything on a blank term", () => {
    assert.equal(matchesDeskBookingSearch(booking, " "), true);
  });
});

describe("mergeDeskWaivers", () => {
  const unsigned = [waiver({ id: 10, status: "pending" })];
  const signed = [waiver({ id: 20 }), waiver({ id: 21 })];

  it("puts unsigned first and is complete when both pages are whole", () => {
    const day = mergeDeskWaivers(
      { waivers: unsigned, total: 1 },
      { waivers: signed, total: 2 },
    );
    assert.deepEqual(
      day.waivers.map((w) => w.id),
      [10, 20, 21],
    );
    assert.equal(day.total, 3);
    assert.equal(day.truncated, false);
    assert.equal(day.unsignedComplete, true);
  });

  it("flags a capped signed page but keeps every unsigned one", () => {
    const day = mergeDeskWaivers(
      { waivers: unsigned, total: 1 },
      { waivers: signed, total: 220 },
    );
    assert.equal(day.truncated, true);
    assert.equal(day.unsignedComplete, true);
    assert.match(waiverTruncationNote(day), /every unsigned one is included/);
  });

  it("says unsigned are missing when that request failed", () => {
    const day = mergeDeskWaivers(null, { waivers: signed, total: 2 });
    assert.deepEqual(
      day.waivers.map((w) => w.id),
      [20, 21],
    );
    assert.equal(day.truncated, true);
    assert.equal(day.unsignedComplete, false);
    assert.match(
      waiverTruncationNote(day),
      /some unsigned ones are not listed/,
    );
  });
});
