import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBookingQr, parseScannedTicketQr } from "./parseTicketQr.ts";

/** The payloads the two producers actually emit (web `utils/qrcode.ts`). */
const orderQr = (id: number | string) =>
  JSON.stringify({ type: "ticket_order", id });
const ticketQr = (id: number | string) =>
  JSON.stringify({ type: "attraction_purchase", id });

const NO_BOOKING = { referenceNumber: null, bookingId: null };

describe("scanning a ticket-order QR", () => {
  it("reads the order out of the payload the app generates", () => {
    assert.deepEqual(parseScannedTicketQr(orderQr(45)), {
      kind: "order",
      orderId: 45,
    });
  });

  it("tolerates whitespace around the payload", () => {
    assert.deepEqual(parseScannedTicketQr(`  ${orderQr(3)}\n`), {
      kind: "order",
      orderId: 3,
    });
  });

  it("returns null for a bare ORD reference, which carries no id to look up", () => {
    // The order endpoints are keyed by id, so a reference-only code has nothing
    // to resolve against here. The desk reports it rather than guessing — the
    // same branch the web's scanner takes for it.
    assert.equal(parseScannedTicketQr("ORD20260910EDQALA"), null);
  });

  for (const [label, raw] of [
    ["no id at all", JSON.stringify({ type: "ticket_order" })],
    ["a null id", JSON.stringify({ type: "ticket_order", id: null })],
    ["a zero id", JSON.stringify({ type: "ticket_order", id: 0 })],
    ["a negative id", JSON.stringify({ type: "ticket_order", id: -4 })],
    ["a non-numeric id", JSON.stringify({ type: "ticket_order", id: "abc" })],
  ] as const) {
    it(`rejects an order payload with ${label} instead of falling through to a ticket`, () => {
      assert.equal(parseScannedTicketQr(raw), null);
    });
  }

  it("REGRESSION: an order QR is never read as an attraction purchase", () => {
    // The bug: `id` was taken without looking at `type`, so scanning order #45
    // verified attraction purchase #45 — a different customer's ticket.
    assert.notEqual(parseScannedTicketQr(orderQr(45))?.kind, "purchase");
    assert.deepEqual(parseScannedTicketQr(orderQr(45)), {
      kind: "order",
      orderId: 45,
    });
  });
});

describe("scanning a single attraction ticket", () => {
  it("reads the app's own ticket payload", () => {
    assert.deepEqual(parseScannedTicketQr(ticketQr(123)), {
      kind: "purchase",
      purchaseId: 123,
    });
  });

  it("accepts a string id", () => {
    assert.deepEqual(parseScannedTicketQr(ticketQr("9")), {
      kind: "purchase",
      purchaseId: 9,
    });
  });
});

describe("codes the scanner must refuse", () => {
  for (const [label, raw] of [
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["a code with no digits", "NOT-A-TICKET"],
    ["JSON with no id-like field", JSON.stringify({ foo: "bar" })],
    ["an undeclared purchaseId", JSON.stringify({ purchaseId: 9 })],
    ["an undeclared purchase_id", JSON.stringify({ purchase_id: 9 })],
    ["a bare untyped id", JSON.stringify({ id: 9 })],
    ["a ticket payload with a zero id", ticketQr(0)],
  ] as const) {
    it(`returns null for ${label}`, () => {
      assert.equal(parseScannedTicketQr(raw), null);
    });
  }

  it("REGRESSION: never digit-scans a plain string into a ticket id", () => {
    // The bug: `/\d+/` ran over any payload, so a membership token, a photo
    // link or a loyalty card resolved to whichever attraction purchase shared
    // those digits — a stranger's ticket, silently admitted.
    assert.equal(parseScannedTicketQr("TICKET-77-ZAPZONE"), null);
    assert.equal(parseScannedTicketQr("77"), null);
    assert.equal(parseScannedTicketQr(`mbr_${"a".repeat(40)}`), null);
    assert.equal(
      parseScannedTicketQr("https://zapzone.test/photos/qr/abcdef0123456789"),
      null,
    );
  });

  it("refuses another module's code rather than reading its id", () => {
    // An event ticket and a booking each have their own handler at the desk;
    // neither may be resolved against the attraction-purchase table.
    assert.equal(parseScannedTicketQr("EVT-AB12CD34"), null);
    assert.equal(parseScannedTicketQr("BK20260910EDQALA"), null);
    assert.equal(parseScannedTicketQr("WV20260910EDQALA"), null);
  });
});

describe("booking QR parsing", () => {
  it("reads a JSON booking payload", () => {
    assert.deepEqual(
      parseBookingQr(
        JSON.stringify({
          type: "booking",
          id: 4,
          reference_number: "BK20260910EDQALA",
        }),
      ),
      { referenceNumber: "BK20260910EDQALA", bookingId: 4 },
    );
  });

  it("reads a bare booking reference", () => {
    assert.deepEqual(parseBookingQr("BK20260101ABCDEF"), {
      referenceNumber: "BK20260101ABCDEF",
      bookingId: null,
    });
  });

  it("REGRESSION: an attraction ticket is never read as a booking", () => {
    // The bug: any JSON `id` became a booking id, so scanning attraction
    // ticket #45 loaded booking #45 — a different guest — and offered to
    // check them in.
    assert.deepEqual(parseBookingQr(ticketQr(45)), NO_BOOKING);
    assert.deepEqual(parseBookingQr(orderQr(45)), NO_BOOKING);
  });

  it("REGRESSION: an arbitrary string is not a booking reference", () => {
    // The bug: every non-JSON payload was treated as a reference number, so a
    // membership token was looked up as a booking.
    assert.deepEqual(parseBookingQr("hello"), NO_BOOKING);
    assert.deepEqual(parseBookingQr(`mbr_${"a".repeat(40)}`), NO_BOOKING);
    assert.deepEqual(parseBookingQr("EVT-AB12CD34"), NO_BOOKING);
  });
});
