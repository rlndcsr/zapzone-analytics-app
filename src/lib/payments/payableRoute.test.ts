import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { payableRoute } from "./payableRoute.ts";

describe("opening a bulk-order payment", () => {
  it("routes a ticket_order payment to Bulk Order Details", () => {
    assert.deepEqual(payableRoute("ticket_order", 101), {
      pathname: "/attractions/order-details",
      params: { id: "101" },
    });
  });

  it("passes the payable id, never the payment id", () => {
    const route = payableRoute("ticket_order", 55);
    assert.equal(route?.params.id, "55");
  });
});

describe("opening a standalone purchase payment", () => {
  it("routes an attraction purchase to its own details screen", () => {
    assert.deepEqual(payableRoute("attraction_purchase", 7), {
      pathname: "/attractions/purchase-details",
      params: { id: "7" },
    });
  });

  it("routes an event purchase to its own details screen", () => {
    assert.deepEqual(payableRoute("event_purchase", 9), {
      pathname: "/events/purchase-details",
      params: { id: "9" },
    });
  });

  it("routes a booking to the bookings list, which opens its sheet", () => {
    assert.deepEqual(payableRoute("booking", 12), {
      pathname: "/bookings/bookings",
      params: { openId: "12" },
    });
  });

  it("never sends a purchase payment to Bulk Order Details", () => {
    for (const type of ["attraction_purchase", "event_purchase", "booking"]) {
      assert.notEqual(
        payableRoute(type, 3)?.pathname,
        "/attractions/order-details",
      );
    }
  });
});

describe("payments with nothing safe to open", () => {
  it("returns null for a missing id", () => {
    assert.equal(payableRoute("ticket_order", null), null);
    assert.equal(payableRoute("ticket_order", undefined), null);
  });

  it("returns null for a non-positive or non-finite id", () => {
    assert.equal(payableRoute("ticket_order", 0), null);
    assert.equal(payableRoute("ticket_order", -1), null);
    assert.equal(payableRoute("ticket_order", Number.NaN), null);
  });

  it("returns null for an unknown or missing payable type", () => {
    assert.equal(payableRoute("membership", 4), null);
    assert.equal(payableRoute(null, 4), null);
    assert.equal(payableRoute(undefined, 4), null);
  });
});

describe("a mixed payments list", () => {
  it("routes each row by its own payable", () => {
    const rows = [
      { payableType: "attraction_purchase", payableId: 1 },
      { payableType: "ticket_order", payableId: 100 },
      { payableType: "event_purchase", payableId: 2 },
      { payableType: "ticket_order", payableId: 101 },
    ];

    assert.deepEqual(
      rows.map((r) => payableRoute(r.payableType, r.payableId)?.pathname),
      [
        "/attractions/purchase-details",
        "/attractions/order-details",
        "/events/purchase-details",
        "/attractions/order-details",
      ],
    );
  });

  it("keeps two different orders pointing at different ids", () => {
    assert.notEqual(
      payableRoute("ticket_order", 100)?.params.id,
      payableRoute("ticket_order", 101)?.params.id,
    );
  });
});
