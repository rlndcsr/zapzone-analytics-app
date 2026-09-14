import { Text, View } from "react-native";

/**
 * Which web palette to mirror. The web admin does not use one status palette
 * everywhere, so neither can this: "default" is getStatusColor() (New Bookings,
 * Recent Ticket Purchases), "event" is Recent Event Purchases' inline map, and
 * "checkin" is the Check-In / Waivers table's own inline map, which is the odd
 * one out — there a `confirmed` booking is amber ("waiting to be checked in"),
 * not green ("all good"), because green is what checking them in turns it.
 */
export type StatusPalette = "default" | "event" | "checkin";

// getStatusColor() — New Bookings + Recent Ticket Purchases.
const DEFAULT_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "checked-in": "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  cancelled: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  // Waiver record + template statuses (mirrors the web waiver status colors).
  active: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  draft: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  expired: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  replaced: "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300",
  deleted: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  inactive: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
  archived: "bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-gray-500",
  sent: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
};

// Recent Event Purchases' inline map on the web.
const EVENT_STYLES: Record<string, string> = {
  completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  confirmed: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  cancelled: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};

// The Check-In / Waivers table's inline map. Only these two statuses ever
// reach it — the desk filters the day down to confirmed + checked-in — and
// anything else falls through to the shared gray, exactly as on the web.
const CHECKIN_STYLES: Record<string, string> = {
  confirmed: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300",
  "checked-in": "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
};

const FALLBACK = "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300";

const PALETTES: Record<StatusPalette, Record<string, string>> = {
  default: DEFAULT_STYLES,
  event: EVENT_STYLES,
  checkin: CHECKIN_STYLES,
};

const styleFor = (status: string | null | undefined, palette: StatusPalette) =>
  PALETTES[palette][(status ?? "").toLowerCase()] ?? FALLBACK;

/** Pill status badge mirroring the web admin's status colors. */
export function StatusBadge({
  status,
  palette = "default",
  label,
}: {
  status: string | null | undefined;
  palette?: StatusPalette;
  /**
   * Overrides the pill's text. Used as-is, with no capitalization, for the
   * screens whose web counterpart prints the status verbatim rather than
   * title-casing it — passing one is the caller saying "this exact wording",
   * so re-casing it here would just undo them.
   */
  label?: string;
}) {
  const style = styleFor(status, palette);
  return (
    <View className={`px-2 py-1 rounded-full ${style}`}>
      <Text
        className={`text-[10px] font-semibold ${label ? "" : "capitalize"} ${style}`}
      >
        {label ?? status ?? "—"}
      </Text>
    </View>
  );
}
