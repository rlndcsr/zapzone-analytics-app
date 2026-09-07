import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attractionDurationMinutes,
  bookingDurationMinutes,
  buildCalendarEventDraft,
  EVENT_DURATION_MINUTES,
} from "./calendarEvent.ts";

describe("buildCalendarEventDraft", () => {
  it("builds local wall-clock start/end from separate date + time fields", () => {
    const draft = buildCalendarEventDraft({
      title: "Zap Zone: Test",
      date: "2026-09-07",
      time: "14:00",
      durationMinutes: 90,
    });
    assert.ok(draft);
    assert.equal(draft.startDate.getFullYear(), 2026);
    assert.equal(draft.startDate.getMonth(), 8);
    assert.equal(draft.startDate.getDate(), 7);
    assert.equal(draft.startDate.getHours(), 14);
    assert.equal(draft.startDate.getMinutes(), 0);
    assert.equal(
      draft.endDate.getTime() - draft.startDate.getTime(),
      90 * 60000,
    );
  });

  it("extracts the date part from a full ISO timestamp before parsing", () => {
    const draft = buildCalendarEventDraft({
      title: "Zap Zone: Test",
      date: "2026-09-07T00:00:00.000000Z",
      time: "14:00",
      durationMinutes: 60,
    });
    assert.ok(draft);
    assert.equal(draft.startDate.getDate(), 7);
    assert.equal(draft.startDate.getHours(), 14);
  });

  it("accepts a time with seconds", () => {
    const draft = buildCalendarEventDraft({
      title: "Zap Zone: Test",
      date: "2026-09-07",
      time: "14:30:00",
      durationMinutes: 60,
    });
    assert.ok(draft);
    assert.equal(draft.startDate.getHours(), 14);
    assert.equal(draft.startDate.getMinutes(), 30);
  });

  it("returns null for a missing date", () => {
    assert.equal(
      buildCalendarEventDraft({
        title: "x",
        date: null,
        time: "14:00",
        durationMinutes: 60,
      }),
      null,
    );
  });

  it("returns null for an invalid date", () => {
    assert.equal(
      buildCalendarEventDraft({
        title: "x",
        date: "not-a-date",
        time: "14:00",
        durationMinutes: 60,
      }),
      null,
    );
  });

  it("returns null for a missing time, and does not fall back to midnight", () => {
    const result = buildCalendarEventDraft({
      title: "x",
      date: "2026-09-07",
      time: null,
      durationMinutes: 60,
    });
    assert.equal(result, null);
  });

  it("returns null for an invalid time", () => {
    assert.equal(
      buildCalendarEventDraft({
        title: "x",
        date: "2026-09-07",
        time: "not-a-time",
        durationMinutes: 60,
      }),
      null,
    );
  });

  it("omits location and description when absent", () => {
    const draft = buildCalendarEventDraft({
      title: "x",
      date: "2026-09-07",
      time: "14:00",
      durationMinutes: 60,
      location: null,
      description: "",
    });
    assert.ok(draft);
    assert.equal(draft.location, undefined);
    assert.equal(draft.notes, undefined);
    assert.ok(!JSON.stringify(draft).includes("N/A"));
  });

  it("includes a reference number folded into the description", () => {
    const draft = buildCalendarEventDraft({
      title: "x",
      date: "2026-09-07",
      time: "14:00",
      durationMinutes: 60,
      description: "Booking reference: ZZ-1234",
    });
    assert.ok(draft);
    assert.equal(draft.notes, "Booking reference: ZZ-1234");
  });
});

describe("bookingDurationMinutes", () => {
  it("uses minutes directly", () => {
    assert.equal(bookingDurationMinutes(45, "minutes"), 45);
  });

  it("converts hours to minutes", () => {
    assert.equal(bookingDurationMinutes(2, "hours"), 120);
  });

  it("converts decimal hours-and-minutes to minutes", () => {
    assert.equal(bookingDurationMinutes(1.5, "hours and minutes"), 90);
  });

  it("falls back to 120 when duration is missing", () => {
    assert.equal(bookingDurationMinutes(null, "hours"), 120);
    assert.equal(bookingDurationMinutes(undefined, "hours"), 120);
  });

  it("falls back to 120 when duration is zero or negative", () => {
    assert.equal(bookingDurationMinutes(0, "hours"), 120);
    assert.equal(bookingDurationMinutes(-1, "hours"), 120);
  });

  it("falls back to 120 when duration is NaN", () => {
    assert.equal(bookingDurationMinutes(Number.NaN, "hours"), 120);
  });
});

describe("attractionDurationMinutes", () => {
  it("prefers the real duration when present", () => {
    assert.equal(attractionDurationMinutes(45, "minutes"), 45);
    assert.equal(attractionDurationMinutes(2, "hours"), 120);
  });

  it("falls back to 90 (not the web's unconditional 90) when missing/invalid", () => {
    assert.equal(attractionDurationMinutes(null, "hours"), 90);
    assert.equal(attractionDurationMinutes(0, "hours"), 90);
    assert.equal(attractionDurationMinutes(Number.NaN, "hours"), 90);
  });
});

describe("EVENT_DURATION_MINUTES", () => {
  it("is a fixed two hours, matching the absence of a duration field on events", () => {
    assert.equal(EVENT_DURATION_MINUTES, 120);
  });
});
