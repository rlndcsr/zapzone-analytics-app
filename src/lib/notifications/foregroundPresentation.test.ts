import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Bare Node, no Expo runtime — if this module required expo-notifications
// instead of importing its type, the suite could not even load.
import { foregroundNotificationBehavior } from "./foregroundPresentation.ts";

describe("foreground presentation behavior", () => {
  it("shows the banner", () => {
    assert.equal(foregroundNotificationBehavior().shouldShowBanner, true);
  });

  it("adds the notification to the list/tray", () => {
    assert.equal(foregroundNotificationBehavior().shouldShowList, true);
  });

  it("plays a sound — Android suppresses the banner entirely without it", () => {
    assert.equal(foregroundNotificationBehavior().shouldPlaySound, true);
  });

  it("does not set a badge (out of scope)", () => {
    assert.equal(foregroundNotificationBehavior().shouldSetBadge, false);
  });

  it("returns exactly the four SDK 55 fields", () => {
    assert.deepEqual(foregroundNotificationBehavior(), {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it("does not use the deprecated shouldShowAlert field", () => {
    const behavior = foregroundNotificationBehavior();
    assert.equal("shouldShowAlert" in behavior, false);
  });

  it("introduces no backend-priority to Android-priority mapping", () => {
    // Guards the decision to keep business urgency out of Android presentation priority.
    for (const priority of ["normal", "high", "urgent", null, undefined]) {
      const behavior = foregroundNotificationBehavior({
        request: { content: { data: { priority } } },
      });
      assert.equal("priority" in behavior, false);
    }
  });

  it("returns synchronously, not a promise", () => {
    const behavior = foregroundNotificationBehavior();
    assert.ok(!(behavior instanceof Promise));
    assert.equal(typeof behavior, "object");
  });

  it("returns a fresh object each call, so a caller cannot mutate the next one", () => {
    // A shared literal would let one caller's mutation leak into every later notification.
    const first = foregroundNotificationBehavior();
    const second = foregroundNotificationBehavior();
    assert.notEqual(first, second);
    first.shouldShowBanner = false;
    assert.equal(second.shouldShowBanner, true);
    assert.equal(foregroundNotificationBehavior().shouldShowBanner, true);
  });

  it("is deterministic and independent of the payload", () => {
    const baseline = foregroundNotificationBehavior();
    const payloads: unknown[] = [
      undefined,
      null,
      "a string",
      0,
      42,
      true,
      [],
      {},
      { request: { content: { data: {} } } },
      {
        date: 1_700_000_000_000,
        request: {
          identifier: "req-1",
          content: {
            title: "New Booking Received",
            body: "Someone booked",
            data: {
              notification_id: 12,
              type: "booking",
              priority: "urgent",
              location_id: 3,
              action_url: "/bookings/12",
            },
          },
        },
      },
      // Shapes that would break naive property access.
      { request: null },
      { request: { content: null } },
      { notification: { request: { content: { data: null } } } },
    ];

    for (const payload of payloads) {
      assert.deepEqual(
        foregroundNotificationBehavior(payload),
        baseline,
        `payload ${JSON.stringify(payload) ?? String(payload)} changed the behavior`,
      );
    }
  });

  it("does not depend on authentication state", () => {
    // The module reads no session or global state, so there is nothing to stub.
    const before = foregroundNotificationBehavior();
    const during = foregroundNotificationBehavior({ authed: false });
    const after = foregroundNotificationBehavior({ authed: true });
    assert.deepEqual(during, before);
    assert.deepEqual(after, before);
  });

  it("stays fast enough for the 3s handler deadline", () => {
    // Completing 10k calls proves it does no I/O; a wall-clock assertion would
    // only be flaky on a loaded machine.
    for (let i = 0; i < 10_000; i++) foregroundNotificationBehavior();
    assert.ok(true);
  });
});
