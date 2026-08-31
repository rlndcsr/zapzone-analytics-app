/**
 * The tile a notification shows in the list: which glyph, and the tint behind
 * it. Keyed on the notification `type` column, whose values are fixed by the
 * database enum (system, booking, payment, staff, customer, promotion,
 * gift_card, reminder) — so an unknown key means the enum grew, and the
 * fallback keeps the row readable rather than blank.
 */
export type NotificationIconName =
  | "credit-card"
  | "calendar"
  | "users"
  | "user-check"
  | "gift"
  | "tag"
  | "clock"
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
  // Checkout concerns ("Checkout left unfinished") are logged as `customer`.
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

/** Icon and tint for a notification type; falls back to a neutral bell. */
export function notificationIconStyle(
  type: string | null | undefined,
): NotificationIconStyle {
  if (!type) return FALLBACK;
  return BY_TYPE[type.trim().toLowerCase()] ?? FALLBACK;
}
