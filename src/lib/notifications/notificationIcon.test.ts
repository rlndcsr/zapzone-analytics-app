import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { notificationIconStyle } from "./notificationIcon.ts";

describe("notification tile by type", () => {
  it("gives payments a card, bookings a calendar", () => {
    assert.equal(notificationIconStyle("payment").icon, "credit-card");
    assert.equal(notificationIconStyle("booking").icon, "calendar");
  });

  it("gives checkout concerns the customer tile", () => {
    // CheckoutConcernService logs these as `customer`.
    assert.equal(notificationIconStyle("customer").icon, "users");
  });

  it("covers every value in the database enum", () => {
    const enumValues = [
      "system",
      "booking",
      "payment",
      "staff",
      "customer",
      "promotion",
      "gift_card",
      "reminder",
    ];
    for (const type of enumValues) {
      const style = notificationIconStyle(type);
      assert.ok(style.icon, `${type} has an icon`);
      assert.ok(style.tile.includes("dark:"), `${type} tile handles dark mode`);
    }
  });

  it("is case- and whitespace-tolerant", () => {
    assert.equal(notificationIconStyle(" Payment ").icon, "credit-card");
    assert.equal(notificationIconStyle("BOOKING").icon, "calendar");
  });

  it("falls back to a bell for an unknown or missing type", () => {
    assert.equal(notificationIconStyle("something_new").icon, "bell");
    assert.equal(notificationIconStyle(null).icon, "bell");
    assert.equal(notificationIconStyle("").icon, "bell");
  });
});
