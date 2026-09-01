/**
 * The tile a notification shows in the list: which glyph, and the tint behind
 * it.
 *
 * `type` is the primary signal — its values are fixed by the database enum
 * (system, booking, payment, staff, customer, promotion, gift_card, reminder).
 * But that enum is coarser than the list needs: several unrelated alerts are
 * logged as `system`, and would otherwise be one indistinguishable row of grey
 * bells. So a small set of known titles is matched first, mirroring the
 * backend's own title allowlist in PushNotificationService.
 */
export type NotificationIconName =
  | "credit-card"
  | "calendar"
  | "users"
  | "user-check"
  | "gift"
  | "tag"
  | "clock"
  | "zap"
  | "image"
  | "map-pin"
  | "rotate-ccw"
  | "bell";

export type NotificationIconStyle = {
  icon: NotificationIconName;
  /** Glyph colour. */
  color: string;
  /** Tailwind classes for the tile behind it, light and dark. */
  tile: string;
};

const FALLBACK: NotificationIconStyle = {
  icon: "bell",
  color: "#6B7280",
  tile: "bg-gray-100 dark:bg-neutral-800",
};

const BY_TYPE: Record<string, NotificationIconStyle> = {
  payment: {
    icon: "credit-card",
    color: "#059669",
    tile: "bg-emerald-50 dark:bg-emerald-900/25",
  },
  booking: {
    icon: "calendar",
    color: "#2563EB",
    tile: "bg-blue-50 dark:bg-blue-900/25",
  },
  // Checkout concerns and schedule-help requests are logged as `customer`.
  customer: {
    icon: "users",
    color: "#7C3AED",
    tile: "bg-violet-50 dark:bg-violet-900/25",
  },
  staff: {
    icon: "user-check",
    color: "#D97706",
    tile: "bg-amber-50 dark:bg-amber-900/25",
  },
  gift_card: {
    icon: "gift",
    color: "#DB2777",
    tile: "bg-pink-50 dark:bg-pink-900/25",
  },
  promotion: {
    icon: "tag",
    color: "#EA580C",
    tile: "bg-orange-50 dark:bg-orange-900/25",
  },
  reminder: {
    icon: "clock",
    color: "#0891B2",
    tile: "bg-cyan-50 dark:bg-cyan-900/25",
  },
  system: FALLBACK,
};

/**
 * Titles worth their own glyph. Each is a backend-authored constant string, so
 * matching on it is stable — but the lookup is normalised anyway, and anything
 * unlisted simply falls through to the type.
 */
const BY_TITLE: Record<string, NotificationIconStyle> = {
  "overlay schedule conflict": {
    icon: "zap",
    color: "#7C3AED",
    tile: "bg-violet-50 dark:bg-violet-900/25",
  },
  "photo delivery failed": {
    icon: "image",
    color: "#E11D48",
    tile: "bg-rose-50 dark:bg-rose-900/25",
  },
  "location change request": {
    icon: "map-pin",
    color: "#4F46E5",
    tile: "bg-indigo-50 dark:bg-indigo-900/25",
  },
  "location change approved": {
    icon: "map-pin",
    color: "#059669",
    tile: "bg-emerald-50 dark:bg-emerald-900/25",
  },
  "location change rejected": {
    icon: "map-pin",
    color: "#E11D48",
    tile: "bg-rose-50 dark:bg-rose-900/25",
  },
  "payment voided": {
    icon: "rotate-ccw",
    color: "#E11D48",
    tile: "bg-rose-50 dark:bg-rose-900/25",
  },
  "manual refund processed": {
    icon: "rotate-ccw",
    color: "#D97706",
    tile: "bg-amber-50 dark:bg-amber-900/25",
  },
  "manual partial refund processed": {
    icon: "rotate-ccw",
    color: "#D97706",
    tile: "bg-amber-50 dark:bg-amber-900/25",
  },
};

/**
 * Icon and tint for a notification: its title when that title is one the app
 * styles specifically, otherwise its type, otherwise a neutral bell.
 */
export function notificationIconStyle(
  type: string | null | undefined,
  title?: string | null,
): NotificationIconStyle {
  const byTitle = title ? BY_TITLE[title.trim().toLowerCase()] : undefined;
  if (byTitle) return byTitle;
  if (!type) return FALLBACK;
  return BY_TYPE[type.trim().toLowerCase()] ?? FALLBACK;
}
