import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  notificationDetailsRoute,
  pushDataToNotification,
  resolveNotificationRoute,
  type NotificationRoute,
  type ResolvableNotification,
} from "./notificationRouteMapper.ts";

// The type-based fallback warns when it cannot find an entity id. That is wanted
// behaviour, but it would bury the test output, so silence it for the suite.
before(() => {
  console.warn = () => {};
});

const DETAILS = "/notification/notification-details";

function route(notification: ResolvableNotification): NotificationRoute {
  return resolveNotificationRoute(notification);
}

describe("action_url routing (primary signal)", () => {
  it("opens a booking on the bookings list via openId", () => {
    assert.deepEqual(route({ type: "booking", action_url: "/bookings/123" }), {
      pathname: "/bookings/bookings",
      params: { openId: "123" },
    });
  });

  it("opens an attraction purchase on its detail screen", () => {
    assert.deepEqual(
      route({ type: "payment", action_url: "/attractions/purchases/123" }),
      { pathname: "/attractions/purchase-details", params: { id: "123" } },
    );
  });

  it("opens an event purchase on its detail screen", () => {
    assert.deepEqual(
      route({ type: "payment", action_url: "/events/purchases/123" }),
      { pathname: "/events/purchase-details", params: { id: "123" } },
    );
  });

  it("opens a payment on the payments module via openId", () => {
    assert.deepEqual(route({ type: "payment", action_url: "/payments/123" }), {
      pathname: "/payments/payments",
      params: { openId: "123" },
    });
  });

  it("opens the location change requests screen", () => {
    assert.deepEqual(
      route({ type: "booking", action_url: "/location-change-requests" }),
      { pathname: "/bookings/location-requests" },
    );
  });

  it("opens the photo delivery log", () => {
    assert.deepEqual(
      route({ type: "system", action_url: "/photos/delivery-log" }),
      { pathname: "/photos/delivery-log" },
    );
  });

  it("beats a conflicting metadata id — the URL is authoritative", () => {
    assert.deepEqual(
      route({
        type: "payment",
        action_url: "/attractions/purchases/77",
        metadata: { payment_id: 999 },
      }),
      { pathname: "/attractions/purchase-details", params: { id: "77" } },
    );
  });
});

describe("action_url normalization", () => {
  it("tolerates a query string", () => {
    assert.deepEqual(route({ action_url: "/bookings/123?from=email" }), {
      pathname: "/bookings/bookings",
      params: { openId: "123" },
    });
  });

  it("tolerates a hash", () => {
    assert.deepEqual(route({ action_url: "/photos/delivery-log#top" }), {
      pathname: "/photos/delivery-log",
    });
  });

  it("tolerates a trailing slash", () => {
    assert.deepEqual(route({ action_url: "/location-change-requests/" }), {
      pathname: "/bookings/location-requests",
    });
  });

  it("tolerates surrounding whitespace", () => {
    assert.deepEqual(route({ action_url: "  /payments/9  " }), {
      pathname: "/payments/payments",
      params: { openId: "9" },
    });
  });

  it("tolerates an absolute URL", () => {
    assert.deepEqual(
      route({ action_url: "https://admin.zap-zone.com/bookings/456" }),
      { pathname: "/bookings/bookings", params: { openId: "456" } },
    );
  });

  it("tolerates a missing leading slash", () => {
    assert.deepEqual(route({ action_url: "bookings/321" }), {
      pathname: "/bookings/bookings",
      params: { openId: "321" },
    });
  });

  it("matches case-insensitively", () => {
    assert.deepEqual(route({ action_url: "/Photos/Delivery-Log" }), {
      pathname: "/photos/delivery-log",
    });
  });

  it("does not treat a non-numeric id as a record id", () => {
    // "/bookings/abc" is not a record link, so it must fall through to the
    // type rules rather than pass "abc" along as an openId.
    assert.deepEqual(route({ type: "booking", action_url: "/bookings/abc" }), {
      pathname: "/bookings/bookings",
    });
  });
});

