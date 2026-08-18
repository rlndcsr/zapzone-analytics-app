import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  pushDataToNotification,
  resolveNotificationRoute,
} from "./notificationRouteMapper.ts";
import {
  discardPendingNotificationTap,
  flushPendingNotificationTap,
  hasPendingNotificationTap,
  isInternalRoute,
  notificationTapKey,
  offerNotificationTap,
  readNotificationResponse,
  resetNotificationTapState,
  type NavigationGate,
} from "./pushNavigationQueue.ts";

const OPEN: NavigationGate = { authed: true, ready: true };
const NO_AUTH: NavigationGate = { authed: false, ready: true };
const NOT_READY: NavigationGate = { authed: true, ready: false };
const DETAILS = "/notification/notification-details";

/** A NotificationResponse as expo-notifications delivers it. */
function response(
  data: Record<string, unknown>,
  overrides: {
    identifier?: string;
    date?: number;
    title?: string;
    body?: string;
  } = {},
) {
  return {
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: {
      date: overrides.date ?? 1_700_000_000_000,
      request: {
        identifier: overrides.identifier ?? "req-1",
        content: {
          title: overrides.title ?? "New Booking Received",
          body: overrides.body ?? "Someone booked",
          data,
        },
        trigger: {},
      },
    },
  };
}

/** The full chain the router component performs, minus expo-router. */
function resolveTap(raw: unknown) {
  const tapped = readNotificationResponse(raw);
  return resolveNotificationRoute(
    pushDataToNotification(tapped.data, {
      title: tapped.title,
      body: tapped.body,
    }),
  );
}

beforeEach(() => {
  resetNotificationTapState();
});

describe("reading a push response", () => {
  it("extracts the payload, content and identity", () => {
    const tapped = readNotificationResponse(
      response(
        {
          notification_id: 42,
          type: "payment",
          priority: "medium",
          location_id: 3,
          action_url: "/attractions/purchases/7",
        },
        { identifier: "abc", date: 123, title: "T", body: "B" },
      ),
    );

    assert.deepEqual(tapped.data, {
      notification_id: 42,
      type: "payment",
      priority: "medium",
      location_id: 3,
      action_url: "/attractions/purchases/7",
    });
    assert.equal(tapped.title, "T");
    assert.equal(tapped.body, "B");
    assert.equal(tapped.identifier, "abc");
    assert.equal(tapped.date, 123);
  });

  it("converts the payload into a resolvable notification", () => {
    const tapped = readNotificationResponse(
      response({ notification_id: 9, type: "booking", action_url: "/bookings/5" }),
    );
    const notification = pushDataToNotification(tapped.data, {
      title: tapped.title,
      body: tapped.body,
    });

    assert.equal(notification.id, 9);
    assert.equal(notification.action_url, "/bookings/5");
    assert.equal(notification.metadata, undefined);
  });

  for (const [label, raw] of [
    ["null", null],
    ["undefined", undefined],
    ["a string", "nope"],
    ["an empty object", {}],
    ["a response with no content", { notification: { request: {} } }],
    ["a response with junk data", { notification: { request: { content: { data: 7 } } } }],
    ["data with wrong-typed fields", response({ type: 5, action_url: {} })],
  ] as const) {
    it(`does not throw on malformed input: ${label}`, () => {
      const tapped = readNotificationResponse(raw);
      assert.equal(typeof tapped, "object");
      assert.equal(typeof notificationTapKey(tapped), "string");
      assert.equal(resolveTap(raw).pathname, DETAILS);
    });
  }
});

describe("resolving a tap to a route", () => {
  it("routes a valid action_url through the shared resolver", () => {
    assert.deepEqual(
      resolveTap(response({ type: "payment", action_url: "/attractions/purchases/7" })),
      { pathname: "/attractions/purchase-details", params: { id: "7" } },
    );
    assert.deepEqual(
      resolveTap(response({ type: "booking", action_url: "/location-change-requests" })),
      { pathname: "/bookings/location-requests" },
    );
    assert.deepEqual(
      resolveTap(response({ type: "system", action_url: "/photos/delivery-log" })),
      { pathname: "/photos/delivery-log" },
    );
  });

  it("falls back to the details screen for an unknown action_url", () => {
    const route = resolveTap(
      response(
        { notification_id: 3, type: "mystery", action_url: "/nope/nowhere" },
        { title: "Heads up", body: "Details" },
      ),
    );
    assert.deepEqual(route, {
      pathname: DETAILS,
      params: { id: "3", title: "Heads up", message: "Details" },
    });
  });
});

