import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { CalendarBooking } from "../../services/bookingsService";
import type { ColumnMeta } from "./ColumnsSheet";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

/** Per-row handlers behind the inline action icons. */
export type BookingRowHandlers = {
  /** `$` — record a payment (opens the detail hub). */
  onPayment: (booking: CalendarBooking) => void;
  /** Document — open the Internal Notes editor. */
  onNotes: (booking: CalendarBooking) => void;
  /** Eye — open the full Booking Details. */
  onView: (booking: CalendarBooking) => void;
  /** Pencil — open the edit screen. */
  onEdit: (booking: CalendarBooking) => void;
  /** Trash — delete (parent confirms). */
  onDelete: (booking: CalendarBooking) => void;
  /** Status pill — open the parent-hosted "Set Status" picker. */
  onStatusPress: (booking: CalendarBooking) => void;
};

/** One icon button in the Actions cell. Nested Pressable — owns its own touch. */
const IconAction = ({
  icon,
  tint,
  label,
  filled = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  label: string;
  /** Solid tinted button (used for Delete, as on the web). */
  filled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-7 h-7 items-center justify-center rounded-md active:opacity-60 ${
      filled ? "bg-red-500" : ""
    }`}
  >
    <Feather name={icon} size={14} color={filled ? "#FFFFFF" : tint} />
  </Pressable>
);

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

/** ISO timestamp -> "Jul 24, 2026", or "—" when absent. */
function longDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
function buildColumns(
  showLocation: boolean,
  h: BookingRowHandlers,
): TableColumn<CalendarBooking>[] {
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
      key: "reference",
      label: "Reference #",
      width: 150,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.referenceNumber || "—"}
        </Text>
      ),
    },
    {
      key: "date",
      label: "Date",
      width: 100,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          {shortDate(b.date)}
        </Text>
      ),
    },
    {
      key: "time",
      label: "Time",
      width: 100,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.time ? time12(b.time) : "—"}
        </Text>
      ),
    },
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
      key: "customerName",
      label: "Name",
      width: 170,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {b.customerName}
        </Text>
      ),
    },
    {
      key: "customerEmail",
      label: "Email",
      width: 190,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.customerEmail || "—"}
        </Text>
      ),
    },
    {
      key: "customerPhone",
      label: "Phone",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.customerPhone || "—"}
        </Text>
      ),
    },
    {
      key: "address",
      label: "Address",
      width: 200,
      render: (b) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {b.address || "—"}
        </Text>
      ),
    },
    {
      key: "package",
      label: "Package",
      width: 180,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          {b.packageName}
        </Text>
      ),
    },
    {
      key: "room",
      label: "Room",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.roomName || "—"}
        </Text>
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
      // Tap-to-change status pill — defers to the parent's picker sheet, the
      // mobile stand-in for the web cell's inline <select>.
      key: "status",
      label: "Status",
      width: 140,
      render: (b) => (
        <View className="flex-row">
          <Pressable
            onPress={() => h.onStatusPress(b)}
            accessibilityRole="button"
            accessibilityLabel={`Change status for ${b.customerName}, currently ${b.status}`}
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <StatusBadge status={b.status} />
            <Feather name="chevron-down" size={13} color="#6B7280" />
          </Pressable>
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
    {
      key: "guestOfHonor",
      label: "Guest of Honor",
      width: 160,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.guestOfHonorName || "—"}
        </Text>
      ),
    },
    {
      key: "notes",
      label: "Notes",
      width: 200,
      render: (b) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {b.customerNotes || "—"}
        </Text>
      ),
    },
    {
      key: "specialRequests",
      label: "Special Requests",
      width: 200,
      render: (b) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {b.specialRequests || "—"}
        </Text>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {longDate(b.createdAt)}
        </Text>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {longDate(b.updatedAt)}
        </Text>
      ),
    },
    {
      // Inline row actions, in the web's order: Add Payment (unpaid only),
      // Internal Notes, View Details, Edit, Delete.
      key: "actions",
      label: "Actions",
      width: 164,
      render: (b) => {
        const unpaid = derivePaymentStatus(b.amountPaid, b.totalAmount) !== "paid";
        return (
          <View className="flex-row items-center gap-0.5">
            {unpaid && (
              <IconAction
                icon="dollar-sign"
                tint={PRIMARY}
                label={`Record payment for ${b.customerName}`}
                onPress={() => h.onPayment(b)}
              />
            )}
            <IconAction
              icon="file-text"
              tint="#D97706"
              label={`Internal notes for ${b.customerName}`}
              onPress={() => h.onNotes(b)}
            />
            <IconAction
              icon="eye"
              tint="#374151"
              label={`View details for ${b.customerName}`}
              onPress={() => h.onView(b)}
            />
            <IconAction
              icon="edit-2"
              tint={PRIMARY}
              label={`Edit booking for ${b.customerName}`}
              onPress={() => h.onEdit(b)}
            />
            <IconAction
              icon="trash-2"
              tint="#FFFFFF"
              filled
              label={`Delete booking for ${b.customerName}`}
              onPress={() => h.onDelete(b)}
            />
          </View>
        );
      },
    },
  );

  return columns;
}

/**
 * Column grouping + default visibility for the "Toggle Columns" sheet, matching
 * the web's groups, order, and starting state: Reference #, Address, Guest of
 * Honor, Notes, Special Requests, Created and Updated start hidden.
 */
const COLUMN_META: Record<
  string,
  { group: string; lockVisible?: boolean; defaultHidden?: boolean }
> = {
  id: { group: "Identifiers" },
  reference: { group: "Identifiers", defaultHidden: true },
  date: { group: "Date & Time" },
  time: { group: "Date & Time" },
  duration: { group: "Date & Time" },
  customerName: { group: "Customer", lockVisible: true },
  customerEmail: { group: "Customer" },
  customerPhone: { group: "Customer" },
  address: { group: "Customer", defaultHidden: true },
  package: { group: "Package & Location" },
  room: { group: "Package & Location" },
  location: { group: "Package & Location" },
  participants: { group: "Details" },
  status: { group: "Details" },
  paymentMethod: { group: "Payment" },
  paymentStatus: { group: "Payment" },
  totalAmount: { group: "Payment" },
  amountPaid: { group: "Payment" },
  guestOfHonor: { group: "Additional", defaultHidden: true },
  notes: { group: "Additional", defaultHidden: true },
  specialRequests: { group: "Additional", defaultHidden: true },
  createdAt: { group: "Timestamps", defaultHidden: true },
  updatedAt: { group: "Timestamps", defaultHidden: true },
  actions: { group: "Actions", lockVisible: true },
};

/** Web labels for the toggle list where they differ from the header label. */
const TOGGLE_LABELS: Record<string, string> = {
  id: "Confirmation #",
  customerName: "Name",
  customerEmail: "Email",
  customerPhone: "Phone",
  participants: "Guests",
  paymentMethod: "Method",
  paymentStatus: "Status",
  amountPaid: "Paid",
  totalAmount: "Total",
};

const NOOP_HANDLERS: BookingRowHandlers = {
  onPayment: () => {},
  onNotes: () => {},
  onView: () => {},
  onEdit: () => {},
  onDelete: () => {},
  onStatusPress: () => {},
};

/** Toggleable columns for the sheet, in table order (Actions excluded). */
export const bookingColumns = (showLocation: boolean): ColumnMeta[] =>
  buildColumns(showLocation, NOOP_HANDLERS)
    .filter((c) => c.key !== "actions")
    .map((c) => ({
      key: c.key,
      label: TOGGLE_LABELS[c.key] ?? c.label,
      group: COLUMN_META[c.key]?.group ?? "Columns",
      lockVisible: !!COLUMN_META[c.key]?.lockVisible,
    }));

/** The column keys shown before the user changes anything (web defaults). */
export const defaultBookingColumnKeys = (showLocation: boolean): Set<string> =>
  new Set(
    buildColumns(showLocation, NOOP_HANDLERS)
      .filter((c) => !COLUMN_META[c.key]?.defaultHidden)
      .map((c) => c.key),
  );

/** Every column key, for the sheet's "Show All". */
export const allBookingColumnKeys = (showLocation: boolean): Set<string> =>
  new Set(buildColumns(showLocation, NOOP_HANDLERS).map((c) => c.key));

/**
 * Table layout for the bookings list. Thin wrapper over the generic
 * SelectableTable, defining the web-parity booking columns plus the inline
 * row actions. Rows are inert: Booking Details opens from the eye action only,
 * so the checkbox and the action icons own every touch.
 */
export function BookingsTable({
  bookings,
  showLocation,
  selectedIds,
  onToggleRow,
  onToggleAll,
  handlers,
  visibleColumns,
}: {
  bookings: CalendarBooking[];
  showLocation: boolean;
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  /** Per-row action handlers behind the inline icons. */
  handlers: BookingRowHandlers;
  /**
   * Column keys to render, from the "Columns" sheet. Omit to show them all;
   * locked columns are drawn regardless.
   */
  visibleColumns?: Set<string>;
}) {
  const columns = useMemo(() => {
    const all = buildColumns(showLocation, handlers);
    if (!visibleColumns) return all;
    return all.filter(
      (c) => COLUMN_META[c.key]?.lockVisible || visibleColumns.has(c.key),
    );
  }, [showLocation, handlers, visibleColumns]);

  return (
    <SelectableTable
      columns={columns}
      rows={bookings}
      rowId={(b) => b.id}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(b) => `booking for ${b.customerName}`}
    />
  );
}
