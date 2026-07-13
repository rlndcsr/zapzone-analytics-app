import type { AppNotification } from "../../services/notificationService";

export type NotificationRoute = {
  pathname: string;
  params?: Record<string, string>;
};

// Backend notifications don't yet carry a guaranteed entity-linking schema, but
// payloads may include `entity_type` and/or explicit id keys inside `metadata`.
// We read those directly (per-entity key first, then the generic fallbacks)
// rather than guessing, so an explicit id is always preferred when present.
function readId(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }
  return null;
}

const GENERIC_ID_KEYS = ["resource_id", "model_id", "id"];

function asRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : {};
}

/**
 * Resolves where tapping a notification should navigate, preferring the
 * specific referenced record over the parent module.
 *
 * - When an explicit entity id is found, returns a route that opens that record
 *   directly (a detail route for purchases, or the module route + `openId` for
 *   modules whose detail is a bottom sheet).
 * - When the type is recognized but no id is present, returns the parent module
 *   route (no id) and logs the gap for debugging.
 * - When the type is unrecognized, returns null so the caller can fall back to
 *   the generic notification-details screen. Never throws.
 */
export function resolveNotificationRoute(
  notification: AppNotification,
): NotificationRoute | null {
  const type = (notification.type || "").toLowerCase();
  const meta = asRecord(notification.metadata);
  const entityType = String(meta.entity_type ?? "").toLowerCase();
  const is = (needle: string) =>
    type.includes(needle) || entityType.includes(needle);

  const noId = (module: string): NotificationRoute => {
    console.warn(
      `[notifications] "${notification.type}" (#${notification.id}) has no resolvable entity id; opening ${module}`,
    );
    return { pathname: module };
  };

  // Event purchase must be checked before plain "event" (both contain "event").
  if (is("event") && (type.includes("purchase") || entityType.includes("purchase"))) {
    const id = readId(meta, ["event_purchase_id", "purchase_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/events/purchase-details", params: { id } }
      : noId("/events/events");
  }

  // Attraction notifications are purchase-based (the detail screen is the
  // attraction purchase). Check before other entities are considered.
  if (is("attraction")) {
    const id = readId(meta, [
      "attraction_purchase_id",
      "purchase_id",
      "attraction_id",
      ...GENERIC_ID_KEYS,
    ]);
    return id
      ? { pathname: "/attractions/purchase-details", params: { id } }
      : noId("/attractions/attractions");
  }

  if (is("booking")) {
    const id = readId(meta, ["booking_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/bookings/bookings", params: { openId: id } }
      : noId("/bookings/bookings");
  }

  if (is("membership")) {
    const id = readId(meta, ["membership_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/memberships/memberships", params: { openId: id } }
      : noId("/memberships/memberships");
  }

  if (is("waiver")) {
    const id = readId(meta, ["waiver_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/waivers/waivers", params: { openId: id } }
      : noId("/waivers/waivers");
  }

  if (is("customer") || is("contact")) {
    const id = readId(meta, ["customer_id", "contact_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/customers/customers", params: { openId: id } }
      : noId("/customers/customers");
  }

  // Plain event reminder — no per-event detail view exists, so open the list.
  if (is("event")) {
    return { pathname: "/events/events" };
  }

  // Payment has no dedicated detail screen today; open the Payments module.
  if (is("payment")) {
    return { pathname: "/payments/payments" };
  }

  if (is("staff") || is("activity")) {
    return { pathname: "/user-managements/activity-logs" };
  }

  return null;
}
