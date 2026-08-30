import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  packageDurationMinutes,
  validatePackageSetup,
  type PackageSetupInput,
} from "./packageSetup.ts";

/** A bookable package: 2 players minimum, 60 min long, 09:00–17:00. */
const OK: PackageSetupInput = {
  minParticipants: 2,
  maxTicketsPerSlot: 20,
  durationMinutes: 60,
  schedules: [{ start: "09:00", end: "17:00" }],
  bookingWindowDays: 30,
  minBookingNoticeHours: 24,
};

describe("converting a package duration to minutes", () => {
  it("splits the compound unit", () => {
    assert.equal(packageDurationMinutes("hours and minutes", "", "1", "30"), 90);
  });

  it("scales hours and keeps minutes as they are", () => {
    assert.equal(packageDurationMinutes("hours", "2", "", ""), 120);
    assert.equal(packageDurationMinutes("minutes", "45", "", ""), 45);
  });

  it("rounds a fractional duration", () => {
    assert.equal(packageDurationMinutes("hours", "1.5", "", ""), 90);
  });

  it("reads a blank or unparseable duration as zero", () => {
    assert.equal(packageDurationMinutes("hours", "", "", ""), 0);
    assert.equal(packageDurationMinutes("hours", "abc", "", ""), 0);
    assert.equal(packageDurationMinutes("hours and minutes", "", "", ""), 0);
  });
});

describe("guarding a package setup", () => {
  it("passes a bookable package", () => {
    assert.equal(validatePackageSetup(OK), null);
  });

  it("refuses a slot cap below the minimum players", () => {
    const err = validatePackageSetup({
      ...OK,
      minParticipants: 10,
      maxTicketsPerSlot: 8,
    });
    assert.match(err ?? "", /Max tickets per time slot cannot be lower/);
  });

  it("allows a slot cap equal to the minimum players", () => {
    assert.equal(
      validatePackageSetup({ ...OK, minParticipants: 10, maxTicketsPerSlot: 10 }),
      null,
    );
  });

  it("skips the slot-cap rule when either side is unset", () => {
    assert.equal(
      validatePackageSetup({ ...OK, minParticipants: 10, maxTicketsPerSlot: null }),
      null,
    );
    assert.equal(
      validatePackageSetup({ ...OK, minParticipants: null, maxTicketsPerSlot: 1 }),
      null,
    );
  });

  it("refuses a schedule whose start equals its end", () => {
    const err = validatePackageSetup({
      ...OK,
      schedules: [{ start: "09:00", end: "09:00" }],
    });
    assert.match(err ?? "", /^Schedule 1: start and end time cannot be the same/);
  });

  it("refuses a window shorter than the duration", () => {
    const err = validatePackageSetup({
      ...OK,
      durationMinutes: 120,
      schedules: [{ start: "09:00", end: "10:00" }],
    });
    assert.equal(
      err,
      "Schedule 1: the 60 min window is shorter than the 120 min duration, so no time slot could ever be offered.",
    );
  });

  it("allows a window exactly as long as the duration", () => {
    assert.equal(
      validatePackageSetup({
        ...OK,
        durationMinutes: 120,
        schedules: [{ start: "09:00", end: "11:00" }],
      }),
      null,
    );
  });

  it("measures an overnight window forwards", () => {
    assert.equal(
      validatePackageSetup({
        ...OK,
        durationMinutes: 180,
        schedules: [{ start: "20:00", end: "02:00" }],
      }),
      null,
    );
  });

  it("names the offending schedule", () => {
    const err = validatePackageSetup({
      ...OK,
      schedules: [
        { start: "09:00", end: "17:00" },
        { start: "13:00", end: "13:00" },
      ],
    });
    assert.match(err ?? "", /^Schedule 2:/);
  });

  it("skips schedule rules for a row with no times yet", () => {
    assert.equal(
      validatePackageSetup({ ...OK, schedules: [{ start: "", end: "" }] }),
      null,
    );
  });

  it("refuses advance notice that fills the booking window", () => {
    const err = validatePackageSetup({
      ...OK,
      bookingWindowDays: 1,
      minBookingNoticeHours: 24,
    });
    assert.equal(
      err,
      "Advance booking time must be shorter than the booking window (1 days = 24 hours), or no date could ever be booked.",
    );
  });

  it("allows advance notice inside the booking window", () => {
    assert.equal(
      validatePackageSetup({
        ...OK,
        bookingWindowDays: 1,
        minBookingNoticeHours: 23,
      }),
      null,
    );
  });

  it("skips the notice rule when the booking window is unset or zero", () => {
    assert.equal(
      validatePackageSetup({
        ...OK,
        bookingWindowDays: null,
        minBookingNoticeHours: 999,
      }),
      null,
    );
    assert.equal(
      validatePackageSetup({
        ...OK,
        bookingWindowDays: 0,
        minBookingNoticeHours: 999,
      }),
      null,
    );
  });

  it("skips every duration rule for an open-ended package", () => {
    assert.equal(
      validatePackageSetup({
        ...OK,
        durationMinutes: 0,
        schedules: [{ start: "09:00", end: "09:15" }],
      }),
      null,
    );
  });
});
