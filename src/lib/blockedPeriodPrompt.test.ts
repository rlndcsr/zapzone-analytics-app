import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  blockedPeriodWarning,
  confirmBlockedPeriod,
  coveredBy,
  forgetAcknowledgements,
  readBody,
  registerBlockedPeriodHandler,
  rememberAcknowledged,
  rememberedBlockIds,
  targetKey,
  warningBlockIds,
  withAcknowledgement,
} from "./blockedPeriodPrompt.ts";

const answer = {
  success: false,
  code: "BLOCKED_PERIOD",
  requires_acknowledgement: true,
  message: "This booking falls inside a blocked period: Entire location — Closed all day for Acme. Confirm to book it anyway.",
  blocked_periods: [
    {
      id: 7,
      date: "2025-12-24",
      occurrence_date: "2026-12-24",
      group_name: "Acme",
      reason: "Private buyout",
      window_label: "Closed all day",
      scope_label: "Entire location",
      location_id: 3,
      location_name: "Farmington",
      set_by: { id: 1, name: "Sam Lee", role: "location_manager" },
    },
  ],
};

describe("blockedPeriodWarning", () => {
  it("reads the blocks out of a 409 BLOCKED_PERIOD answer", () => {
    const warning = blockedPeriodWarning(409, answer);
    assert.ok(warning);
    assert.equal(warning.message, answer.message);
    assert.deepEqual(warning.periods[0], {
      id: 7,
      occurrenceDate: "2026-12-24",
      groupName: "Acme",
      reason: "Private buyout",
      windowLabel: "Closed all day",
      scopeLabel: "Entire location",
      locationId: 3,
      locationName: "Farmington",
      setByName: "Sam Lee",
    });
  });

  it("ignores other conflicts and the guest 422", () => {
    assert.equal(blockedPeriodWarning(409, { message: "Someone else changed this block a moment ago." }), null);
    assert.equal(blockedPeriodWarning(422, { message: "The selected date or time is closed." }), null);
    assert.equal(blockedPeriodWarning(409, null), null);
  });
});

describe("acknowledging", () => {
  it("adds the flag and every block id to the request body", () => {
    assert.deepEqual(withAcknowledgement({ booking_date: "2026-12-24" }, [7, 9]), {
      booking_date: "2026-12-24",
      acknowledge_blocked_period: true,
      acknowledged_block_ids: [7, 9],
    });
  });

  it("only acknowledges object bodies", () => {
    assert.deepEqual(readBody(undefined), {});
    assert.equal(readBody([1, 2]), null);
    assert.equal(readBody("text"), null);
  });

  it("treats one answer as covering a second save inside the same blocks only", () => {
    const first = blockedPeriodWarning(409, answer)!;
    const same = blockedPeriodWarning(409, answer)!;
    const other = blockedPeriodWarning(409, { ...answer, blocked_periods: [{ ...answer.blocked_periods[0], id: 8 }] })!;
    assert.deepEqual(warningBlockIds(first), [7]);
    assert.equal(coveredBy(same, first), true);
    assert.equal(coveredBy(other, first), false);
  });
});

describe("remembered confirmations", () => {
  beforeEach(() => forgetAcknowledgements());

  it("are kept for a few minutes per staff member and target", () => {
    const key = targetKey(4, "POST", "/api/bookings", { booking_date: "2026-12-24", notes: "x" });
    rememberAcknowledged(key, [7], 0);
    assert.deepEqual(rememberedBlockIds(key, 60_000), [7]);
    assert.deepEqual(rememberedBlockIds(key, 6 * 60_000), []);
    assert.deepEqual(rememberedBlockIds(targetKey(5, "POST", "/api/bookings", { booking_date: "2026-12-24" }), 60_000), []);
  });

  it("key on what is booked, not on unrelated fields", () => {
    assert.equal(
      targetKey(4, "post", "/api/bookings?x=1", { booking_date: "2026-12-24", notes: "a" }),
      targetKey(4, "POST", "/api/bookings", { booking_date: "2026-12-24", notes: "b" }),
    );
  });
});

describe("the prompt", () => {
  it("declines when nothing is mounted to ask", async () => {
    assert.equal(await confirmBlockedPeriod(blockedPeriodWarning(409, answer)!), false);
  });

  it("asks the mounted handler, and stops asking once it unmounts", async () => {
    const off = registerBlockedPeriodHandler(async () => true);
    assert.equal(await confirmBlockedPeriod(blockedPeriodWarning(409, answer)!), true);
    off();
    assert.equal(await confirmBlockedPeriod(blockedPeriodWarning(409, answer)!), false);
  });
});
