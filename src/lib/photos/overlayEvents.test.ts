import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PhotoOverlay, PhotoOverlayEvent } from "../../services/photosService";
import {
  copiesSummary,
  dayAfter,
  eventDayRange,
  eventFrameIsOver,
  eventOptionLabel,
  isEventFrame,
  parseAppliesTo,
  scheduleLine,
  shortDay,
  venueName,
} from "./overlayEvents.ts";

const event = (over: Partial<PhotoOverlayEvent> = {}): PhotoOverlayEvent => ({
  id: 5,
  name: "Spooky Night",
  firstDay: "2026-10-30",
  eventDate: "2026-10-31",
  dayCount: 2,
  windowStart: "2026-10-30T06:00:00-04:00",
  windowEnd: "2026-11-01T06:00:00-04:00",
  effectiveStart: "2026-10-30T06:00:00-04:00",
  effectiveEnd: "2026-11-01T06:00:00-04:00",
  locationFormRemoved: false,
  neverRuns: false,
  ...over,
});

const overlay = (over: Partial<PhotoOverlay> = {}): PhotoOverlay => ({
  id: 1,
  locationId: 1,
  packageId: null,
  roomName: null,
  registrationEventId: null,
  event: null,
  name: "Frame",
  imageUrl: null,
  startsAt: null,
  endsAt: null,
  isEnabled: true,
  priority: 0,
  status: "active",
  isActive: false,
  createdByName: null,
  createdAt: null,
  ...over,
});

const fmt = (iso: string) => `<${iso}>`;

describe("days", () => {
  it("writes the short weekday form and a range", () => {
    assert.equal(shortDay("2026-10-30"), "Fri, Oct 30");
    assert.equal(eventDayRange("2026-10-30", "2026-10-31"), "Fri, Oct 30 – Sat, Oct 31");
    assert.equal(eventDayRange("2026-10-31", "2026-10-31"), "Sat, Oct 31");
    assert.equal(eventDayRange(null, null), "");
  });

  it("rolls the day after across months and years", () => {
    assert.equal(dayAfter("2026-10-31"), "2026-11-01");
    assert.equal(dayAfter("2026-12-31"), "2027-01-01");
  });
});

describe("venueName", () => {
  it("shortens a venue record and names a missing one", () => {
    assert.equal(venueName("Brighton | Zap Zone"), "Brighton");
    assert.equal(venueName(null), "another location");
  });
});

describe("copiesSummary", () => {
  it("lists where the frame was and was not added", () => {
    assert.equal(
      copiesSummary({
        created: [{ overlayId: 2, locationName: "Brighton | Zap Zone" }, { overlayId: 3, locationName: "Canton" }],
        skipped: [{ locationName: "Novi", reason: "It already has a photo frame." }],
      }),
      "Also added at Brighton and Canton. Not added at Novi (it already has a photo frame).",
    );
    assert.equal(copiesSummary({ created: [], skipped: [] }), "");
  });
});

describe("eventOptionLabel", () => {
  it("names the form, its days and an existing frame", () => {
    assert.equal(
      eventOptionLabel({
        id: 5,
        name: "Spooky Night",
        eventDate: "2026-10-31",
        firstDay: "2026-10-30",
        dayCount: 2,
        groupId: null,
        windowStart: null,
        windowEnd: null,
        hasFrame: true,
        siblings: [],
      }),
      "Spooky Night · Fri, Oct 30 – Sat, Oct 31 (has a frame)",
    );
  });
});

describe("event frames", () => {
  it("tells an event frame by its event or its form id", () => {
    assert.equal(isEventFrame(overlay()), false);
    assert.equal(isEventFrame(overlay({ registrationEventId: 5 })), true);
    assert.equal(isEventFrame(overlay({ event: event() })), true);
  });

  it("moves a frame to Past events once its window ends or its form is gone", () => {
    const end = Date.parse("2026-11-01T06:00:00-04:00");
    assert.equal(eventFrameIsOver(overlay({ event: event() }), end - 1), false);
    assert.equal(eventFrameIsOver(overlay({ event: event() }), end), true);
    assert.equal(eventFrameIsOver(overlay({ event: event({ locationFormRemoved: true }) }), 0), true);
    assert.equal(eventFrameIsOver(overlay(), Number.MAX_SAFE_INTEGER), false);
  });

  it("falls back to an expired status when no window came back", () => {
    const noWindow = { windowEnd: null, effectiveEnd: null };
    assert.equal(eventFrameIsOver(overlay({ status: "expired", event: event(noWindow) }), 0), true);
    assert.equal(
      eventFrameIsOver(overlay({ status: "expired", event: event({ ...noWindow, neverRuns: true }) }), 0),
      false,
    );
  });
});

describe("scheduleLine", () => {
  it("keeps the everyday wording for a plain frame", () => {
    assert.equal(scheduleLine(overlay(), fmt), "No start date · no end date");
    assert.equal(
      scheduleLine(overlay({ startsAt: "a", endsAt: "b" }), fmt),
      "From <a> · until <b>",
    );
  });

  it("shows an event frame's effective hours", () => {
    assert.equal(
      scheduleLine(overlay({ event: event({ effectiveStart: "s", effectiveEnd: "e" }) }), fmt),
      "From <s> · until <e>",
    );
  });

  it("shows its own hours when they never fall inside the event", () => {
    const never = event({ effectiveStart: null, effectiveEnd: null, neverRuns: true });
    assert.equal(
      scheduleLine(overlay({ event: never, startsAt: "a", endsAt: null }), fmt),
      "Its own hours: from <a> · no end",
    );
    assert.equal(scheduleLine(overlay({ event: never }), fmt), null);
  });
});

describe("parseAppliesTo", () => {
  it("reads a room, an event or all photos", () => {
    assert.deepEqual(parseAppliesTo(""), { roomId: null, eventId: null });
    assert.deepEqual(parseAppliesTo("room:12"), { roomId: 12, eventId: null });
    assert.deepEqual(parseAppliesTo("event:7"), { roomId: null, eventId: 7 });
    assert.deepEqual(parseAppliesTo("event:x"), { roomId: null, eventId: null });
  });
});
