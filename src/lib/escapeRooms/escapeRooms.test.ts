import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateCorrection,
  evaluateFinishTime,
  shiftDateKey,
  slotBadge,
  slotHasActivity,
  splitMinutesInput,
  timeUsedExample,
} from "./escapeRooms.ts";

const slot = (over: Partial<Parameters<typeof slotBadge>[0]> = {}) => ({
  bookings: [] as unknown[],
  signed: 0,
  photos: 0,
  completed: false,
  isPast: false,
  status: "waiting" as const,
  completionLabel: "",
  notDelivered: 0,
  ...over,
});

describe("day-board badge", () => {
  it("calls an upcoming time with no booking Open", () => {
    assert.equal(slotBadge(slot()).text, "Open");
  });

  it("flags a played game that was never sent", () => {
    const badge = slotBadge(slot({ isPast: true, signed: 3, status: "signing" }));
    assert.equal(badge.text, "Not sent yet");
    assert.equal(badge.tone, "red");
    assert.equal(badge.pastUnsent, true);
  });

  it("fades a past time nobody played, naming whether it was booked", () => {
    assert.equal(slotBadge(slot({ isPast: true })).text, "No players");
    const booked = slotBadge(slot({ isPast: true, bookings: [{}] }));
    assert.equal(booked.text, "Nobody signed");
    assert.equal(booked.faded, true);
  });

  it("adds the finish time and undelivered count to a sent game", () => {
    assert.equal(
      slotBadge(slot({ completed: true, isPast: true, status: "send_problem", completionLabel: "47:12", notDelivered: 2 })).text,
      "Sent · 47:12 · 2 not delivered",
    );
  });

  it("counts any booking, signer, photo or result as activity", () => {
    assert.equal(slotHasActivity(slot()), false);
    assert.equal(slotHasActivity(slot({ signed: 1 })), true);
    assert.equal(slotHasActivity(slot({ completed: true })), true);
  });
});

describe("finish time", () => {
  const base = { minutes: "", seconds: "", escaped: true, mode: "used" as const, roomMinutes: 60 };

  it("is not valid until a time is typed when they escaped", () => {
    const t = evaluateFinishTime(base);
    assert.equal(t.entered, false);
    assert.equal(t.valid, false);
  });

  it("needs no time when they did not escape", () => {
    assert.equal(evaluateFinishTime({ ...base, escaped: false }).valid, true);
  });

  it("formats the time used", () => {
    const t = evaluateFinishTime({ ...base, minutes: "47", seconds: "5" });
    assert.equal(t.valid, true);
    assert.equal(t.label, "47:05");
  });

  it("converts time left on the clock using the room length", () => {
    const t = evaluateFinishTime({ ...base, mode: "left", minutes: "12", seconds: "48" });
    assert.equal(t.label, "47:12");
    assert.equal(t.valid, true);
  });

  it("rejects a time left longer than the room", () => {
    const t = evaluateFinishTime({ ...base, mode: "left", minutes: "61" });
    assert.equal(t.typedValid, true);
    assert.equal(t.valid, false);
  });

  it("accepts 0:00 left, meaning they used the whole room", () => {
    const t = evaluateFinishTime({ ...base, mode: "left", minutes: "0", seconds: "0" });
    assert.equal(t.valid, true);
    assert.equal(t.label, "60:00");
  });

  it("rejects seconds over 59", () => {
    assert.equal(evaluateFinishTime({ ...base, minutes: "10", seconds: "75" }).valid, false);
  });

  it("warns when a time is longer than the room or suspiciously fast", () => {
    assert.equal(evaluateFinishTime({ ...base, minutes: "65" }).longerThanRoom, true);
    assert.equal(evaluateFinishTime({ ...base, minutes: "10" }).veryFast, true);
    assert.equal(evaluateFinishTime({ ...base, minutes: "40" }).veryFast, false);
  });

  it("falls back to time used when the room length is unknown", () => {
    const t = evaluateFinishTime({ ...base, roomMinutes: null, mode: "left", minutes: "12" });
    assert.equal(t.countingDown, false);
    assert.equal(t.label, "12:00");
  });
});

describe("typing helpers", () => {
  it("splits a pasted m:ss across both boxes", () => {
    assert.deepEqual(splitMinutesInput("47:12"), { minutes: "47", seconds: "12" });
    assert.deepEqual(splitMinutesInput("4a7"), { minutes: "47", seconds: null });
  });

  it("validates a correction and builds its label", () => {
    assert.deepEqual(evaluateCorrection(true, "45", "3"), { valid: true, label: "45:03" });
    assert.equal(evaluateCorrection(true, "", "").valid, false);
    assert.equal(evaluateCorrection(false, "", "").valid, true);
  });

  it("gives the time-used example only for rooms longer than 12:48", () => {
    assert.equal(timeUsedExample(60), "47:12");
    assert.equal(timeUsedExample(10), null);
  });
});

describe("shiftDateKey", () => {
  it("crosses month and year ends", () => {
    assert.equal(shiftDateKey("2026-09-30", 1), "2026-10-01");
    assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
  });

  it("is unaffected by the DST change", () => {
    assert.equal(shiftDateKey("2026-11-01", 1), "2026-11-02");
  });
});
