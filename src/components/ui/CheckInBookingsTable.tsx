import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { formatDuration } from "../../lib/time";
import type { CalendarBooking } from "../../services/bookingsService";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { StatusBadge } from "./StatusBadge";

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

/** "18:45" / "18:45:00" -> "6:45 PM". */
function time12(raw: string | null | undefined): string {
  if (!raw) return "—";
  const m = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return "—";
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

/** The two row actions, mirroring the web's green Check In + blue Details. */
export type CheckInRowHandlers = {
  /** Only offered on a `confirmed` booking — a checked-in one has nothing to do. */
  onCheckIn: (booking: CalendarBooking) => void;
  onDetails: (booking: CalendarBooking) => void;
  /** Disables Check In while a check-in is already in flight. */
  busy?: boolean;
};

const ActionButton = ({
  icon,
  label,
  tone,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  tone: "success" | "primary";
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 rounded-lg px-2.5 py-1.5 active:opacity-80 ${
      tone === "success" ? "bg-emerald-600" : "bg-[#0644C7]"
    } ${disabled ? "opacity-50" : ""}`}
  >
    <Feather name={icon} size={13} color="#FFFFFF" />
    <Text className="text-[11px] font-semibold text-white">{label}</Text>
  </Pressable>
);

/**
 * The check-in desk's bookings table — the web Check In page's columns
 * (Reference / Customer, Package, Time, Participants, Status, Actions) on the
 * app's shared table architecture, so it reads like every other table here.
 *
 * No bulk actions, so no checkbox column: rows are acted on one at a time.
 */
export function CheckInBookingsTable({
  rows,
  handlers,
}: {
  rows: CalendarBooking[];
  handlers: CheckInRowHandlers;
}) {
  const { onCheckIn, onDetails, busy } = handlers;

  const columns = useMemo<TableColumn<CalendarBooking>[]>(
    () => [
      {
        key: "customer",
        label: "Reference / Customer",
        width: 230,
        render: (b) => (
          <View>
            <Text className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              #{b.referenceNumber ?? "—"}
            </Text>
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              {b.customerName || "Guest"}
            </Text>
            <Text
              numberOfLines={1}
              className="text-[11px] text-gray-500 dark:text-gray-400"
            >
              Email: {b.customerEmail || "N/A"}
            </Text>
            <Text
              numberOfLines={1}
              className="text-[11px] text-gray-500 dark:text-gray-400"
            >
              Phone: {b.customerPhone || "N/A"}
            </Text>
          </View>
        ),
      },
      {
        key: "package",
        label: "Package",
        width: 180,
        render: (b) => (
          <View>
            <Text
              numberOfLines={2}
              className="text-sm text-gray-900 dark:text-white"
            >
              {b.packageName || "N/A"}
            </Text>
            <Text className="text-[11px] text-gray-500 dark:text-gray-400">
              {money(b.totalAmount)}
            </Text>
          </View>
        ),
      },
      {
        key: "time",
        label: "Time",
        width: 110,
        render: (b) => (
          <View>
            <Text className="text-sm text-gray-900 dark:text-white">
              {time12(b.time)}
            </Text>
            <Text className="text-[11px] text-gray-500 dark:text-gray-400">
              {formatDuration(b.duration, b.durationUnit)}
            </Text>
          </View>
        ),
      },
      {
        key: "participants",
        label: "Participants",
        width: 100,
        render: (b) => (
          <Text className="text-sm text-gray-900 dark:text-white">
            {b.participants}
          </Text>
        ),
      },
      {
        key: "status",
        label: "Status",
        width: 110,
        render: (b) => (
          <View className="flex-row">
            <StatusBadge status={b.status} />
          </View>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        width: 190,
        render: (b) => (
          <View className="flex-row items-center gap-1.5">
            {b.status === "confirmed" && !!b.referenceNumber && (
              <ActionButton
                icon="check-circle"
                label="Check In"
                tone="success"
                disabled={busy}
                onPress={() => onCheckIn(b)}
              />
            )}
            <ActionButton
              icon="eye"
              label="Details"
              tone="primary"
              onPress={() => onDetails(b)}
            />
          </View>
        ),
      },
    ],
    [onCheckIn, onDetails, busy],
  );

  return (
    <SelectableTable
      columns={columns}
      rows={rows}
      rowId={(b) => b.id}
      rowLabel={(b) => `booking for ${b.customerName || "guest"}`}
    />
  );
}
