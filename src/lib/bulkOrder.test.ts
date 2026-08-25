import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bulkOrderNotice } from "./bulkOrder.ts";

describe("a standalone purchase", () => {
  it("shows no notice when it belongs to no order", () => {
    assert.equal(bulkOrderNotice(null, null), null);
    assert.equal(bulkOrderNotice(undefined, undefined), null);
  });

  it("shows no notice even if a stray line position came back", () => {
    assert.equal(bulkOrderNotice(null, 2), null);
  });
});

describe("a bulk-order purchase", () => {
  it("announces that it is part of a bulk order", () => {
    assert.equal(bulkOrderNotice(4, 1)?.title, "Part of bulk order");
  });

  it("names the line the API reported", () => {
    assert.equal(bulkOrderNotice(4, 1)?.lineSuffix, " — line 1");
    assert.equal(bulkOrderNotice(4, 3)?.lineSuffix, " — line 3");
  });

  it("omits the line when the API gave none, without leaving a dangling dash", () => {
    assert.equal(bulkOrderNotice(4, null)?.lineSuffix, "");
  });

  it("still shows the notice when only the line is missing", () => {
    assert.notEqual(bulkOrderNotice(4, null), null);
  });
});

describe("where View order goes", () => {
  it("opens Bulk Order Details with the order id", () => {
    assert.deepEqual(bulkOrderNotice(4, 1)?.route, {
      pathname: "/attractions/order-details",
      params: { id: "4" },
    });
  });

  it("uses the order id, never the purchase id", () => {
    // Purchase #843 is line 1 of order #4 — the route must carry 4.
    const purchaseId = 843;
    const notice = bulkOrderNotice(4, 1);
    assert.equal(notice?.route.params.id, "4");
    assert.notEqual(notice?.route.params.id, String(purchaseId));
  });

  it("sends purchases of different orders to their own order", () => {
    assert.equal(bulkOrderNotice(4, 1)?.route.params.id, "4");
    assert.equal(bulkOrderNotice(9, 2)?.route.params.id, "9");
  });
});

describe("an unusable order id", () => {
  it("shows no notice, so nothing can navigate to an invalid route", () => {
    assert.equal(bulkOrderNotice(0, 1), null);
    assert.equal(bulkOrderNotice(-3, 1), null);
    assert.equal(bulkOrderNotice(Number.NaN, 1), null);
  });
});
