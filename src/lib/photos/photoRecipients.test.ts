import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  PhotoRegistrationMatch,
  PhotoWaiverRecipient,
} from "../../services/photosService";
import {
  dayRange,
  joinNames,
  longWeekday,
  receivesSomething,
  receivingCount,
  recipientIds,
  recipientKey,
  shortDate,
  sourceLabel,
  textOnlyRecipients,
} from "./photoRecipients.ts";

const waiver = (over: Partial<PhotoWaiverRecipient> = {}): PhotoWaiverRecipient => ({
  kind: "waiver",
  id: 1,
  name: "Alex Okonkwo",
  emailMasked: "a***@x.com",
  phoneMasked: null,
  hasEmail: true,
  hasPhone: false,
  contactable: true,
  unavailableReason: null,
  photoVideoConsent: true,
  locationName: null,
  signedOn: null,
  ...over,
});

const registration = (over: Partial<PhotoRegistrationMatch> = {}): PhotoRegistrationMatch => ({
  kind: "registration",
  id: 1,
  name: "Sam Lee",
  emailMasked: "s***@x.com",
  phoneMasked: "***-0142",
  hasEmail: true,
  hasPhone: true,
  canEmail: true,
  canText: true,
  contactable: true,
  unavailableReason: null,
  photoVideoConsent: null,
  eventName: "Spooky Night",
  firstDay: "2026-10-23",
  eventDate: "2026-10-23",
  coversPhotoDay: true,
  registeredOn: "2026-10-01",
  ...over,
});

describe("recipientKey", () => {
  it("keeps a waiver and a registration with the same id apart", () => {
    assert.notEqual(recipientKey(waiver({ id: 7 })), recipientKey(registration({ id: 7 })));
  });
});

describe("receivesSomething / receivingCount", () => {
  it("a waiver receives whenever it is contactable", () => {
    assert.equal(receivesSomething(waiver(), false), true);
    assert.equal(receivesSomething(waiver({ contactable: false }), true), false);
  });

  it("a text-only registration receives only with Also text ticked", () => {
    const textOnly = registration({ canEmail: false });
    assert.equal(receivesSomething(textOnly, false), false);
    assert.equal(receivesSomething(textOnly, true), true);
  });

  it("counts only the guests who will get the link", () => {
    const picked = [waiver(), registration({ id: 2, canEmail: false }), registration({ id: 3 })];
    assert.equal(receivingCount(picked, false), 2);
    assert.equal(receivingCount(picked, true), 3);
  });
});

describe("recipientIds", () => {
  it("sends waivers alone without registration fields", () => {
    assert.deepEqual(recipientIds([waiver({ id: 4 })], true), { waiverIds: [4] });
  });

  it("splits waivers from registrations and carries the text choice", () => {
    assert.deepEqual(recipientIds([waiver({ id: 4 }), registration({ id: 9 })], false), {
      waiverIds: [4],
      registrationEntryIds: [9],
      textRegistrants: false,
    });
  });
});

describe("textOnlyRecipients", () => {
  it("lists contactable registrations with a phone but no usable email", () => {
    const picked = [
      registration({ id: 1, canEmail: false }),
      registration({ id: 2 }),
      registration({ id: 3, canEmail: false, contactable: false }),
      waiver(),
    ];
    assert.deepEqual(textOnlyRecipients(picked).map((r) => r.id), [1]);
  });
});

describe("joinNames", () => {
  it("joins with commas and a final and", () => {
    assert.equal(joinNames([]), "");
    assert.equal(joinNames(["A"]), "A");
    assert.equal(joinNames(["A", "B"]), "A and B");
    assert.equal(joinNames(["A", "B", "C"]), "A, B and C");
  });
});

describe("dates", () => {
  it("adds the year only outside the current one", () => {
    assert.equal(shortDate("2026-10-03", 2026), "Oct 3");
    assert.equal(shortDate("2025-10-03", 2026), "Oct 3, 2025");
  });

  it("collapses a one-day range and fills a missing end", () => {
    assert.equal(dayRange("2026-10-23", "2026-10-23", 2026), "Oct 23");
    assert.equal(dayRange("2026-10-23", "2026-10-25", 2026), "Oct 23 – Oct 25");
    assert.equal(dayRange(null, "2026-10-25", 2026), "Oct 25");
    assert.equal(dayRange(null, null, 2026), "");
  });

  it("writes the reference day in full", () => {
    assert.equal(longWeekday("2026-10-23"), "Friday, October 23");
  });
});

describe("sourceLabel", () => {
  it("names the event and says Today when it covers the photo day", () => {
    assert.equal(sourceLabel(registration(), "Today", 2026), "Event registration · Spooky Night · Today");
  });

  it("gives the event's days when it is a nearby day", () => {
    assert.equal(
      sourceLabel(
        registration({ coversPhotoDay: false, firstDay: "2026-10-24", eventDate: "2026-10-25" }),
        "Today",
        2026,
      ),
      "Event registration · Spooky Night · Oct 24 – Oct 25",
    );
  });

  it("labels a waiver with its signing date", () => {
    assert.equal(sourceLabel(waiver(), "Today", 2026), "Waiver");
    assert.equal(sourceLabel(waiver({ signedOn: "2026-10-03" }), "Today", 2026), "Waiver · signed Oct 3");
  });
});
