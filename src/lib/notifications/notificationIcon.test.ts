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

  it("gives a system-typed alert its own glyph when the title is known", () => {
    // Both are logged as `system`; without the title they would be identical
    // grey bells in the list.
    assert.equal(
      notificationIconStyle("system", "Overlay schedule conflict").icon,
      "zap",
    );
    assert.equal(
      notificationIconStyle("system", "Photo delivery failed").icon,
      "image",
    );
    assert.notEqual(
      notificationIconStyle("system", "Overlay schedule conflict").color,
      notificationIconStyle("system", "Photo delivery failed").color,
    );
  });

  it("lets a known title override its type", () => {
    // Location changes are logged as `booking`, but a map pin says more than
    // another calendar.
    assert.equal(notificationIconStyle("booking").icon, "calendar");
    assert.equal(
      notificationIconStyle("booking", "Location Change Request").icon,
      "map-pin",
    );
  });

  it("falls back to the type for an unlisted title", () => {
    assert.equal(
      notificationIconStyle("payment", "Some new alert").icon,
      "credit-card",
    );
  });

  it("matches titles regardless of case or padding", () => {
    assert.equal(
      notificationIconStyle("system", "  OVERLAY SCHEDULE CONFLICT ").icon,
      "zap",
    );
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
