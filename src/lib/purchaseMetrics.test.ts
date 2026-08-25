import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { countTransactions } from "./purchaseMetrics.ts";

const standalone = () => ({ ticketOrderId: null });
const line = (id: number) => ({ ticketOrderId: id });

describe("counting standalone purchases", () => {
  it("counts nothing for an empty set", () => {
    assert.equal(countTransactions([]), 0);
  });

  it("counts one purchase as one transaction", () => {
    assert.equal(countTransactions([standalone()]), 1);
  });

  it("counts three purchases as three transactions", () => {
    assert.equal(
      countTransactions([standalone(), standalone(), standalone()]),
      3,
    );
  });
});

describe("counting bulk ticket orders", () => {
  it("collapses every line of one order into a single transaction", () => {
    assert.equal(countTransactions([line(1), line(1), line(1)]), 1);
  });

  it("keeps separate orders separate", () => {
    const rows = [
      line(1),
      line(1),
      line(1),
      line(2),
      line(2),
      line(2),
      line(2),
    ];
    assert.equal(countTransactions(rows), 2);
  });

  it("never merges different order ids", () => {
    assert.equal(countTransactions([line(10), line(11), line(12)]), 3);
  });

  it("counts a repeated line of the same order only once", () => {
    assert.equal(countTransactions([line(5), line(5), line(5), line(5)]), 1);
  });
});

describe("counting a mixed set", () => {
  it("adds standalone purchases to distinct order count", () => {
    const rows = [
      standalone(),
      standalone(),
      line(1),
      line(1),
      line(1),
      line(2),
      line(2),
    ];
    assert.equal(countTransactions(rows), 4);
  });

  it("does not depend on row order", () => {
    const rows = [
      line(2),
      standalone(),
      line(1),
      line(2),
      standalone(),
      line(1),
    ];
    assert.equal(countTransactions(rows), 4);
  });
});
