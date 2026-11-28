import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyRestoreOutcome,
  restoreAttemptFromError,
  restoreOutcomeNotice,
  type RestoreAttempt,
} from "./restoreOutcome.ts";

// Shapes from zapzone-backend@2bbd0fa BookingController::restore and what runs
// before it (spec 002, contracts/restore-response.md R1–R4c).
const ok = (body: unknown): RestoreAttempt => ({ kind: "ok", body });
const err = (status: number, body: unknown, message = "server says no"): RestoreAttempt => ({
  kind: "error",
  status,
  body,
  message,
});

const WARNING =
  "Booking restored, but its time was taken while it was deleted: Room B is also booked then by REF-1. Move one of the bookings so they do not clash.";

describe("classifyRestoreOutcome", () => {
  it("R1: a confirmed restore with a clash warning keeps the trimmed server text", () => {
    assert.deepEqual(
      classifyRestoreOutcome(ok({ success: true, message: WARNING, space_warning: `  ${WARNING}  `, data: {} })),
      { kind: "restored_with_warning", warning: WARNING },
    );
  });

  it("R2: a confirmed restore without a usable warning is a plain restore", () => {
    for (const space_warning of [null, undefined, "", "   ", 42]) {
      assert.deepEqual(
        classifyRestoreOutcome(ok({ success: true, message: "Booking restored successfully", space_warning })),
        { kind: "restored" },
      );
    }
  });

  it("R3a–d: only the pre-change refusal shapes are confirmed rejections", () => {
    const rejections: RestoreAttempt[] = [
      err(403, { success: false, message: "This area is for staff accounts only." }),
      err(422, { success: false, message: "This record's gift card was already refunded when it was cancelled." }),
      err(422, { success: false, message: "That time slot is full." }),
      err(422, { success: false, message: "The selected date or time is closed. Please choose another slot." }),
      err(422, {
        message: "A reason is required for this change so it can be recorded in the booking history.",
        errors: { change_reason: ["A reason is required for this change so it can be recorded in the booking history."] },
      }),
      err(
        409,
        { success: false, code: "BLOCKED_PERIOD", requires_acknowledgement: true, message: "…", blocked_periods: [] },
        "Not saved: that time is inside a blocked period.",
      ),
    ];
    for (const attempt of rejections) assert.equal(classifyRestoreOutcome(attempt).kind, "rejected");
  });

  it("R3: a rejection shows today's message (the ApiError message), else a fallback", () => {
    assert.deepEqual(
      classifyRestoreOutcome(
        err(409, { success: false, code: "BLOCKED_PERIOD" }, "Not saved: that time is inside a blocked period."),
      ),
      { kind: "rejected", message: "Not saved: that time is inside a blocked period." },
    );
    assert.deepEqual(classifyRestoreOutcome(err(403, { success: false }, "  ")), {
      kind: "rejected",
      message: "The booking was not restored.",
    });
  });

  it("R4: everything else is unknown — including any 404", () => {
    const unknowns: RestoreAttempt[] = [
      { kind: "no_answer" },
      ok(null),
      ok([{ success: true }]),
      ok({ success: false }),
      ok({ success: "true" }),
      err(404, { message: "No query results for model [App\\Models\\Booking] 12" }),
      err(404, { success: false, message: "x" }),
      err(403, { message: "This action is unauthorized." }),
      err(409, { success: false, message: "conflict" }),
      err(422, { message: "The given data was invalid." }),
      err(422, { message: "x", errors: { other: ["y"] } }),
      err(422, null),
      err(500, { message: "Server Error" }),
      err(500, { success: false, message: "x" }),
      err(502, null),
      err(504, null),
      err(418, { success: false }),
    ];
    for (const attempt of unknowns) {
      assert.deepEqual(classifyRestoreOutcome(attempt), { kind: "unknown" }, JSON.stringify(attempt));
    }
  });
});

describe("restoreAttemptFromError", () => {
  it("status 0 (timeout, dropped connection) is no answer", () => {
    assert.deepEqual(restoreAttemptFromError({ status: 0, message: "Request timed out" }), { kind: "no_answer" });
  });
  it("an answered error keeps status, body and the ApiError message", () => {
    const body = { success: false, message: "x" };
    assert.deepEqual(restoreAttemptFromError({ status: 422, body, message: "x" }), {
      kind: "error",
      status: 422,
      body,
      message: "x",
    });
  });
  it("anything without a numeric status is no answer", () => {
    assert.deepEqual(restoreAttemptFromError(new Error("boom")), { kind: "no_answer" });
    assert.deepEqual(restoreAttemptFromError(undefined), { kind: "no_answer" });
  });
});

describe("restoreOutcomeNotice", () => {
  it("each outcome has its own title and message", () => {
    assert.deepEqual(restoreOutcomeNotice({ kind: "restored" }, "BK-1"), {
      title: "Booking restored",
      message: "BK-1 was restored.",
    });
    assert.deepEqual(restoreOutcomeNotice({ kind: "restored_with_warning", warning: WARNING }, "BK-1"), {
      title: "Booking restored — time clash",
      message: WARNING,
    });
    assert.deepEqual(restoreOutcomeNotice({ kind: "rejected", message: "That time slot is full." }, "BK-1"), {
      title: "Restore failed",
      message: "That time slot is full.",
    });
    assert.deepEqual(restoreOutcomeNotice({ kind: "unknown" }, "BK-1"), {
      title: "Restore result unknown",
      message:
        "The booking restoration could not be confirmed. Please check the booking status before attempting to restore it again.",
    });
  });

  it("the unknown message never claims a restore or a failure", () => {
    const { message } = restoreOutcomeNotice({ kind: "unknown" }, "BK-1");
    assert.doesNotMatch(message, /was restored\.|failed/i);
  });
});
