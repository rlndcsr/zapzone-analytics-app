import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eventSaleDates } from "./eventSaleDates.ts";

const event = (
  dateType: "one_time" | "date_range",
  startDate: string,
  endDate: string | null,
) => ({ dateType, startDate, endDate });

describe("eventSaleDates", () => {
  it("lists every day of a range sent as timestamps, as bare days", () => {
    assert.deepEqual(
      eventSaleDates(
        event(
          "date_range",
          "2026-10-26T04:00:00.000000Z",
          "2026-10-28T04:00:00.000000Z",
        ),
      ),
      ["2026-10-26", "2026-10-27", "2026-10-28"],
    );
  });

  it("does not skip or repeat a day across the clock change", () => {
    assert.deepEqual(
      eventSaleDates(
        event(
          "date_range",
          "2026-10-31T04:00:00.000000Z",
          "2026-11-02T05:00:00.000000Z",
        ),
      ),
      ["2026-10-31", "2026-11-01", "2026-11-02"],
    );
  });

  it("offers a one-time event on its start date only", () => {
    assert.deepEqual(
      eventSaleDates(
        event(
          "one_time",
          "2026-10-26T04:00:00.000000Z",
          "2026-10-30T04:00:00.000000Z",
        ),
      ),
      ["2026-10-26"],
    );
    assert.deepEqual(eventSaleDates(event("one_time", "2026-10-26", null)), [
      "2026-10-26",
    ]);
  });

  it("falls back to the start date when a range has no end", () => {
    assert.deepEqual(eventSaleDates(event("date_range", "2026-10-26", null)), [
      "2026-10-26",
    ]);
  });

  it("is empty without a readable start date, or when the range runs backwards", () => {
    assert.deepEqual(eventSaleDates(event("date_range", "", "2026-10-28")), []);
    assert.deepEqual(
      eventSaleDates(event("date_range", "2026-10-28", "2026-10-26")),
      [],
    );
  });

  it("stops at the limit", () => {
    const dates = eventSaleDates(
      event("date_range", "2026-01-01", "2026-12-31"),
      60,
    );
    assert.equal(dates.length, 60);
    assert.equal(dates[0], "2026-01-01");
    assert.equal(dates[59], "2026-03-01");
  });
});
