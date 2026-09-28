import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { purchaseTextFields } from "./purchaseEditPayload.ts";

const form = (over: Partial<Parameters<typeof purchaseTextFields>[0]> = {}) => ({
  guestName: "Sam Lee",
  guestEmail: "sam@example.com",
  guestPhone: "555-0100",
  notes: "Birthday group",
  ...over,
});

describe("purchaseTextFields", () => {
  it("sends filled fields as their values", () => {
    assert.deepEqual(purchaseTextFields(form()), {
      guest_name: "Sam Lee",
      guest_email: "sam@example.com",
      guest_phone: "555-0100",
      notes: "Birthday group",
    });
  });

  it("sends cleared notes and guest phone as null so they are actually removed", () => {
    const body = purchaseTextFields(form({ notes: "", guestPhone: "" }));
    assert.equal(body.notes, null);
    assert.equal(body.guest_phone, null);
    const json = JSON.stringify(body);
    assert.equal(json.includes('"notes":null'), true);
    assert.equal(json.includes('"guest_phone":null'), true);
  });

  it("leaves a cleared guest name or email out, never null", () => {
    // the endpoint's rules for these are not nullable — a null would be a 422
    const body = purchaseTextFields(form({ guestName: "", guestEmail: "" }));
    assert.equal(body.guest_name, undefined);
    assert.equal(body.guest_email, undefined);
    const json = JSON.stringify(body);
    assert.equal(json.includes("guest_name"), false);
    assert.equal(json.includes("guest_email"), false);
  });
});
