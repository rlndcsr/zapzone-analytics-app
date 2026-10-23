import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PhotoDeliveryRow, PhotoTextingStatus } from "../../services/photosService";
import {
  canRetryFromLog,
  canRetryFromOutcome,
  fallbackTextingStatus,
  mergeDeliveries,
  needsQrFallback,
  outcomeStyle,
  pendingDeliveryIds,
  recipientLabel,
  resultStyleKey,
  testTextSizeLine,
  textingRecentLine,
  textingTopProblemLine,
  textingVerifiedLine,
} from "./deliveryOutcome.ts";

const row = (patch: Partial<PhotoDeliveryRow> = {}): PhotoDeliveryRow => ({
  id: 1,
  channel: "sms",
  destinationMasked: "***-***-9748",
  recipientName: null,
  recipientSource: null,
  registrationEntryId: null,
  status: "sent",
  isDuplicate: false,
  duplicateOfId: null,
  error: null,
  outcome: "awaiting_carrier",
  outcomeTone: "info",
  outcomeLabel: "Waiting for the carrier",
  outcomeDetail: null,
  receiptConfirmedByName: null,
  awaitingCarrier: true,
  carrierPending: true,
  canConfirmReceipt: true,
  retryUseful: true,
  canRetry: true,
  ...patch,
});

describe("recipientLabel", () => {
  it("adds Event registration only to a registrant's row", () => {
    assert.equal(recipientLabel(row({ recipientName: "Sam Lee", recipientSource: "waiver" })), "Sam Lee");
    assert.equal(
      recipientLabel(row({ recipientName: "Sam Lee", recipientSource: "registration" })),
      "Sam Lee · Event registration",
    );
    assert.equal(recipientLabel(row({ recipientName: null, recipientSource: "registration" })), "Event registration");
    assert.equal(recipientLabel(row()), "");
  });
});

describe("delivery states", () => {
  it("keeps carrier delivery, receipt and submission apart", () => {
    const delivered = row({ outcome: "delivered", awaitingCarrier: false, carrierPending: false });
    const received = row({ outcome: "received", receiptConfirmedByName: "Sam", awaitingCarrier: false, carrierPending: true });
    // A staff confirmation can still be waiting on the carrier, so it keeps being checked.
    assert.deepEqual(pendingDeliveryIds([row({ id: 1 }), { ...delivered, id: 2 }, { ...received, id: 3 }]), [1, 3]);
  });

  it("falls back to the awaiting flag when the server sends no carrier_pending", () => {
    assert.deepEqual(pendingDeliveryIds([row({ carrierPending: null, awaitingCarrier: true })]), [1]);
    assert.deepEqual(pendingDeliveryIds([row({ carrierPending: null, awaitingCarrier: false })]), []);
  });

  it("checks at most 50 texts at a time", () => {
    const rows = Array.from({ length: 60 }, (_, i) => row({ id: i + 1 }));
    assert.equal(pendingDeliveryIds(rows).length, 50);
  });

  it("colours each tone, and an unknown one as muted", () => {
    assert.match(outcomeStyle("danger").wrap, /red/);
    assert.match(outcomeStyle(null).wrap, /gray/);
  });
});

describe("merging fresh rows", () => {
  it("replaces matching rows and keeps fields only the screen has", () => {
    const current = [{ ...row({ id: 1 }), locationName: "Brighton" }, { ...row({ id: 2 }), locationName: "Novi" }];
    const merged = mergeDeliveries(current, [row({ id: 2, outcome: "delivered", outcomeLabel: "Delivered to the phone" })]);
    assert.equal(merged[0], current[0]);
    assert.equal(merged[1].outcomeLabel, "Delivered to the phone");
    assert.equal(merged[1].locationName, "Novi");
  });
});

