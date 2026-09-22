import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AvailableSlot } from "../../services/bookingsService.ts";
import { onlineStartsLost } from "./onlineSlotsLost.ts";

/** A start the server offered, and the spaces still free for it. */
const slot = (startTime: string, availableRoomIds: number[]): AvailableSlot => ({
  startTime,
  endTime: "",
  roomId: availableRoomIds[0] ?? null,
  roomName: null,
  availableRoomIds,
  remainingTickets: null,
  minParticipants: null,
});

// A 90-minute package starting at 14:00 runs to 15:30.
const ARGS = { startTime: "14:00", roomId: 1, durationMinutes: 90 };

describe("start times a booking takes off the website", () => {
  it("names a start it sits across where its space was the last one free", () => {
    const slots = [slot("14:00", [1]), slot("15:00", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), ["15:00"]);
  });

  it("says nothing when another space is still free for that start", () => {
    // The customer simply gets space 2 — the start never leaves the website.
    const slots = [slot("14:00", [1, 2]), slot("15:00", [1, 2])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), []);
  });

  it("ignores a start the booking never reaches", () => {
    // 15:30 is exactly when it ends, so that start is untouched.
    const slots = [slot("15:30", [1]), slot("16:00", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), []);
  });

  it("counts an earlier start that runs long enough to reach into this one", () => {
    // 13:00 + 90 min = 14:30, which is inside this booking.
    const slots = [slot("13:00", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), ["13:00"]);
  });

  it("never counts the booking's own start", () => {
    const slots = [slot("14:00", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), []);
  });

  it("ignores a start whose last free space is a different one", () => {
    const slots = [slot("15:00", [2])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), []);
  });

  it("ignores a start the server listed with no free space at all", () => {
    // Nothing left to lose there, and rooms[0] would be undefined.
    const slots = [slot("15:00", [])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), []);
  });

  it("lists every affected start, in the order the server gave them", () => {
    const slots = [slot("14:30", [1]), slot("15:00", [1]), slot("15:15", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), [
      "14:30",
      "15:00",
      "15:15",
    ]);
  });

  it("takes nothing away until a time, a space and a duration are all known", () => {
    const slots = [slot("15:00", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots, startTime: null }), []);
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots, roomId: null }), []);
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots, durationMinutes: 0 }), []);
  });

  it("skips a start whose clock cannot be read rather than guessing", () => {
    const slots = [slot("not-a-time", [1]), slot("15:00", [1])];
    assert.deepEqual(onlineStartsLost({ ...ARGS, slots }), ["15:00"]);
  });
});
