import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBookingQr, parseScannedTicketQr } from "./parseTicketQr.ts";

/** The payloads the two producers actually emit (web `utils/qrcode.ts`). */
const orderQr = (id: number | string) =>
  JSON.stringify({ type: "ticket_order", id });
const ticketQr = (id: number | string) =>
  JSON.stringify({ type: "attraction_purchase", id });

describe("scanning a ticket-order QR", () => {
  it("reads the order out of the payload the app generates", () => {
    assert.deepEqual(parseScannedTicketQr(orderQr(45)), {
      kind: "order",
      orderId: 45,
    });
  });

  it("accepts a string id and the order_id / orderId spellings", () => {
    assert.deepEqual(parseScannedTicketQr(orderQr("45")), {
      kind: "order",
      orderId: 45,
    });
    assert.deepEqual(
      parseScannedTicketQr(JSON.stringify({ type: "ticket_order", order_id: 7 })),
      { kind: "order", orderId: 7 },
    );
    assert.deepEqual(
      parseScannedTicketQr(JSON.stringify({ type: "ticket_order", orderId: 8 })),
      { kind: "order", orderId: 8 },
    );
  });

  it("tolerates whitespace around the payload", () => {
    assert.deepEqual(parseScannedTicketQr(`  ${orderQr(3)}\n`), {
      kind: "order",
      orderId: 3,
    });
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

describe("scanning a single attraction ticket (unchanged behaviour)", () => {
  it("reads the app's own ticket payload", () => {
    assert.deepEqual(parseScannedTicketQr(ticketQr(123)), {
      kind: "purchase",
      purchaseId: 123,
    });
  });

  for (const [label, raw] of [
    ["purchaseId", JSON.stringify({ purchaseId: 9 })],
    ["purchase_id", JSON.stringify({ purchase_id: 9 })],
    ["a bare id", JSON.stringify({ id: 9 })],
    ["a string id", JSON.stringify({ id: "9" })],
  ] as const) {
    it(`accepts ${label}`, () => {
      assert.deepEqual(parseScannedTicketQr(raw), {
        kind: "purchase",
        purchaseId: 9,
      });
    });
  }

  it("falls back to the first run of digits in a plain string", () => {
    assert.deepEqual(parseScannedTicketQr("TICKET-77-ZAPZONE"), {
      kind: "purchase",
      purchaseId: 77,
    });
    assert.deepEqual(parseScannedTicketQr("77"), {
      kind: "purchase",
      purchaseId: 77,
    });
  });

  it("prefers purchaseId over a competing id", () => {
    assert.deepEqual(
      parseScannedTicketQr(JSON.stringify({ purchaseId: 5, id: 99 })),
      { kind: "purchase", purchaseId: 5 },
    );
  });

  it("ignores an unrecognized type and still reads the id", () => {
    // Forward compatibility: only `ticket_order` changes the branch taken.
    assert.deepEqual(
      parseScannedTicketQr(JSON.stringify({ type: "event_purchase", id: 12 })),
      { kind: "purchase", purchaseId: 12 },
    );
  });
});

describe("invalid codes (unchanged behaviour)", () => {
  for (const [label, raw] of [
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["a code with no digits", "NOT-A-TICKET"],
    ["JSON with no id-like field", JSON.stringify({ foo: "bar" })],
    ["a zero id", JSON.stringify({ id: 0 })],
  ] as const) {
    it(`returns null for ${label}`, () => {
      assert.equal(parseScannedTicketQr(raw), null);
    });
  }

  it("still digit-scans a ticket payload whose id is unusable", () => {
    // Pre-existing behaviour, asserted so it stays deliberate: an unusable JSON
    // id drops to the plain-string branch, which finds the digits anywhere in
    // the payload. Only the `ticket_order` branch is strict — it must never fall
    // through, because there its `id` belongs to a different table.
    assert.deepEqual(parseScannedTicketQr(JSON.stringify({ id: -3 })), {
      kind: "purchase",
      purchaseId: 3,
    });
    assert.equal(
      parseScannedTicketQr(JSON.stringify({ type: "ticket_order", id: -3 })),
      null,
    );
  });
});

describe("booking QR parsing (untouched)", () => {
  it("reads a JSON booking payload", () => {
    assert.deepEqual(
      parseBookingQr(JSON.stringify({ booking_id: 4, reference_number: "BK-1" })),
      { referenceNumber: "BK-1", bookingId: 4 },
    );
  });

  it("treats a plain string as the reference number", () => {
    assert.deepEqual(parseBookingQr("BK20260101ABC"), {
      referenceNumber: "BK20260101ABC",
      bookingId: null,
    });
  });

  it("is unaffected by the order payload shape", () => {
    // Bookings are scanned on their own screen; an order code simply yields no
    // booking reference rather than a bogus one.
    assert.deepEqual(parseBookingQr(orderQr(45)), {
      referenceNumber: null,
      bookingId: 45,
    });
  });
});
