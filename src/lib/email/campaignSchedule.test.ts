import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SCHEDULE_LIMIT_MS,
  SCHEDULE_PAST_MESSAGE,
  SCHEDULE_TOO_FAR_MESSAGE,
  campaignDisplayStatus,
  campaignTiming,
  canScheduleCampaign,
  formatClock,
  formatScheduleTime,
  isScheduledCampaign,
  resolveSchedule,
  scheduleMoment,
} from "./campaignSchedule.ts";

const NOW = new Date(2026, 9, 29, 12, 0).getTime(); // Oct 29 2026, 12:00 local

const later = (over: Partial<Parameters<typeof resolveSchedule>[0]> = {}) =>
  resolveSchedule({
    sendLater: true,
    recipientTypes: ["customers"],
    date: "2026-11-03",
    time: "14:30",
    now: NOW,
    ...over,
  });

describe("scheduleMoment", () => {
  it("reads a day and a 24-hour time on the device's clock", () => {
    const at = scheduleMoment("2026-11-03", "14:30");
    assert.ok(at);
    assert.deepEqual(
      [at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()],
      [2026, 10, 3, 14, 30],
    );
  });

  it("is null when either half is missing, malformed or not a real day", () => {
    assert.equal(scheduleMoment("", "14:30"), null);
    assert.equal(scheduleMoment("2026-11-03", ""), null);
    assert.equal(scheduleMoment("11/03/2026", "14:30"), null);
    assert.equal(scheduleMoment("2026-02-31", "09:00"), null);
  });
});

describe("resolveSchedule", () => {
  it("sends now unless Schedule for later is picked", () => {
    assert.deepEqual(later({ sendLater: false }), { kind: "now" });
  });

  it("keeps event registrant emails immediate, whatever time was picked", () => {
    assert.deepEqual(later({ recipientTypes: ["event_registrants"] }), { kind: "now" });
    assert.deepEqual(later({ recipientTypes: ["customers", "event_registrants"], date: "" }), { kind: "now" });
  });

  it("schedules a valid future time", () => {
    const choice = later();
    assert.equal(choice.kind, "later");
    assert.equal(choice.kind === "later" && choice.at.getTime(), new Date(2026, 10, 3, 14, 30).getTime());
  });

  it("refuses a missing, past or current time", () => {
    assert.deepEqual(later({ date: "" }), { kind: "invalid", message: SCHEDULE_PAST_MESSAGE });
    assert.deepEqual(later({ time: "" }), { kind: "invalid", message: SCHEDULE_PAST_MESSAGE });
    assert.deepEqual(later({ date: "2026-10-29", time: "11:59" }), { kind: "invalid", message: SCHEDULE_PAST_MESSAGE });
    assert.deepEqual(later({ date: "2026-10-29", time: "12:00" }), { kind: "invalid", message: SCHEDULE_PAST_MESSAGE });
  });

  it("refuses a time a year or more away", () => {
    assert.deepEqual(later({ date: "2027-10-29", time: "12:00" }), { kind: "invalid", message: SCHEDULE_TOO_FAR_MESSAGE });
    const justInside = new Date(NOW + SCHEDULE_LIMIT_MS - 60 * 60 * 1000);
    const key = `${justInside.getFullYear()}-${String(justInside.getMonth() + 1).padStart(2, "0")}-${String(justInside.getDate()).padStart(2, "0")}`;
    assert.equal(later({ date: key, time: "00:00" }).kind, "later");
  });
});

describe("canScheduleCampaign", () => {
  it("allows every group except event registrants", () => {
    assert.equal(canScheduleCampaign(["customers", "attendants", "custom"]), true);
    assert.equal(canScheduleCampaign(["event_registrants"]), false);
  });
});

describe("campaignTiming", () => {
  it("leaves an immediate send and a draft exactly as before", () => {
    assert.deepEqual(campaignTiming(true), { send_now: true });
    assert.deepEqual(campaignTiming(false, null), { send_now: false });
  });

  it("sends a scheduled time as UTC ISO and never also sends now", () => {
    const at = new Date(Date.UTC(2026, 10, 3, 19, 30));
    assert.deepEqual(campaignTiming(true, at), { send_now: false, scheduled_at: "2026-11-03T19:30:00.000Z" });
  });
});

describe("scheduled campaign status", () => {
  it("is scheduled only while pending with a real send time", () => {
    assert.equal(isScheduledCampaign("pending", "2026-11-03T19:30:00.000000Z"), true);
    assert.equal(isScheduledCampaign("pending", null), false);
    assert.equal(isScheduledCampaign("pending", "not a date"), false);
    assert.equal(isScheduledCampaign("sending", "2026-11-03T19:30:00.000000Z"), false);
    assert.equal(isScheduledCampaign("completed", "2026-11-03T19:30:00.000000Z"), false);
  });

  it("shows other statuses unchanged", () => {
    assert.equal(campaignDisplayStatus("pending", "2026-11-03T19:30:00.000000Z"), "scheduled");
    assert.equal(campaignDisplayStatus("pending", null), "pending");
    for (const status of ["sending", "completed", "failed", "cancelled", "something_new"]) {
      assert.equal(campaignDisplayStatus(status, "2026-11-03T19:30:00.000000Z"), status);
    }
  });
});

describe("formatClock", () => {
  it("reads a picked 24-hour time as 12-hour", () => {
    assert.equal(formatClock("14:30"), "2:30 PM");
    assert.equal(formatClock("00:05"), "12:05 AM");
    assert.equal(formatClock("12:00"), "12:00 PM");
    assert.equal(formatClock(""), "");
  });
});

describe("formatScheduleTime", () => {
  it("reads like the campaign screens' dates", () => {
    assert.equal(formatScheduleTime(new Date(2026, 10, 3, 14, 5)), "Nov 3, 2026, 2:05 PM");
    assert.equal(formatScheduleTime(new Date(2026, 10, 3, 0, 0)), "Nov 3, 2026, 12:00 AM");
  });
});
