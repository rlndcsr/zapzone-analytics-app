import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPAIGN_REFUSED_FALLBACK, campaignSendOutcome } from "./campaignSendOutcome.ts";

const REASON =
  "Resend refused this campaign, so sending stopped: The domain is not verified. Fix this in Resend, then use Resend to Failed Recipients to send to everyone it did not reach.";

describe("campaignSendOutcome", () => {
  it("reads a failed campaign in a success reply as refused, with Resend's reason", () => {
    // send now (201) and Resend to Failed Recipients (200) both answer this way
    assert.deepEqual(campaignSendOutcome("failed", REASON), { kind: "refused", message: REASON });
    assert.deepEqual(campaignSendOutcome("failed", `  ${REASON}\n`), { kind: "refused", message: REASON });
  });

  it("never reads a refusal as sent, whatever the message says", () => {
    assert.equal(campaignSendOutcome("failed", "Email campaign sent successfully").kind, "refused");
  });

  it("falls back to a safe reason when the refusal has none", () => {
    for (const message of ["", "   ", null, undefined, 42, { reason: "x" }]) {
      assert.deepEqual(campaignSendOutcome("failed", message), {
        kind: "refused",
        message: CAMPAIGN_REFUSED_FALLBACK,
      });
    }
  });

  it("keeps a large send's carrying-on message", () => {
    assert.deepEqual(campaignSendOutcome("sending", "Sending to 600 people now…"), {
      kind: "sending",
      message: "Sending to 600 people now…",
    });
  });

  it("treats a sending reply without a message as done, as before", () => {
    assert.deepEqual(campaignSendOutcome("sending", ""), { kind: "done", message: null });
    assert.deepEqual(campaignSendOutcome("sending", null), { kind: "done", message: null });
  });

  it("leaves a successful send or resend as done, with the server's message", () => {
    assert.deepEqual(campaignSendOutcome("completed", "Email campaign sent successfully"), {
      kind: "done",
      message: "Email campaign sent successfully",
    });
    assert.deepEqual(campaignSendOutcome("completed", "Emails resent successfully"), {
      kind: "done",
      message: "Emails resent successfully",
    });
    assert.deepEqual(campaignSendOutcome("completed", "There was no one left to send it to again."), {
      kind: "done",
      message: "There was no one left to send it to again.",
    });
  });

  it("leaves a scheduled campaign or a draft as done", () => {
    assert.deepEqual(campaignSendOutcome("pending", "Email campaign scheduled successfully"), {
      kind: "done",
      message: "Email campaign scheduled successfully",
    });
    assert.deepEqual(campaignSendOutcome("pending", null), { kind: "done", message: null });
  });

  it("does not read a missing or unknown status as refused", () => {
    for (const status of ["", null, undefined, "cancelled", "something_new", 0]) {
      assert.equal(campaignSendOutcome(status, "ok").kind, "done");
    }
  });
});
