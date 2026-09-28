import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bookingStatusLabel,
  buildBreakdown,
  countBreakdown,
  percentageOf,
  rescaleBreakdown,
} from "./breakdowns.ts";

describe("percentageOf", () => {
  it("rounds, and is 0 over an empty total", () => {
    assert.equal(percentageOf(1, 3), 33);
    assert.equal(percentageOf(2, 3), 67);
    assert.equal(percentageOf(5, 0), 0);
  });
});

describe("buildBreakdown", () => {
  it("drops zero rows but percents over the whole total", () => {
    assert.deepEqual(
      buildBreakdown([
        { label: "Package bookings", count: 75 },
        { label: "Attraction tickets", count: 25 },
        { label: "Event tickets", count: 0 },
      ]),
      [
        { label: "Package bookings", count: 75, percentage: 75 },
        { label: "Attraction tickets", count: 25, percentage: 25 },
      ],
    );
  });
});

describe("rescaleBreakdown", () => {
  const statusRows = [
    { label: "Pending", status: "pending", count: 5, percentage: 50 },
    { label: "Confirmed", status: "confirmed", count: 2, percentage: 20 },
    { label: "Checked-in", status: "checked-in", count: 1, percentage: 10 },
    { label: "Completed", status: "completed", count: 2, percentage: 20 },
  ];

  it("keys off the status slug and re-percents without the rest", () => {
    assert.deepEqual(
      rescaleBreakdown(statusRows, ["confirmed", "checked-in", "completed"]),
      [
        { label: "Confirmed", count: 2, percentage: 40 },
        { label: "Checked-in", count: 1, percentage: 20 },
        { label: "Completed", count: 2, percentage: 40 },
      ],
    );
  });

  it("falls back to the label when a row has no slug", () => {
    const rows = [{ label: "Confirmed", count: 3, percentage: 100 }];
    assert.deepEqual(rescaleBreakdown(rows, ["confirmed"]), [
      { label: "Confirmed", count: 3, percentage: 100 },
    ]);
  });

  it("is empty for a missing list", () => {
    assert.deepEqual(rescaleBreakdown(undefined, ["confirmed"]), []);
  });
});

describe("countBreakdown", () => {
  it("counts in first-seen order", () => {
    assert.deepEqual(
      countBreakdown(["b", "a", "b", "b"], (x) => x),
      [
        { label: "b", count: 3, percentage: 75 },
        { label: "a", count: 1, percentage: 25 },
      ],
    );
  });
});

describe("bookingStatusLabel", () => {
  it("capitalises the first letter and treats blank as pending", () => {
    assert.equal(bookingStatusLabel("checked-in"), "Checked-in");
    assert.equal(bookingStatusLabel("CONFIRMED"), "Confirmed");
    assert.equal(bookingStatusLabel(""), "Pending");
    assert.equal(bookingStatusLabel(null), "Pending");
  });
});
