import type {
  NotificationRoute,
  PushNotificationData,
} from "./notificationRouteMapper";

/** What has to be true before a protected destination may be opened. */
export type NavigationGate = {
  authed: boolean;
  ready: boolean;
};

export type PendingNotificationTap = {
  key: string;
  route: NotificationRoute;
};

/** The pieces of a tapped notification this app cares about. */
export type TappedNotification = {
  data: PushNotificationData;
  title: string | null;
  body: string | null;
  identifier: string | null;
  date: number | null;
};

const HANDLED_KEY_LIMIT = 50;
const handledKeys = new Set<string>();

let pending: PendingNotificationTap | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Key order is fixed, so the same payload always produces the same string. */
function stableStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = value[key];
    if (entry === undefined || entry === null) continue;
    parts.push(
      `${key}=${typeof entry === "object" ? JSON.stringify(entry) : String(entry)}`,
    );
  }
  return parts.join(",");
}

export function readNotificationResponse(
  response: unknown,
): TappedNotification {
  const notification = asRecord(asRecord(response).notification);
  const request = asRecord(notification.request);
  const content = asRecord(request.content);
  const data = asRecord(content.data);

  return {
    data: {
      notification_id: (data.notification_id ?? null) as number | string | null,
      type: asText(data.type),
      priority: asText(data.priority),
      location_id: (data.location_id ?? null) as number | string | null,
      action_url: asText(data.action_url),
    },
    title: asText(content.title),
    body: asText(content.body),
    identifier: asText(request.identifier),
    date: typeof notification.date === "number" ? notification.date : null,
  };
}

export function notificationTapKey(tapped: TappedNotification): string {
  return [
    tapped.identifier ?? "",
    tapped.date != null ? String(tapped.date) : "",
    stableStringify(tapped.data as unknown as Record<string, unknown>),
  ].join("|");
}

export function isInternalRoute(route: NotificationRoute | null): boolean {
  const pathname = route?.pathname;
  if (typeof pathname !== "string") return false;
  if (!pathname.startsWith("/")) return false;
  // "//host" is protocol-relative and "scheme:" is absolute — neither is ours.
  if (pathname.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(pathname) && !pathname.includes("://");
}

export function offerNotificationTap(
  key: string,
  route: NotificationRoute | null,
  gate: NavigationGate,
): NotificationRoute | null {
  if (handledKeys.has(key)) return null;
  if (!isInternalRoute(route) || !route) return null;

  handledKeys.add(key);
  if (handledKeys.size > HANDLED_KEY_LIMIT) {
    const oldest = handledKeys.values().next().value;
    if (oldest !== undefined) handledKeys.delete(oldest);
  }

  if (gate.authed && gate.ready) return route;

  pending = { key, route };
  return null;
}

export function flushPendingNotificationTap(
  gate: NavigationGate,
): NotificationRoute | null {
  if (!pending) return null;
  if (!gate.authed || !gate.ready) return null;

  const { route } = pending;
  pending = null;
  return route;
}

export function hasPendingNotificationTap(): boolean {
  return pending !== null;
}

export function discardPendingNotificationTap(): void {
  pending = null;
}

/** Full reset. Exists for tests; nothing in the app needs it. */
export function resetNotificationTapState(): void {
  pending = null;
  handledKeys.clear();
}