describe("retry", () => {
  const notDelivered = row({ outcome: "not_delivered", outcomeTone: "danger", awaitingCarrier: false, carrierPending: false });

  it("is offered for a failed or undelivered message that sending again would help", () => {
    assert.equal(canRetryFromOutcome(notDelivered, false), true);
    assert.equal(canRetryFromOutcome(row({ outcome: "failed", channel: "email" }), false), true);
    assert.equal(canRetryFromOutcome(row({ outcome: "delivered" }), false), false);
  });

  it("is hidden for texts while the carrier blocks the sending number, but not for email", () => {
    assert.equal(canRetryFromOutcome(notDelivered, true), false);
    assert.equal(canRetryFromOutcome({ ...notDelivered, channel: "email", outcome: "failed" }, true), true);
  });

  it("is hidden when the server says it would not help, or for a duplicate", () => {
    assert.equal(canRetryFromLog(row({ retryUseful: false })), false);
    assert.equal(canRetryFromLog(row({ isDuplicate: true })), false);
    assert.equal(canRetryFromLog(row({ canRetry: false })), false);
    assert.equal(canRetryFromLog(row({ retryUseful: null })), true);
  });
});

describe("the result screen", () => {
  it("offers the QR code only when something did not go out", () => {
    assert.equal(needsQrFallback("failed"), true);
    assert.equal(needsQrFallback("partial"), true);
    assert.equal(needsQrFallback("sent"), false);
    assert.equal(needsQrFallback(null), false);
  });

  it("shows a sent-but-waiting result as in progress while checking", () => {
    assert.equal(resultStyleKey("sent", true, true), "waiting");
    assert.equal(resultStyleKey("sent", true, false), "scheduled");
    assert.equal(resultStyleKey("sent", false, false), "sent");
    assert.equal(resultStyleKey("partial", true, true), "partial");
  });
});

describe("texting status", () => {
  const status = (patch: Partial<PhotoTextingStatus> = {}): PhotoTextingStatus => ({
    ...fallbackTextingStatus(true, null),
    ...patch,
  });

  it("falls back to the channel switch when the server sends no status", () => {
    assert.equal(fallbackTextingStatus(true, null).state, "unverified");
    assert.equal(fallbackTextingStatus(false, "off").state, "not_configured");
    assert.equal(fallbackTextingStatus(false, "off").note, "off");
  });

  it("says who confirmed it and how", () => {
    const at = "2026-10-14T15:00:00Z";
    const day = new Date(at).toLocaleDateString();
    assert.equal(
      textingVerifiedLine(status({ state: "verified", verified: { at, method: "staff_confirmed", byName: "Sam", locationName: "Brighton" } })),
      `Confirmed on ${day} by Sam at Brighton.`,
    );
    assert.equal(
      textingVerifiedLine(status({ state: "failing", verified: { at: null, method: "guest_opened_link", byName: "Sam", locationName: null } })),
      "Last confirmed when a guest opened the link from their text. Newer texts are not arriving.",
    );
    assert.equal(textingVerifiedLine(status()), null);
  });

  it("sums the recent outcomes the way the web does", () => {
    const recent = { ...status().recent, attempted: 9, received: 2, delivered: 5, awaitingCarrier: 1, unconfirmed: 0, notDelivered: 1, failed: 0 };
    assert.equal(
      textingRecentLine(status({ recent })),
      "Last 14 days: 9 photo texts · 7 reached the phone · 1 not confirmed · 1 did not arrive",
    );
    assert.equal(textingRecentLine(status()), null);
  });

  it("names the most common problem unless it is the current one", () => {
    const recent = { ...status().recent, topProblem: { code: "30007", meaning: "Filtered", count: 3 } };
    assert.equal(textingTopProblemLine(status({ recent })), "Most common problem (code 30007, 3×): Filtered");
    assert.equal(textingTopProblemLine(status({ recent, problem: { code: "30007", meaning: "Filtered" } })), null);
  });

  it("explains how a test text is billed", () => {
    assert.equal(
      testTextSizeLine({ success: true, message: "", characters: 180, segments: 2, encoding: "GSM-7" }),
      "A real photo text is about 180 characters (GSM-7), billed as 2 messages.",
    );
    assert.equal(testTextSizeLine({ success: false, message: "" }), null);
  });
});
