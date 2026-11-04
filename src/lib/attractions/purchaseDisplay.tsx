import { Text, View } from "react-native";

import { formatDateTimeET } from "../date/venueTime";
import type { PurchaseStatus } from "../../services/attractionPurchasesService";

export { formatMoney } from "./attractionDisplay";

/**
 * Shared presentation primitives for the Manage Purchases list. Both the card
 * view (purchases.tsx) and the table view ({@link PurchasesTable}) render from
 * these helpers so the two layouts stay in lock-step — the purchase twin of
 * `attractionDisplay`.
 */

export function prettyStatus(status: string): string {
  return status === "checked-in"
    ? "Checked In"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

/** Title-case a payment method ("in_store" -> "In store"), like the web cell. */
export function paymentLabel(method: string): string {
  if (!method) return "—";
  const spaced = method.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Purchase instant in venue time — no zone suffix, matching the web page. */
export function formatPurchaseDateTime(dateString: string): string {
  return formatDateTimeET(dateString, { month: "short", showZone: false });
}

/** Scheduled date (+ optional 12-hour time), mirroring the web scheduled cell. */
export function formatScheduled(
  dateStr: string,
  timeStr: string | null,
): string {
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  const datePart = Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  if (!timeStr) return datePart;
  const [hStr, mStr] = timeStr.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${datePart} · ${hour}:${mStr ?? "00"} ${meridian}`;
}

/** Soft pill + status dot colors per purchase status (incl. refunded/voided). */
export const PURCHASE_STATUS_TONE: Record<
  PurchaseStatus,
  { bg: string; dot: string; text: string; chevron: string }
> = {
  confirmed: {
    bg: "bg-blue-50 dark:bg-blue-900/30",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    chevron: "#2563EB",
  },
  "checked-in": {
    bg: "bg-green-50 dark:bg-green-900/30",
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
    chevron: "#16A34A",
  },
  pending: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    chevron: "#D97706",
  },
  cancelled: {
    bg: "bg-gray-100 dark:bg-neutral-800",
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    chevron: "#9CA3AF",
  },
  refunded: {
    bg: "bg-purple-50 dark:bg-purple-900/30",
    dot: "bg-purple-500",
    text: "text-purple-700 dark:text-purple-400",
    chevron: "#7C3AED",
  },
  voided: {
    bg: "bg-red-50 dark:bg-red-900/30",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    chevron: "#DC2626",
  },
};

export const purchaseStatusTone = (status: PurchaseStatus) =>
  PURCHASE_STATUS_TONE[status] ?? PURCHASE_STATUS_TONE.pending;

/** Read-only status badge — a soft pill with a leading status dot, matching
 *  the Attractions status badge. */
export const PurchaseStatusBadge = ({ status }: { status: PurchaseStatus }) => {
  const tone = purchaseStatusTone(status);
  return (
    <View
      className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-full ${tone.bg}`}
    >
      <View className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      <Text className={`text-xs font-medium ${tone.text}`}>
        {prettyStatus(status)}
      </Text>
    </View>
  );
};
