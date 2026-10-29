import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  SmsNotification,
  SmsOptions,
} from "../../services/smsNotificationService.ts";
import {
  groupSmsNotifications,
  smsBodyOf,
  smsCharCount,
  smsSegmentLabel,
  smsSegments,
  smsTriggerLabel,
  withListFields,
} from "./smsText.ts";

const note = (over: Partial<SmsNotification>): SmsNotification => ({
  id: 1,
  name: "Waiver Signed (Customer)",
  description: null,
  trigger_type: "waiver_signed",
  entity_type: "waiver",
  body: null,
  default_body: "Default",
  recipient_types: ["customer"],
  is_active: true,
  is_default: true,
  ...over,
});

describe("smsSegments (mirrors the backend's segmentCount)", () => {
  it("is 0 for an empty message", () => {
    assert.equal(smsSegments(""), 0);
  });
  it("fits 160 plain characters in one segment, 161 in two", () => {
    assert.equal(smsSegments("a".repeat(160)), 1);
    assert.equal(smsSegments("a".repeat(161)), 2);
    assert.equal(smsSegments("a".repeat(306)), 2);
    assert.equal(smsSegments("a".repeat(307)), 3);
  });
  it("drops to 70 / 67 once any non-GSM character appears", () => {
    assert.equal(smsSegments("é".repeat(70)), 1);
    assert.equal(smsSegments("é".repeat(71)), 2);
  });
  it("counts an emoji as one character, as the server does", () => {
    assert.equal(smsCharCount("hi 👋"), 4);
  });
});

describe("smsBodyOf", () => {
  it("prefers the effective body, then the custom one, then the default", () => {
    assert.equal(smsBodyOf(note({ effective_body: "E", body: "B" })), "E");
    assert.equal(smsBodyOf(note({ body: "B" })), "B");
    assert.equal(smsBodyOf(note({})), "Default");
    assert.equal(smsBodyOf(note({ default_body: null })), "");
  });
});

describe("withListFields (the backend's getEffectiveBody / isBodyCustomized)", () => {
  it("sends the default and is not customized when no body is set", () => {
    const n = withListFields(note({ body: null, default_body: "D" }));
    assert.equal(n.effective_body, "D");
    assert.equal(n.is_body_customized, false);
  });
  it("is customized only when a default's body differs from its default", () => {
    assert.equal(withListFields(note({ body: "X", default_body: "D" })).is_body_customized, true);
    assert.equal(withListFields(note({ body: "D", default_body: "D" })).is_body_customized, false);
    assert.equal(
      withListFields(note({ body: "X", default_body: "D", is_default: false })).is_body_customized,
      false,
    );
  });
  it("sends an empty custom body as empty, not the default", () => {
    assert.equal(withListFields(note({ body: "", default_body: "D" })).effective_body, "");
  });
});

describe("smsTriggerLabel", () => {
  const options: SmsOptions = {
    trigger_types: { waiver: { waiver_signed: "Waiver Signed" } },
    entity_types: {},
    recipient_types: {},
    sms_configured: true,
  };
  it("finds the label in any trigger group", () => {
    assert.equal(smsTriggerLabel(options, "waiver_signed"), "Waiver Signed");
  });
  it("falls back to the raw key, with or without options", () => {
    assert.equal(smsTriggerLabel(options, "unknown_key"), "unknown_key");
    assert.equal(smsTriggerLabel(null, "waiver_signed"), "waiver_signed");
  });
});

describe("groupSmsNotifications", () => {
  it("groups by segment in first-seen order, keeping each group's order", () => {
    const groups = groupSmsNotifications([
      note({ id: 1, entity_type: "all" }),
      note({ id: 2, entity_type: "waiver" }),
      note({ id: 3, entity_type: "all" }),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.segment, g.items.map((n) => n.id)]),
      [
        ["all", [1, 3]],
        ["waiver", [2]],
      ],
    );
  });
  it("labels segments in the web's wording", () => {
    assert.equal(smsSegmentLabel("all"), "All Segments");
    assert.equal(smsSegmentLabel("waiver"), "Waiver");
    assert.equal(smsSegmentLabel("package"), "Parties");
    assert.equal(smsSegmentLabel("custom"), "custom");
  });
});
