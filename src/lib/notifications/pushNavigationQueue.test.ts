import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  pushDataToNotification,
  resolveNotificationRoute,
  type NotificationRoute,
} from "./notificationRouteMapper.ts";
import {
  claimPendingNotificationTap,
  discardPendingNotificationTap,
  hasPendingNotificationTap,
  isInternalRoute,
  notificationTapKey,
  offerNotificationTap,
  readNotificationResponse,
  resetNotificationTapState,
  settlePendingNotificationTap,
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

/**
 * One run of the delivery effect in components/PushNotificationRouter.tsx, so
 * these tests exercise the same order of operations the app does.
 *
 * @param pathname Where the app currently is.
 * @returns The route handed to the navigator on this run, if any.
 */
function deliveryEffect(
  gate: NavigationGate,
  pathname: string,
): NotificationRoute | null {
  if (!gate.authed || !gate.ready) return null;
  if (settlePendingNotificationTap(pathname)) return null;
  const route = claimPendingNotificationTap(gate);
  if (!route) return null;
  settlePendingNotificationTap(pathname);
  return route;
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

  it("never parks or navigates to an external route even if one is offered", () => {
    const offered = offerNotificationTap("k", {
      pathname: "https://evil.example.com",
    });
    assert.equal(offered, false);
    assert.equal(hasPendingNotificationTap(), false);
    assert.equal(deliveryEffect(OPEN, "/home"), null);
  });
});

