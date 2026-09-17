import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBookingParams,
  clockToMinutes,
  minutesToClock,
  readBookingPrefill,
  resolveClickedSlot,
} from "./bookingPrefill.ts";

describe("minutesToClock / clockToMinutes", () => {
  it("round-trips a minute through the HH:MM clock format", () => {
    assert.equal(minutesToClock(630), "10:30");
    assert.equal(minutesToClock(0), "00:00");
    assert.equal(clockToMinutes("10:30"), 630);
    assert.equal(clockToMinutes("00:00"), 0);
  });

  it("wraps a minute past midnight into the next day's clock", () => {
    assert.equal(minutesToClock(1440 + 30), "00:30");
  });

  it("rejects malformed or out-of-range clocks", () => {
    assert.equal(clockToMinutes(null), null);
    assert.equal(clockToMinutes(""), null);
    assert.equal(clockToMinutes("not-a-time"), null);
  });
});

describe("buildBookingParams / readBookingPrefill round trip", () => {
  it("carries location, date, time, and room through unchanged", () => {
    const params = buildBookingParams({
      locationId: 4,
      date: "2026-09-20",
      minute: 18 * 60 + 30,
      roomId: 12,
    });
    const prefill = readBookingPrefill(params);
    assert.equal(prefill.locationId, 4);
    assert.equal(prefill.date, "2026-09-20");
    assert.equal(prefill.time, "18:30");
    assert.equal(prefill.roomId, 12);
    assert.equal(prefill.packageId, null);
    assert.deepEqual(prefill.packageIds, []);
    assert.equal(prefill.hasAny, true);
  });

  it("auto-selects a single valid package via packageId", () => {
    const params = buildBookingParams({
      date: "2026-09-20",
      minute: 600,
      packageId: 9,
    });
    const prefill = readBookingPrefill(params);
    assert.equal(prefill.packageId, 9);
    assert.deepEqual(prefill.packageIds, []);
  });

  it("narrows to multiple candidates via packageIds, omitting packageId", () => {
    const params = buildBookingParams({
      date: "2026-09-20",
      minute: 600,
      packageId: null,
      packageIds: [3, 7, 11],
    });
    assert.equal(params.package_id, undefined);
    const prefill = readBookingPrefill(params);
    assert.equal(prefill.packageId, null);
    assert.deepEqual(prefill.packageIds, [3, 7, 11]);
  });

  it("omits package_ids entirely for zero candidates (nothing to narrow)", () => {
    assert.equal(
      buildBookingParams({ date: "2026-09-20", minute: 600, packageIds: [] })
        .package_ids,
      undefined,
    );
  });

  it("carries a single candidate through package_ids too, not just package_id", () => {
    // an off-grid click can leave the lone candidate out of packageId, so
    // packageIds must still carry it or the package is lost entirely
    assert.equal(
      buildBookingParams({ date: "2026-09-20", minute: 600, packageIds: [5] })
        .package_ids,
      "5",
    );
  });

  it("reports hasAny=false when nothing was carried over", () => {
    const prefill = readBookingPrefill({});
    assert.equal(prefill.hasAny, false);
    assert.equal(prefill.date, null);
  });

  it("takes the first value of a repeated param (expo-router array form)", () => {
    const prefill = readBookingPrefill({ room_id: ["12", "99"] });
    assert.equal(prefill.roomId, 12);
  });

  it("rejects a non-date-shaped date param rather than passing it through", () => {
    const prefill = readBookingPrefill({ date: "not-a-date" });
    assert.equal(prefill.date, null);
  });

  it("carries the free-until gap and the walk-in flag through unchanged", () => {
    const params = buildBookingParams({
      date: "2026-09-20",
      minute: 18 * 60,
      freeUntilMinute: 19 * 60 + 30,
      walkIn: true,
    });
    const prefill = readBookingPrefill(params);
    assert.equal(prefill.freeUntilMinutes, 19 * 60 + 30);
    assert.equal(prefill.freeUntilKnown, true);
    assert.equal(prefill.walkIn, true);
  });

  it("reports the gap as unknown, not zero, when none was carried", () => {
    const prefill = readBookingPrefill(
      buildBookingParams({ date: "2026-09-20", minute: 600 }),
    );
    assert.equal(prefill.freeUntilMinutes, null);
    assert.equal(prefill.freeUntilKnown, false);
    assert.equal(prefill.walkIn, false);
  });

  it("carries the click as an unwrapped absolute minute past midnight", () => {
    const params = buildBookingParams({
      date: "2026-09-20",
      minute: 25 * 60 + 30,
    });
    assert.equal(params.time, "01:30");
    const prefill = readBookingPrefill(params);
    assert.equal(prefill.time, "01:30");
    assert.equal(prefill.startMinutes, 25 * 60 + 30);
  });

  it("falls back to the wrapped minute when start_minutes is missing", () => {
    const prefill = readBookingPrefill({ time: "01:30" });
    assert.equal(prefill.startMinutes, 90);
  });
});

describe("resolving the space a click carries into the booking form", () => {
  const slots = [
    { startTime: "16:00", roomId: 1 },
    { startTime: "16:00", roomId: 2 },
    { startTime: "17:00", roomId: 2 },
  ];

  it("keeps the clicked space when it is still offered at that time", () => {
    const { slot, roomChanged } = resolveClickedSlot(slots, "16:00", 2);
    assert.deepEqual(slot, { startTime: "16:00", roomId: 2 });
    assert.equal(roomChanged, false);
  });

  it("falls back to another offered space and flags the change when the clicked one is taken", () => {
    // room 1 has nothing offered at 17:00 — only room 2 does
    const { slot, roomChanged } = resolveClickedSlot(slots, "17:00", 1);
    assert.deepEqual(slot, { startTime: "17:00", roomId: 2 });
    assert.equal(roomChanged, true);
  });

  it("never flags a change when no particular space was clicked", () => {
    const { slot, roomChanged } = resolveClickedSlot(slots, "16:00", null);
    assert.deepEqual(slot, { startTime: "16:00", roomId: 1 });
    assert.equal(roomChanged, false);
  });

  it("gives nothing back once the offered time itself is gone", () => {
    const { slot, roomChanged } = resolveClickedSlot(slots, "18:00", 1);
    assert.equal(slot, null);
    assert.equal(roomChanged, false);
  });
});