describe("type fallback (action_url missing or unrecognized)", () => {
  it("falls back to type when action_url is absent", () => {
    assert.deepEqual(route({ type: "booking", metadata: { booking_id: 5 } }), {
      pathname: "/bookings/bookings",
      params: { openId: "5" },
    });
  });

  it("falls back to type when action_url is null", () => {
    assert.deepEqual(
      route({ type: "payment", action_url: null, metadata: { payment_id: 8 } }),
      { pathname: "/payments/payments", params: { openId: "8" } },
    );
  });

  it("falls back to type for an unknown action_url, mining its id", () => {
    assert.deepEqual(
      route({ type: "membership", action_url: "/memberships/42" }),
      { pathname: "/memberships/memberships", params: { openId: "42" } },
    );
  });

  it("falls back to the parent module when no id can be found", () => {
    assert.deepEqual(route({ type: "waiver" }), { pathname: "/waivers/waivers" });
  });

  it("still routes customers, events and activity by type", () => {
    assert.deepEqual(route({ type: "customer", metadata: { customer_id: 3 } }), {
      pathname: "/customers/customers",
      params: { openId: "3" },
    });
    assert.deepEqual(route({ type: "event" }), { pathname: "/events/events" });
    assert.deepEqual(route({ type: "staff" }), {
      pathname: "/user-managements/activity-logs",
    });
  });
});

describe("details fallback and malformed input", () => {
  it("returns the details screen for an unresolvable notification", () => {
    assert.deepEqual(
      route({ id: 12, type: "something_new", title: "Hi", message: "There" }),
      { pathname: DETAILS, params: { id: "12", title: "Hi", message: "There" } },
    );
  });

  it("returns the details screen for an unknown action_url and unknown type", () => {
    assert.deepEqual(
      route({ id: 1, type: "mystery", action_url: "/does/not/exist" }),
      { pathname: DETAILS, params: { id: "1" } },
    );
  });

  it("omits absent details params rather than sending empty strings", () => {
    assert.deepEqual(route({ type: "mystery" }), { pathname: DETAILS });
  });

  for (const malformed of [
    "",
    "   ",
    "?",
    "#",
    "///",
    "://",
    "not a url at all",
    "%%%",
  ]) {
    it(`does not throw on malformed action_url ${JSON.stringify(malformed)}`, () => {
      const result = route({ id: 4, type: "mystery", action_url: malformed });
      assert.equal(typeof result.pathname, "string");
      assert.ok(result.pathname.length > 0);
    });
  }

  it("survives null, undefined and junk notifications", () => {
    assert.equal(resolveNotificationRoute(null).pathname, DETAILS);
    assert.equal(resolveNotificationRoute(undefined).pathname, DETAILS);
    assert.equal(
      resolveNotificationRoute({ metadata: "not-an-object" }).pathname,
      DETAILS,
    );
    assert.equal(
      resolveNotificationRoute({ type: null, action_url: null }).pathname,
      DETAILS,
    );
  });

  it("exposes the details route on its own", () => {
    assert.deepEqual(notificationDetailsRoute({ id: 7 }), {
      pathname: DETAILS,
      params: { id: "7" },
    });
  });
});

describe("regression: the bugs this resolver was rewritten to fix", () => {
  it("payment + /attractions/purchases/123 does NOT resolve to payments", () => {
    const result = route({
      type: "payment",
      action_url: "/attractions/purchases/123",
      metadata: { purchase_id: 123, attraction_id: 9 },
    });
    assert.notEqual(result.pathname, "/payments/payments");
    assert.deepEqual(result, {
      pathname: "/attractions/purchase-details",
      params: { id: "123" },
    });
  });

  it("payment + /events/purchases/123 does NOT resolve to payments", () => {
    const result = route({
      type: "payment",
      action_url: "/events/purchases/123",
      metadata: { purchase_id: 123 },
    });
    assert.notEqual(result.pathname, "/payments/payments");
    assert.deepEqual(result, {
      pathname: "/events/purchase-details",
      params: { id: "123" },
    });
  });

  it("booking + /location-change-requests does NOT resolve to bookings", () => {
    const result = route({
      type: "booking",
      action_url: "/location-change-requests",
      metadata: { request_id: 4 },
    });
    assert.notEqual(result.pathname, "/bookings/bookings");
    assert.deepEqual(result, { pathname: "/bookings/location-requests" });
  });

  it("system + /photos/delivery-log does NOT resolve to notification-details", () => {
    const result = route({
      type: "system",
      action_url: "/photos/delivery-log",
      metadata: { photo_session_id: 2, delivery_id: 3 },
    });
    assert.notEqual(result.pathname, DETAILS);
    assert.deepEqual(result, { pathname: "/photos/delivery-log" });
  });
});

/**
 * Every pushable notification the backend can send, taken from
 * PushNotificationService::PUSHABLE_TITLES and the producers behind each title,
 * so a backend change that alters an action_url shape fails here.
 */
