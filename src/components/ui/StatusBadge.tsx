import { Text, View } from "react-native";

/** Which web palette to mirror: bookings/tickets ("default") vs events. */
export type StatusPalette = "default" | "event";

// getStatusColor() — New Bookings + Recent Ticket Purchases.
const DEFAULT_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "checked-in": "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  cancelled: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
};

// Recent Event Purchases' inline map on the web.
const EVENT_STYLES: Record<string, string> = {
  completed: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  confirmed: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  cancelled: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};

const FALLBACK = "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300";

const styleFor = (status: string | null | undefined, palette: StatusPalette) => {
  const map = palette === "event" ? EVENT_STYLES : DEFAULT_STYLES;
  return map[(status ?? "").toLowerCase()] ?? FALLBACK;
};

/** Pill status badge mirroring the web admin's status colors. */
export function StatusBadge({
  status,
  palette = "default",
}: {
  status: string | null | undefined;
  palette?: StatusPalette;
}) {
  const style = styleFor(status, palette);
  return (
    <View className={`px-2 py-1 rounded-full ${style}`}>
      <Text className={`text-[10px] font-semibold capitalize ${style}`}>
        {status || "—"}
      </Text>
    </View>
  );
}