describe("navigation safety", () => {
  it("accepts internal app routes", () => {
    assert.ok(isInternalRoute({ pathname: "/bookings/bookings" }));
    assert.ok(isInternalRoute({ pathname: "/photos/delivery-log" }));
  });

  for (const pathname of [
    "https://evil.example.com/steal",
    "//evil.example.com",
    "zapzoneanalyticsapp://bookings/1",
    "javascript:alert(1)",
    "bookings/1",
    "",
  ]) {
    it(`rejects ${JSON.stringify(pathname)}`, () => {
      assert.equal(isInternalRoute({ pathname }), false);
    });
  }

  it("rejects a missing route", () => {
    assert.equal(isInternalRoute(null), false);
  });

  it("never navigates to an external route even if one is offered", () => {
    const offered = offerNotificationTap(
      "k",
      { pathname: "https://evil.example.com" },
      OPEN,
    );
    assert.equal(offered, null);
    assert.equal(hasPendingNotificationTap(), false);
  });
});

describe("authentication and router gating", () => {
  const route = { pathname: "/bookings/bookings", params: { openId: "1" } };

  it("navigates immediately when authed and ready", () => {
    assert.deepEqual(offerNotificationTap("k", route, OPEN), route);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("does not navigate while unauthenticated — it parks", () => {
    assert.equal(offerNotificationTap("k", route, NO_AUTH), null);
    assert.equal(hasPendingNotificationTap(), true);
  });

  it("does not navigate while the router is not ready — it parks", () => {
    assert.equal(offerNotificationTap("k", route, NOT_READY), null);
    assert.equal(hasPendingNotificationTap(), true);
  });

  it("keeps the destination parked until BOTH conditions hold", () => {
    offerNotificationTap("k", route, { authed: false, ready: false });
    assert.equal(flushPendingNotificationTap({ authed: true, ready: false }), null);
    assert.equal(flushPendingNotificationTap({ authed: false, ready: true }), null);
    assert.equal(hasPendingNotificationTap(), true);

    assert.deepEqual(flushPendingNotificationTap(OPEN), route);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("processes the parked destination exactly once after the gate opens", () => {
    offerNotificationTap("k", route, NO_AUTH);
    assert.deepEqual(flushPendingNotificationTap(OPEN), route);
    // Every later gate change must be a no-op.
    assert.equal(flushPendingNotificationTap(OPEN), null);
    assert.equal(flushPendingNotificationTap(OPEN), null);
  });

  it("flushing with nothing parked is a harmless no-op", () => {
    assert.equal(flushPendingNotificationTap(OPEN), null);
  });

  it("drops a parked destination on sign-out or account change", () => {
    offerNotificationTap("k", route, NO_AUTH);
    discardPendingNotificationTap();
    assert.equal(hasPendingNotificationTap(), false);
    assert.equal(flushPendingNotificationTap(OPEN), null);
  });

  it("cannot revive a discarded tap by re-offering it", () => {
    offerNotificationTap("k", route, NO_AUTH);
    discardPendingNotificationTap();
    assert.equal(offerNotificationTap("k", route, OPEN), null);
  });
});

describe("duplicate tap prevention", () => {
  const route = { pathname: "/payments/payments", params: { openId: "4" } };

  it("navigates once when the same key is offered twice", () => {
    assert.deepEqual(offerNotificationTap("same", route, OPEN), route);
    assert.equal(offerNotificationTap("same", route, OPEN), null);
    assert.equal(offerNotificationTap("same", route, OPEN), null);
  });

  it("cold-start read + response listener for one tap navigates once", () => {
    // Both observers see the identical response, so both derive the same key.
    const raw = response({ notification_id: 12, type: "booking", action_url: "/bookings/8" });
    const coldStart = readNotificationResponse(raw);
    const listener = readNotificationResponse(raw);
    assert.equal(notificationTapKey(coldStart), notificationTapKey(listener));

    const first = offerNotificationTap(
      notificationTapKey(coldStart),
      resolveTap(raw),
      OPEN,
    );
    const second = offerNotificationTap(
      notificationTapKey(listener),
      resolveTap(raw),
      OPEN,
    );
    assert.deepEqual(first, { pathname: "/bookings/bookings", params: { openId: "8" } });
    assert.equal(second, null);
  });

  it("claims a parked tap so the second observer cannot re-park or re-navigate", () => {
    const raw = response({ notification_id: 1, type: "booking", action_url: "/bookings/2" });
    const key = notificationTapKey(readNotificationResponse(raw));

    assert.equal(offerNotificationTap(key, resolveTap(raw), NOT_READY), null);
    assert.equal(offerNotificationTap(key, resolveTap(raw), OPEN), null);
    // Exactly one destination is parked, and it flushes once.
    assert.deepEqual(flushPendingNotificationTap(OPEN), {
      pathname: "/bookings/bookings",
      params: { openId: "2" },
    });
    assert.equal(flushPendingNotificationTap(OPEN), null);
  });

  it("treats genuinely different notifications as different taps", () => {
    const a = readNotificationResponse(
      response({ notification_id: 1, action_url: "/bookings/1" }, { identifier: "r1" }),
    );
    const b = readNotificationResponse(
      response({ notification_id: 2, action_url: "/bookings/2" }, { identifier: "r2" }),
    );
    assert.notEqual(notificationTapKey(a), notificationTapKey(b));
    assert.ok(offerNotificationTap(notificationTapKey(a), { pathname: "/bookings/bookings" }, OPEN));
    assert.ok(offerNotificationTap(notificationTapKey(b), { pathname: "/bookings/bookings" }, OPEN));
  });

  it("distinguishes notifications even when the SDK gives no identifier", () => {
    const a = readNotificationResponse({
      notification: { request: { content: { data: { action_url: "/bookings/1" } } } },
    });
    const b = readNotificationResponse({
      notification: { request: { content: { data: { action_url: "/bookings/2" } } } },
    });
    assert.notEqual(notificationTapKey(a), notificationTapKey(b));
  });

  it("builds the key independently of payload key order", () => {
    const a = readNotificationResponse(
      response({ type: "booking", action_url: "/bookings/1", notification_id: 5 }),
    );
    const b = readNotificationResponse(
      response({ notification_id: 5, action_url: "/bookings/1", type: "booking" }),
    );
    assert.equal(notificationTapKey(a), notificationTapKey(b));
  });
});

describe("end-to-end tap scenarios", () => {
  const raw = response({
    notification_id: 77,
    type: "payment",
    action_url: "/events/purchases/31",
  });
  const expected = {
    pathname: "/events/purchase-details",
    params: { id: "31" },
  };

  it("Scenario A/B — app open or backgrounded, gate already open", () => {
    const tapped = readNotificationResponse(raw);
    assert.deepEqual(
      offerNotificationTap(notificationTapKey(tapped), resolveTap(raw), OPEN),
      expected,
    );
  });

  it("Scenario C — cold start: parks until auth restores and the router settles", () => {
    const tapped = readNotificationResponse(raw);
    // Launch: navigator not mounted yet.
    assert.equal(
      offerNotificationTap(notificationTapKey(tapped), resolveTap(raw), {
        authed: false,
        ready: false,
      }),
      null,
    );
    // Session restored, but still on splash/login.
    assert.equal(flushPendingNotificationTap({ authed: true, ready: false }), null);
    // Settled on a real screen.
    assert.deepEqual(flushPendingNotificationTap(OPEN), expected);
  });

  it("Scenario D — signed out: parks, then opens after login", () => {
    const tapped = readNotificationResponse(raw);
    assert.equal(
      offerNotificationTap(notificationTapKey(tapped), resolveTap(raw), NO_AUTH),
      null,
    );
    assert.equal(hasPendingNotificationTap(), true);
    assert.deepEqual(flushPendingNotificationTap(OPEN), expected);
  });

  it("Scenario D — stays signed out: never navigates", () => {
    const tapped = readNotificationResponse(raw);
    offerNotificationTap(notificationTapKey(tapped), resolveTap(raw), NO_AUTH);
    for (let i = 0; i < 5; i++) {
      assert.equal(flushPendingNotificationTap(NO_AUTH), null);
    }
    discardPendingNotificationTap();
    assert.equal(flushPendingNotificationTap(OPEN), null);
  });
});