describe("authentication and router gating", () => {
  const route = { pathname: "/bookings/bookings", params: { openId: "1" } };

  it("navigates on the next delivery run when authed and ready", () => {
    assert.equal(offerNotificationTap("k", route), true);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
  });

  it("does not navigate while unauthenticated — it parks", () => {
    offerNotificationTap("k", route);
    assert.equal(deliveryEffect(NO_AUTH, "/home"), null);
    assert.equal(hasPendingNotificationTap(), true);
  });

  it("does not navigate while the router is not ready — it parks", () => {
    offerNotificationTap("k", route);
    assert.equal(deliveryEffect(NOT_READY, "/splash"), null);
    assert.equal(hasPendingNotificationTap(), true);
  });

  it("keeps the destination parked until BOTH conditions hold", () => {
    offerNotificationTap("k", route);
    assert.equal(claimPendingNotificationTap({ authed: true, ready: false }), null);
    assert.equal(claimPendingNotificationTap({ authed: false, ready: true }), null);
    assert.equal(hasPendingNotificationTap(), true);

    assert.deepEqual(claimPendingNotificationTap(OPEN), route);
  });

  it("holds the destination until the app is confirmed to be on it", () => {
    offerNotificationTap("k", route);
    assert.deepEqual(claimPendingNotificationTap(OPEN), route);
    // Handed to the navigator, but not yet arrived — still ours.
    assert.equal(hasPendingNotificationTap(), true);
    assert.equal(settlePendingNotificationTap("/home"), false);

    assert.equal(settlePendingNotificationTap("/bookings/bookings"), true);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("settles on the destination path whatever the params or trailing slash", () => {
    offerNotificationTap("k", route);
    claimPendingNotificationTap(OPEN);
    assert.equal(settlePendingNotificationTap("/bookings/bookings/"), true);
  });

  it("never settles a destination that was never handed over", () => {
    offerNotificationTap("k", route);
    // Sitting on the target already is not delivery: the params are the point.
    assert.equal(settlePendingNotificationTap("/bookings/bookings"), false);
    assert.equal(hasPendingNotificationTap(), true);
  });

  it("navigates a notification for the screen already open, then settles", () => {
    offerNotificationTap("k", route);
    // No route change follows a params-only update, so the delivery run has to
    // settle it itself or it would linger and re-fire later.
    assert.deepEqual(deliveryEffect(OPEN, "/bookings/bookings"), route);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("delivers exactly once when nothing interferes", () => {
    offerNotificationTap("k", route);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    // The app arrives, and every later route change is a no-op.
    assert.equal(deliveryEffect(OPEN, "/bookings/bookings"), null);
    assert.equal(deliveryEffect(OPEN, "/home"), null);
    assert.equal(deliveryEffect(OPEN, "/customers/customers"), null);
  });

  it("running delivery with nothing parked is a harmless no-op", () => {
    assert.equal(deliveryEffect(OPEN, "/home"), null);
    assert.equal(claimPendingNotificationTap(OPEN), null);
    assert.equal(settlePendingNotificationTap("/home"), false);
  });

  it("drops a parked destination on sign-out or account change", () => {
    offerNotificationTap("k", route);
    discardPendingNotificationTap();
    assert.equal(hasPendingNotificationTap(), false);
    assert.equal(deliveryEffect(OPEN, "/home"), null);
  });

  it("cannot revive a discarded tap by re-offering it", () => {
    offerNotificationTap("k", route);
    discardPendingNotificationTap();
    assert.equal(offerNotificationTap("k", route), false);
    assert.equal(hasPendingNotificationTap(), false);
  });
});

describe("surviving the startup redirect chain", () => {
  const route = { pathname: "/notification/notification-details", params: { id: "8" } };

  it("re-opens the destination when a launch redirect replaces it", () => {
    offerNotificationTap("k", route);

    // The gate opens as the launch chain lands on Home: the destination opens…
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    // …and a startup replace() drops us back onto the login route.
    assert.equal(deliveryEffect(NOT_READY, "/"), null);
    assert.equal(hasPendingNotificationTap(), true);
    // The redirect completes, and the destination is opened again rather than
    // being lost — this is the cold-start bug.
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    assert.equal(deliveryEffect(OPEN, route.pathname), null);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("gives up after a bounded number of attempts", () => {
    offerNotificationTap("k", route);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    // Whatever is fighting us is not the launch chain — stop, don't loop.
    assert.equal(deliveryEffect(OPEN, "/home"), null);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("spends no attempt while the gate is shut", () => {
    offerNotificationTap("k", route);
    for (let i = 0; i < 10; i++) {
      assert.equal(deliveryEffect(NOT_READY, "/splash"), null);
      assert.equal(deliveryEffect(NO_AUTH, "/home"), null);
    }
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
  });
});

describe("duplicate tap prevention", () => {
  const route = { pathname: "/payments/payments", params: { openId: "4" } };

  it("navigates once when the same key is offered twice", () => {
    assert.equal(offerNotificationTap("same", route), true);
    assert.equal(offerNotificationTap("same", route), false);
    assert.equal(offerNotificationTap("same", route), false);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), route);
    assert.equal(deliveryEffect(OPEN, route.pathname), null);
  });

  it("cold-start read + response listener for one tap navigates once", () => {
    // Both observers see the identical response, so both derive the same key.
    const raw = response({ notification_id: 12, type: "booking", action_url: "/bookings/8" });
    const coldStart = readNotificationResponse(raw);
    const listener = readNotificationResponse(raw);
    assert.equal(notificationTapKey(coldStart), notificationTapKey(listener));

    assert.equal(offerNotificationTap(notificationTapKey(coldStart), resolveTap(raw)), true);
    assert.equal(offerNotificationTap(notificationTapKey(listener), resolveTap(raw)), false);

    assert.deepEqual(deliveryEffect(OPEN, "/home"), {
      pathname: "/bookings/bookings",
      params: { openId: "8" },
    });
    assert.equal(deliveryEffect(OPEN, "/bookings/bookings"), null);
  });

  it("claims a parked tap so the second observer cannot re-park it", () => {
    const raw = response({ notification_id: 1, type: "booking", action_url: "/bookings/2" });
    const key = notificationTapKey(readNotificationResponse(raw));

    assert.equal(offerNotificationTap(key, resolveTap(raw)), true);
    assert.equal(offerNotificationTap(key, resolveTap(raw)), false);
    // Exactly one destination is parked, and it opens once.
    assert.deepEqual(deliveryEffect(OPEN, "/home"), {
      pathname: "/bookings/bookings",
      params: { openId: "2" },
    });
    assert.equal(deliveryEffect(OPEN, "/bookings/bookings"), null);
  });

  it("treats genuinely different notifications as different taps", () => {
    const a = readNotificationResponse(
      response({ notification_id: 1, action_url: "/bookings/1" }, { identifier: "r1" }),
    );
    const b = readNotificationResponse(
      response({ notification_id: 2, action_url: "/bookings/2" }, { identifier: "r2" }),
    );
    assert.notEqual(notificationTapKey(a), notificationTapKey(b));
    assert.ok(offerNotificationTap(notificationTapKey(a), { pathname: "/bookings/bookings" }));
    assert.deepEqual(deliveryEffect(OPEN, "/home"), { pathname: "/bookings/bookings" });
    assert.ok(offerNotificationTap(notificationTapKey(b), { pathname: "/bookings/bookings" }));
    assert.deepEqual(deliveryEffect(OPEN, "/home"), { pathname: "/bookings/bookings" });
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

  /** Park a tap the way the response listener / cold-start read does. */
  function tap(source: unknown = raw) {
    const tapped = readNotificationResponse(source);
    return offerNotificationTap(notificationTapKey(tapped), resolveTap(source));
  }

  it("Scenario A/B — app open or backgrounded, gate already open", () => {
    assert.equal(tap(), true);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), expected);
    assert.equal(deliveryEffect(OPEN, expected.pathname), null);
  });

  it("Scenario C — cold start: opens the destination through the whole launch", () => {
    // The launch reads the tap back before the navigator has mounted.
    assert.equal(tap(), true);
    // splash, then the login route: the gate is shut on both.
    assert.equal(deliveryEffect({ authed: true, ready: false }, "/splash"), null);
    assert.equal(deliveryEffect({ authed: true, ready: false }, "/"), null);
    // The launch chain lands on Home and the destination opens.
    assert.deepEqual(deliveryEffect(OPEN, "/home"), expected);
    // It is only forgotten once the app is actually there.
    assert.equal(hasPendingNotificationTap(), true);
    assert.equal(deliveryEffect(OPEN, expected.pathname), null);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("Scenario C — cold start survives a late startup replace to Home", () => {
    assert.equal(tap(), true);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), expected);
    // A launch replace() lands on the screen we just opened and swaps it out.
    assert.deepEqual(deliveryEffect(OPEN, "/home"), expected);
    assert.equal(deliveryEffect(OPEN, expected.pathname), null);
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("Scenario D — signed out: parks, then opens after login", () => {
    assert.equal(tap(), true);
    assert.equal(deliveryEffect(NO_AUTH, "/"), null);
    assert.equal(hasPendingNotificationTap(), true);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), expected);
  });

  it("Scenario D — stays signed out: never navigates", () => {
    tap();
    for (let i = 0; i < 5; i++) {
      assert.equal(deliveryEffect(NO_AUTH, "/"), null);
    }
    // Sign-out / account change teardown.
    discardPendingNotificationTap();
    assert.equal(deliveryEffect(OPEN, "/home"), null);
  });

  it("Scenario E — normal launch with no notification navigates nothing", () => {
    for (const pathname of ["/splash", "/", "/home", "/bookings/bookings"]) {
      assert.equal(deliveryEffect(OPEN, pathname), null);
    }
    assert.equal(hasPendingNotificationTap(), false);
  });

  it("Scenario F — a second notification after the first is delivered", () => {
    assert.equal(tap(), true);
    assert.deepEqual(deliveryEffect(OPEN, "/home"), expected);
    assert.equal(deliveryEffect(OPEN, expected.pathname), null);

    const second = response(
      { notification_id: 78, type: "booking", action_url: "/bookings/4" },
      { identifier: "req-2" },
    );
    assert.equal(tap(second), true);
    assert.deepEqual(deliveryEffect(OPEN, expected.pathname), {
      pathname: "/bookings/bookings",
      params: { openId: "4" },
    });
    assert.equal(deliveryEffect(OPEN, "/bookings/bookings"), null);
    // And neither tap can be replayed.
    assert.equal(tap(), false);
    assert.equal(tap(second), false);
  });
});
