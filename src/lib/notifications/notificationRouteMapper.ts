export type NotificationRoute = {
  pathname: string;
  params?: Record<string, string>;
};

/**
 * The subset of a notification this resolver reads. `AppNotification` (the REST
 * shape, which carries `metadata`) satisfies it structurally, and so does an
 * adapted push payload (which does not) — so one resolver serves both entry
 * points instead of the app growing a second routing scheme.
 */
export type ResolvableNotification = {
  id?: number | string | null;
  type?: string | null;
  action_url?: string | null;
  title?: string | null;
  message?: string | null;
  metadata?: unknown;
};

// Backend notifications don't yet carry a guaranteed entity-linking schema, but
// payloads may include `entity_type` and/or explicit id keys inside `metadata`.
// We read those directly (per-entity key first, then the generic fallbacks)
// rather than guessing, so an explicit id is always preferred when present.
function readId(
  metadata: Record<string, unknown>,
  keys: string[],
): string | null {
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
function readIdFromActionUrl(
  actionUrl: string | null | undefined,
): string | null {
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
 * Reduce a backend `action_url` to a bare, comparable path: drop an absolute
 * origin, the query string, the hash and any trailing slash. The backend sends a
 * relative path today, so the extra tolerance exists only so a future absolute
 * URL can't silently stop matching. Returns null when nothing path-shaped is
 * left, which sends the caller to the type-based fallback.
 */
function normalizeActionPath(
  actionUrl: string | null | undefined,
): string | null {
  if (typeof actionUrl !== "string") return null;
  let path = actionUrl.trim();
  if (!path) return null;

  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(path);
  if (scheme) {
    const afterScheme = path.slice(scheme[0].length);
    const firstSlash = afterScheme.indexOf("/");
    path = firstSlash === -1 ? "" : afterScheme.slice(firstSlash);
  }

  path = path.split("#")[0].split("?")[0].trim();
  if (!path) return null;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");

  return path.toLowerCase();
}

type ActionUrlRule = {
  pattern: RegExp;
  route: (id: string) => NotificationRoute;
};

/**
 * The confirmed backend `action_url` shapes, mapped to this app's actual routes.
 *
 * This table is the PRIMARY signal, because the backend's `type` is too coarse
 * to route on: an attraction purchase and an event purchase are both
 * `type: "payment"`, and nothing in a notification's metadata distinguishes them
 * (`entity_type` is never set on this model). The URL is what identifies the
 * destination, so it is matched first.
 *
 * Ordered most-specific first, so a shorter prefix can never claim a longer path.
 */
const ACTION_URL_RULES: ActionUrlRule[] = [
  {
    pattern: /^\/attractions\/purchases\/(\d+)$/,
    route: (id) => ({
      pathname: "/attractions/purchase-details",
      params: { id },
    }),
  },
  {
    pattern: /^\/events\/purchases\/(\d+)$/,
    route: (id) => ({ pathname: "/events/purchase-details", params: { id } }),
  },
  {
    pattern: /^\/bookings\/(\d+)$/,
    route: (id) => ({ pathname: "/bookings/bookings", params: { openId: id } }),
  },
  {
    pattern: /^\/payments\/(\d+)$/,
    route: (id) => ({ pathname: "/payments/payments", params: { openId: id } }),
  },
  // Location-change notifications are `type: "booking"`, so without this rule
  // they would land on the bookings list instead of the requests screen.
  {
    pattern: /^\/location-change-requests$/,
    route: () => ({ pathname: "/bookings/location-requests" }),
  },
  // `type: "system"` matches no type branch at all, so only the URL can route it.
  {
    pattern: /^\/photos\/delivery-log$/,
    route: () => ({ pathname: "/photos/delivery-log" }),
  },
];

function resolveByActionUrl(
  actionUrl: string | null | undefined,
): NotificationRoute | null {
  const path = normalizeActionPath(actionUrl);
  if (!path) return null;

  for (const rule of ACTION_URL_RULES) {
    const match = rule.pattern.exec(path);
    if (match) return rule.route(match[1] ?? "");
  }
  return null;
}

/**
 * The original type-based resolution, kept as the fallback for notifications
 * whose `action_url` is missing or unrecognized (older rows, and any producer
 * that ships a destination this app doesn't know yet).
 *
 * Returns null when the type is unrecognized, so the caller can fall through to
 * the generic details screen.
 */
function resolveByType(
  notification: ResolvableNotification,
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
  if (
    is("event") &&
    (type.includes("purchase") || entityType.includes("purchase"))
  ) {
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

/**
 * The generic details screen — where a notification with no resolvable
 * destination lands. It renders straight from these params (it performs no
 * fetch), and each one is omitted when absent so an adapted push payload still
 * routes cleanly.
 */
export function notificationDetailsRoute(
  notification: ResolvableNotification,
): NotificationRoute {
  const params: Record<string, string> = {};
  const { id, title, message } = notification;

  if (id !== undefined && id !== null && id !== "") params.id = String(id);
  if (title) params.title = title;
  if (message) params.message = message;

  const pathname = "/notification/notification-details";
  // Omit `params` entirely when empty, so every route this module returns has
  // the same shape as the parameterless ones above.
  return Object.keys(params).length > 0 ? { pathname, params } : { pathname };
}

/**
 * Where tapping a notification should navigate.
 *
 * Resolution order: the backend `action_url` (authoritative — it is the only
 * field that identifies the destination unambiguously), then the legacy
 * type-based rules, then the generic details screen. Always returns a route and
 * never throws, so malformed or partial notification data can only degrade to
 * the details screen.
 */
export function resolveNotificationRoute(
  notification: ResolvableNotification | null | undefined,
): NotificationRoute {
  const source = notification ?? {};
  try {
    return (
      resolveByActionUrl(source.action_url) ??
      resolveByType(source) ??
      notificationDetailsRoute(source)
    );
  } catch {
    return notificationDetailsRoute(source);
  }
}

/**
 * The `data` object the backend attaches to a push message
 * (PushNotificationService::payloadFor). Every key is optional: the backend
 * strips nulls before sending, so none of them is guaranteed to arrive.
 */
export type PushNotificationData = {
  notification_id?: number | string | null;
  type?: string | null;
  priority?: string | null;
  location_id?: number | string | null;
  action_url?: string | null;
};

/**
 * Adapt a push payload into the shape {@link resolveNotificationRoute} reads, so
 * a notification tap resolves through exactly the same rules as the in-app list.
 *
 * A push carries no `metadata`, which is precisely why `action_url` has to be the
 * primary signal: the type-based branches could otherwise only recover an id from
 * the URL. `content` is optional and feeds only the details-screen fallback.
 *
 * Consumed by the tap handler in a later step; nothing calls it yet.
 */
export function pushDataToNotification(
  data: PushNotificationData | null | undefined,
  content?: { title?: string | null; body?: string | null },
): ResolvableNotification {
  const payload = data ?? {};
  return {
    id: payload.notification_id ?? null,
    type: payload.type ?? null,
    action_url: payload.action_url ?? null,
    title: content?.title ?? null,
    message: content?.body ?? null,
  };
}
