import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADVANCE_NOTICE_PRESETS,
  BOOKING_WINDOW_PRESETS,
  bookingWindowMonthsLabel,
} from "./bookingWindow.ts";

describe("booking window presets", () => {
  it("offers 1 through 12 months as 30-day multiples", () => {
    assert.equal(BOOKING_WINDOW_PRESETS.length, 12);
    assert.deepEqual(BOOKING_WINDOW_PRESETS[0], { label: "1mo", days: 30 });
    assert.deepEqual(BOOKING_WINDOW_PRESETS[11], { label: "12mo", days: 360 });
  });

  it("labels a whole-month window in months", () => {
    assert.equal(bookingWindowMonthsLabel(90), "3 months");
    assert.equal(bookingWindowMonthsLabel(30), "1 month");
  });

  it("says nothing for a window that is not a whole number of months", () => {
    assert.equal(bookingWindowMonthsLabel(45), "");
    assert.equal(bookingWindowMonthsLabel(0), "");
    assert.equal(bookingWindowMonthsLabel(null), "");
  });
});

describe("advance notice presets", () => {
  it("runs hourly to 12h, then days and weeks", () => {
    assert.deepEqual(ADVANCE_NOTICE_PRESETS[0], { label: "1 h", hours: 1 });
    assert.deepEqual(ADVANCE_NOTICE_PRESETS[11], { label: "12 h", hours: 12 });
    assert.deepEqual(ADVANCE_NOTICE_PRESETS[12], { label: "1 day", hours: 24 });
  });

  it("ends at four weeks", () => {
    const last = ADVANCE_NOTICE_PRESETS[ADVANCE_NOTICE_PRESETS.length - 1];
    assert.deepEqual(last, { label: "4 weeks", hours: 672 });
  });

  it("is strictly increasing, so the row reads in order", () => {
    for (let i = 1; i < ADVANCE_NOTICE_PRESETS.length; i++) {
      assert.ok(
        ADVANCE_NOTICE_PRESETS[i].hours > ADVANCE_NOTICE_PRESETS[i - 1].hours,
        `${ADVANCE_NOTICE_PRESETS[i].label} follows the one before it`,
      );
    }
  });
});
