import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { smsConsentLabel, smsOptInLine } from "./smsConsent.ts";

const session = (over: Partial<{ guestName: string; guestPhone: string; guestSmsConsent: boolean }> = {}) => ({
  guestName: "Dana",
  guestPhone: "(810) 555-0134",
  guestSmsConsent: false,
  ...over,
});

describe("Visitor Tracking SMS column / CSV value", () => {
  it("shows Opted In for a guest who ticked the consent box", () => {
    assert.equal(smsConsentLabel(session({ guestSmsConsent: true })), "Opted In");
  });

  it("shows No for an identified guest who did not opt in", () => {
    assert.equal(smsConsentLabel(session()), "No");
    assert.equal(smsConsentLabel(session({ guestName: "" })), "No");
    assert.equal(smsConsentLabel(session({ guestPhone: "" })), "No");
  });

  it("is blank for an anonymous visitor", () => {
    assert.equal(smsConsentLabel(session({ guestName: "", guestPhone: "" })), "");
    assert.equal(smsConsentLabel(session({ guestName: "", guestPhone: "", guestSmsConsent: true })), "");
  });
});

describe("session detail SMS opt-in line", () => {
  it("names the opt-in with its time", () => {
    assert.equal(
      smsOptInLine({ smsConsent: true, smsConsentLabel: "Oct 2, 2026 3:14 AM" }),
      "SMS opted in · Oct 2, 2026 3:14 AM ET",
    );
  });

  it("omits the time when the server has none", () => {
    assert.equal(smsOptInLine({ smsConsent: true, smsConsentLabel: "" }), "SMS opted in");
  });

  it("shows nothing when the guest did not opt in", () => {
    assert.equal(smsOptInLine({ smsConsent: false, smsConsentLabel: "" }), null);
  });
});