describe("every backend PUSHABLE_TITLE resolves to a real route", () => {
  const cases: {
    title: string;
    type: string;
    action_url: string;
    expected: NotificationRoute;
  }[] = [
    {
      title: "New Booking Received",
      type: "booking",
      action_url: "/bookings/10",
      expected: { pathname: "/bookings/bookings", params: { openId: "10" } },
    },
    {
      title: "Booking Cancelled",
      type: "booking",
      action_url: "/bookings/11",
      expected: { pathname: "/bookings/bookings", params: { openId: "11" } },
    },
    {
      title: "New Attraction Purchase",
      type: "payment",
      action_url: "/attractions/purchases/12",
      expected: {
        pathname: "/attractions/purchase-details",
        params: { id: "12" },
      },
    },
    {
      title: "New Event Purchase",
      type: "payment",
      action_url: "/events/purchases/13",
      expected: { pathname: "/events/purchase-details", params: { id: "13" } },
    },
    {
      title: "Online Payment Received",
      type: "payment",
      action_url: "/payments/14",
      expected: { pathname: "/payments/payments", params: { openId: "14" } },
    },
    {
      title: "Payment Refunded",
      type: "payment",
      action_url: "/payments/15",
      expected: { pathname: "/payments/payments", params: { openId: "15" } },
    },
    {
      title: "Partial Refund Processed",
      type: "payment",
      action_url: "/payments/16",
      expected: { pathname: "/payments/payments", params: { openId: "16" } },
    },
    {
      title: "Manual Refund Processed",
      type: "payment",
      action_url: "/payments/17",
      expected: { pathname: "/payments/payments", params: { openId: "17" } },
    },
    {
      title: "Manual Partial Refund Processed",
      type: "payment",
      action_url: "/payments/18",
      expected: { pathname: "/payments/payments", params: { openId: "18" } },
    },
    {
      title: "Payment Voided",
      type: "payment",
      action_url: "/payments/19",
      expected: { pathname: "/payments/payments", params: { openId: "19" } },
    },
    {
      title: "Location Change Request",
      type: "booking",
      action_url: "/location-change-requests",
      expected: { pathname: "/bookings/location-requests" },
    },
    {
      title: "Location Change Approved",
      type: "booking",
      action_url: "/bookings/20",
      expected: { pathname: "/bookings/bookings", params: { openId: "20" } },
    },
    {
      title: "Location Change Rejected",
      type: "booking",
      action_url: "/bookings/21",
      expected: { pathname: "/bookings/bookings", params: { openId: "21" } },
    },
    {
      title: "Photo delivery failed",
      type: "system",
      action_url: "/photos/delivery-log",
      expected: { pathname: "/photos/delivery-log" },
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.title} → ${testCase.expected.pathname}`, () => {
      assert.deepEqual(
        route({ type: testCase.type, action_url: testCase.action_url }),
        testCase.expected,
      );
      assert.notEqual(route({ ...testCase }).pathname, DETAILS);
    });
  }
});

describe("push payload adapter", () => {
  it("resolves a push payload through the same rules", () => {
    const notification = pushDataToNotification({
      notification_id: 55,
      type: "payment",
      priority: "medium",
      location_id: 2,
      action_url: "/attractions/purchases/88",
    });
    assert.deepEqual(resolveNotificationRoute(notification), {
      pathname: "/attractions/purchase-details",
      params: { id: "88" },
    });
  });

  it("carries the notification content into the details fallback", () => {
    const notification = pushDataToNotification(
      { notification_id: 9, type: "mystery" },
      { title: "Heads up", body: "Something happened" },
    );
    assert.deepEqual(resolveNotificationRoute(notification), {
      pathname: DETAILS,
      params: { id: "9", title: "Heads up", message: "Something happened" },
    });
  });

  it("handles an empty or absent data payload", () => {
    assert.equal(
      resolveNotificationRoute(pushDataToNotification({})).pathname,
      DETAILS,
    );
    assert.equal(
      resolveNotificationRoute(pushDataToNotification(null)).pathname,
      DETAILS,
    );
    assert.equal(
      resolveNotificationRoute(pushDataToNotification(undefined)).pathname,
      DETAILS,
    );
  });

  it("carries no metadata, so type rules can only mine the URL", () => {
    const notification = pushDataToNotification({
      type: "membership",
      action_url: "/memberships/31",
    });
    assert.equal(notification.metadata, undefined);
    assert.deepEqual(resolveNotificationRoute(notification), {
      pathname: "/memberships/memberships",
      params: { openId: "31" },
    });
  });
});
