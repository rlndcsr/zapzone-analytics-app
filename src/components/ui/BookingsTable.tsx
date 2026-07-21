import { useMemo } from "react";
import { Text, View } from "react-native";

import type { CalendarBooking } from "../../services/bookingsService";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { StatusBadge } from "./StatusBadge";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** "2026-07-24" -> "Jul 24" (short month + day, matching the web cell). */
function shortDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "16:00" -> "4:00 PM". */
function time12(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  let hour = Number(h);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m ?? "00"} ${meridian}`;
}

/** Title-case a payment method, mirroring the web label transform. */
function paymentMethodLabel(pm: string | null): string {
  return (pm ?? "N/A").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Payment status derived from amounts — identical to the web `derivePaymentStatus`. */
function derivePaymentStatus(
  amountPaid: number,
  totalAmount: number,
): "paid" | "partial" | "pending" {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= totalAmount) return "paid";
  return "partial";
}

// Web paymentColors (method) and paymentStatusColors, mapped to NativeWind pills.
const PAYMENT_METHOD_STYLE: Record<string, string> = {
  card: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  "authorize.net":
    "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  "in-store": "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  paylater:
    "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
};
const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  partial:
    "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  pending: "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300",
  refunded:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  voided: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
};
const PILL_FALLBACK =
  "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300";

const Pill = ({ style, label }: { style: string; label: string }) => (
  <View className="flex-row">
    <View className={`px-2 py-1 rounded-full ${style}`}>
      <Text className={`text-[10px] font-semibold capitalize ${style}`}>
        {label}
      </Text>
    </View>
  </View>
);

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

/**
 * Columns mirror the web `/bookings` default-visible set, in order and label:
 * Conf # · Date/Time · Customer · Package/Room · [Location] · Duration · Guests ·
 * Status · Payment · Pay Status · Paid · Total. Location is company-admin-only,
 * matching the web. Pay Status is derived from the amounts exactly as the web
 * does (derivePaymentStatus); the status badge reuses the app's shared
 * StatusBadge (same styling as the booking cards).
 */
function buildColumns(showLocation: boolean): TableColumn<CalendarBooking>[] {
  const columns: TableColumn<CalendarBooking>[] = [
    {
      key: "id",
      label: "Conf #",
      width: 84,
      render: (b) => (
        <View className="flex-row">
          <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
            #{b.id}
          </Text>
        </View>
      ),
    },
    {
      key: "dateTime",
      label: "Date/Time",
      width: 120,
      render: (b) => (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            {shortDate(b.date)}
          </Text>
          {!!b.time && (
            <Text
              numberOfLines={1}
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            >
              {time12(b.time)}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "customer",
      label: "Customer",
      width: 200,
      render: (b) => (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {b.customerName}
          </Text>
          {!!b.customerEmail && (
            <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400">
              {b.customerEmail}
            </Text>
          )}
          {!!b.customerPhone && (
            <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400">
              {b.customerPhone}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "packageRoom",
      label: "Package/Room",
      width: 180,
      render: (b) => (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-medium text-gray-900 dark:text-white"
          >
            {b.packageName}
          </Text>
          {!!b.roomName && (
            <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400">
              {b.roomName}
            </Text>
          )}
        </View>
      ),
    },
  ];

  if (showLocation) {
    columns.push({
      key: "location",
      label: "Location",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.locationName || "—"}
        </Text>
      ),
    });
  }

  columns.push(
    {
      key: "duration",
      label: "Duration",
      width: 110,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.duration ? `${b.duration} ${b.durationUnit}` : "—"}
        </Text>
      ),
    },
    {
      key: "participants",
      label: "Guests",
      width: 80,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.participants}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (b) => (
        <View className="flex-row">
          <StatusBadge status={b.status} />
        </View>
      ),
    },
    {
      key: "paymentMethod",
      label: "Payment",
      width: 120,
      render: (b) => (
        <Pill
          style={PAYMENT_METHOD_STYLE[b.paymentMethod ?? ""] ?? PILL_FALLBACK}
          label={paymentMethodLabel(b.paymentMethod)}
        />
      ),
    },
    {
      key: "paymentStatus",
      label: "Pay Status",
      width: 110,
      render: (b) => {
        const ps = derivePaymentStatus(b.amountPaid, b.totalAmount);
        return <Pill style={PAYMENT_STATUS_STYLE[ps] ?? PILL_FALLBACK} label={ps} />;
      },
    },
    {
      key: "amountPaid",
      label: "Paid",
      width: 100,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          {money(b.amountPaid)}
        </Text>
      ),
    },
    {
      key: "totalAmount",
      label: "Total",
      width: 100,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {money(b.totalAmount)}
        </Text>
      ),
    },
  );

  return columns;
}

/**
 * Table layout for the bookings list. Thin wrapper over the generic
 * SelectableTable, defining the web-parity booking columns. Renders from the
 * same `CalendarBooking[]` as the card view; tapping a row opens the Booking
 * Details sheet (via onRowPress), the checkbox toggles selection only.
 */
export function BookingsTable({
  bookings,
  showLocation,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
}: {
  bookings: CalendarBooking[];
  showLocation: boolean;
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (booking: CalendarBooking) => void;
}) {
  const columns = useMemo(() => buildColumns(showLocation), [showLocation]);
  return (
    <SelectableTable
      columns={columns}
      rows={bookings}
      rowId={(b) => b.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(b) => `booking for ${b.customerName}`}
    />
  );
}
