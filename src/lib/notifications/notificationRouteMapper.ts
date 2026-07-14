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

// Query-string keys an action_url might use to carry the record id.
const URL_QUERY_ID_KEYS = [
  "id",
  "openId",
  "booking_id",
  "purchase_id",
  "resource_id",
  "model_id",
];

function asRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : {};
}

// Backends often attach a deep link (`action_url`) pointing straight at the
// referenced record, e.g. "/bookings/123" or ".../bookings?openId=123". When
// metadata carries no explicit id, we mine that URL: first any id-like query
// param, then a trailing numeric path segment. Returns null (never throws) when
// nothing id-shaped is present, so callers fall back to the parent module.
function readIdFromActionUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  try {
    const [pathPart, queryPart] = actionUrl.split("?");

    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      for (const key of URL_QUERY_ID_KEYS) {
        const value = params.get(key);
        if (value) return value;
      }
    }

    const segments = pathPart.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && /^\d+$/.test(last)) return last;
  } catch {
    // Malformed URL — fall through to null.
  }
  return null;
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

  // Prefer an explicit id in metadata; fall back to the id embedded in the
  // notification's action_url so we still open the specific record.
  const urlId = readIdFromActionUrl(notification.action_url);
  const pick = (keys: string[]) => readId(meta, keys) ?? urlId;

  const noId = (module: string): NotificationRoute => {
    console.warn(
      `[notifications] "${notification.type}" (#${notification.id}) has no resolvable entity id; opening ${module}`,
    );
    return { pathname: module };
  };

  // Event purchase must be checked before plain "event" (both contain "event").
  if (is("event") && (type.includes("purchase") || entityType.includes("purchase"))) {
    const id = pick(["event_purchase_id", "purchase_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/events/purchase-details", params: { id } }
      : noId("/events/events");
  }

  // Attraction notifications are purchase-based (the detail screen is the
  // attraction purchase). Check before other entities are considered.
  if (is("attraction")) {
    const id = pick([
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
    const id = pick(["booking_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/bookings/bookings", params: { openId: id } }
      : noId("/bookings/bookings");
  }

  if (is("membership")) {
    const id = pick(["membership_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/memberships/memberships", params: { openId: id } }
      : noId("/memberships/memberships");
  }

  if (is("waiver")) {
    const id = pick(["waiver_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/waivers/waivers", params: { openId: id } }
      : noId("/waivers/waivers");
  }

  if (is("customer") || is("contact")) {
    const id = pick(["customer_id", "contact_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/customers/customers", params: { openId: id } }
      : noId("/customers/customers");
  }

  // Plain event reminder — no per-event detail view exists, so open the list.
  if (is("event")) {
    return { pathname: "/events/events" };
  }

  // Payment opens the specific transaction's detail sheet on the Payments module.
  if (is("payment")) {
    const id = pick(["payment_id", "transaction_id", ...GENERIC_ID_KEYS]);
    return id
      ? { pathname: "/payments/payments", params: { openId: id } }
      : noId("/payments/payments");
  }

  if (is("staff") || is("activity")) {
    return { pathname: "/user-managements/activity-logs" };
  }

  return null;
}
