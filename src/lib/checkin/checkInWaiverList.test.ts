import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CalendarBooking } from "../../services/bookingsService";
import type { Waiver } from "../../services/waiversService";
import {
  deskDayCoverage,
  deskListCoverage,
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

  it("covers nobody on an unsigned waiver, minors or not", () => {
    assert.deepEqual(peopleCovered(waiver({ status: "pending", minorsCount: 2 })), {
      count: null,
      detail: "None until signed",
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

  it("matches email, reference and room, ignoring case and extra spaces", () => {
    assert.equal(matchesDeskBookingSearch(booking, "SONOAXE@gmail"), true);
    assert.equal(matchesDeskBookingSearch(booking, "#BK20260926"), true);
    assert.equal(matchesDeskBookingSearch(booking, "room 2"), true);
    assert.equal(matchesDeskBookingSearch(booking, "  tom \t  witching  "), true);
    assert.equal(matchesDeskBookingSearch(booking, "nobody@x.com"), false);
  });

  it("matches the booking id exactly, with or without a #", () => {
    const byId = (id: number) =>
      ({
        ...booking,
        id,
        guestPhone: null,
        referenceNumber: "BKABCDEF",
      }) as unknown as CalendarBooking;
    assert.equal(matchesDeskBookingSearch(byId(7), "7"), true);
    assert.equal(matchesDeskBookingSearch(byId(7), "#7"), true);
    assert.equal(matchesDeskBookingSearch(byId(7), "#8"), false);
    assert.equal(matchesDeskBookingSearch(byId(1234), " #1234 "), true);
    assert.equal(matchesDeskBookingSearch(byId(1234), "1234"), true);
    assert.equal(matchesDeskBookingSearch(byId(1234), "123"), false);
    assert.equal(matchesDeskBookingSearch(byId(1234), "12345"), false);
    assert.equal(matchesDeskBookingSearch(byId(1234), "tom #1234"), true);
  });

  it("matches the guest and the customer account separately", () => {
    const split = {
      ...booking,
      guestName: "Kim Lee",
      guestEmail: "kim@lee.com",
      guestPhone: null,
      customerName: "Tom Andersen",
      customerEmail: "tom@acct.com",
      customerPhone: "+1 (586) 441-6556",
    } as unknown as CalendarBooking;
    assert.equal(matchesDeskBookingSearch(split, "kim"), true);
    assert.equal(matchesDeskBookingSearch(split, "ANDERSEN   Tom"), true);
    assert.equal(matchesDeskBookingSearch(split, "kim@lee"), true);
    assert.equal(matchesDeskBookingSearch(split, "tom@acct"), true);
    assert.equal(matchesDeskBookingSearch(split, "5864416556"), true);
    assert.equal(matchesDeskBookingSearch(split, "586-441"), true);
    assert.equal(matchesDeskBookingSearch(split, "586-999"), false);
  });

  it("matches everything on a bare #", () => {
    assert.equal(matchesDeskBookingSearch(booking, "#"), true);
    assert.equal(matchesDeskBookingSearch(booking, " ## "), true);
  });

  it("searches the real package name, not the display fallback", () => {
    const noPackage = {
      ...booking,
      packageName: "Booking",
      packageNameRaw: null,
    } as unknown as CalendarBooking;
    assert.equal(matchesDeskBookingSearch(noPackage, "booking"), false);
    assert.equal(matchesDeskBookingSearch(booking, "WITCHING"), true);
  });

  it("never matches the Guest label shown for a booking with no name", () => {
    const nameless = {
      ...booking,
      guestName: null,
      customerName: "Guest",
    } as unknown as CalendarBooking;
    assert.equal(matchesDeskBookingSearch(nameless, "guest"), false);
    assert.equal(matchesDeskBookingSearch(nameless, "witching"), true);
    const realGuest = {
      ...booking,
      guestName: "Guest Smith",
      customerName: "Guest Smith",
    } as unknown as CalendarBooking;
    assert.equal(matchesDeskBookingSearch(realGuest, "guest"), true);
  });

  it("reads a Space Schedule row the same way", () => {
    const row = {
      id: 1234,
      customerName: "Tom Andersen",
      guestName: "Tom Andersen",
      guestEmail: "tom@x.com",
      guestPhone: "(586) 441-6556",
      referenceNumber: "BKABCDEF",
      packageName: "Booking",
      packageNameRaw: "Laser Tag Party",
      roomName: null,
      guestOfHonorName: "Mia",
      locationName: "Canton",
    };
    assert.equal(matchesDeskBookingSearch(row, "andersen tom"), true);
    assert.equal(matchesDeskBookingSearch(row, "laser tag"), true);
    assert.equal(matchesDeskBookingSearch(row, "TOM@X"), true);
    assert.equal(matchesDeskBookingSearch(row, "5864416556"), true);
    assert.equal(matchesDeskBookingSearch(row, "mia canton"), true);
    assert.equal(matchesDeskBookingSearch(row, "#1234"), true);
    assert.equal(matchesDeskBookingSearch(row, "123"), false);
    assert.equal(
      matchesDeskBookingSearch({ ...row, packageNameRaw: null }, "booking"),
      false,
    );
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

describe("desk coverage line", () => {
  const server = { formsSigned: 4, peopleCovered: 6, minorsCovered: 2, peopleCheckedIn: 3 };
  const rows = [
    waiver({ id: 1, minorsCount: 2 }),
    waiver({ id: 2, status: "pending", minorsCount: 1 }),
  ];

  it("takes the whole day's totals from the server, with the unsigned count", () => {
    assert.deepEqual(deskDayCoverage({ waivers: [], total: 3 }, server), {
      participants: 6,
      forms: 4,
      notSigned: 3,
      minors: 2,
      participantsCheckedIn: 3,
    });
  });

  it("has no day totals without the server's coverage or the unsigned count", () => {
    assert.equal(deskDayCoverage({ waivers: [], total: 3 }, null), null);
    assert.equal(deskDayCoverage(null, server), null);
  });

  it("uses the day's totals unless a search narrows the list", () => {
    const day = deskDayCoverage({ waivers: [], total: 3 }, server);
    assert.equal(deskListCoverage(day, "", rows, true).coverage.participants, 6);
    assert.equal(deskListCoverage(day, "", rows, true).partial, false);

    const searched = deskListCoverage(day, "rhian", rows, false);
    assert.equal(searched.coverage.participants, 3);
    assert.equal(searched.coverage.notSigned, 1);
  });

  it("says it counted only the listed rows when the day was cut short", () => {
    assert.equal(deskListCoverage(null, "", rows, true).partial, true);
    assert.equal(deskListCoverage(null, "", rows, false).partial, false);
  });
});
