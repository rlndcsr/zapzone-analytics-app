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
 * The table's columns. Grouped cells mirror the web exactly: Date/Time stacks
 * date + time, Customer stacks name / email / phone / address, and Package/Room
 * stacks the two — each inner line gated by its own visibility key, which is
 * what lets the Columns sheet offer 23 switches over 13 rendered columns. A
 * grouped column drops out entirely once all of its lines are switched off.
 *
 * Order matches the web header row: Conf # · Date/Time · Customer ·
 * Package/Room · [Location] · Duration · Guests · Status · Payment · Pay
 * Status · Paid · Total · Actions, with the default-hidden extras appended.
 */
function buildColumns(
  showLocation: boolean,
  h: BookingRowHandlers,
  vis: (key: string) => boolean,
): TableColumn<CalendarBooking>[] {
  const columns: TableColumn<CalendarBooking>[] = [];

  if (vis("id")) {
    columns.push({
      key: "id",
      label: "Conf #",
      width: 90,
      render: (b) => (
        <View className="flex-row">
          <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
            #{b.id}
          </Text>
        </View>
      ),
    });
  }

  if (vis("reference")) {
    columns.push({
      key: "reference",
      label: "Reference #",
      width: 160,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.referenceNumber || "—"}
        </Text>
      ),
    });
  }

  // Date/Time — one cell with icon-led lines, like the web.
  if (vis("date") || vis("time")) {
    columns.push({
      key: "dateTime",
      label: "Date/Time",
      width: 124,
      render: (b) => (
        <View>
          {vis("date") && (
            <View className="flex-row items-center gap-1">
              <Feather name="calendar" size={11} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="text-sm font-medium text-gray-900 dark:text-white"
              >
                {shortDate(b.date)}
              </Text>
            </View>
          )}
          {vis("time") && !!b.time && (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Feather name="clock" size={11} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="text-xs text-gray-500 dark:text-gray-400"
              >
                {time12(b.time)}
              </Text>
            </View>
          )}
        </View>
      ),
    });
  }

  // Customer — name / email / phone / address stacked in one cell. Name is
  // locked visible, so this column is always present.
  columns.push({
    key: "customer",
    label: "Customer",
    width: 210,
    render: (b) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {b.customerName}
        </Text>
        {vis("customerEmail") && !!b.customerEmail && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            {b.customerEmail}
          </Text>
        )}
        {vis("customerPhone") && !!b.customerPhone && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            {b.customerPhone}
          </Text>
        )}
        {vis("address") && !!b.address && (
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500"
          >
            {b.address}
          </Text>
        )}
      </View>
    ),
  });

  // Package/Room — package in caps with a box icon, room beneath in blue.
  if (vis("package") || vis("room")) {
    columns.push({
      key: "packageRoom",
      label: "Package/Room",
      width: 220,
      render: (b) => (
        <View>
          {vis("package") && (
            <View className="flex-row items-center gap-1">
              <Feather name="package" size={11} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="flex-1 text-xs font-semibold uppercase text-gray-900 dark:text-white"
              >
                {b.packageName}
              </Text>
            </View>
          )}
          {vis("room") && !!b.roomName && (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Feather name="home" size={11} color="#93C5FD" />
              <Text
                numberOfLines={1}
                className="flex-1 text-xs text-[#0644C7] dark:text-blue-300"
              >
                {b.roomName}
              </Text>
            </View>
          )}
        </View>
      ),
    });
  }

  if (showLocation && vis("location")) {
    columns.push({
      key: "location",
      label: "Location",
      width: 170,
      render: (b) => (
        <View className="flex-row items-center gap-1">
          <Feather name="map-pin" size={11} color="#9CA3AF" />
          <Text numberOfLines={1} className={`flex-1 ${CELL_TEXT}`}>
            {b.locationName || "—"}
          </Text>
        </View>
      ),
    });
  }

  if (vis("duration")) {
    columns.push({
      key: "duration",
      label: "Duration",
      width: 120,
      render: (b) => (
        <View className="flex-row items-center gap-1">
          <Feather name="clock" size={11} color="#9CA3AF" />
          <Text numberOfLines={1} className={CELL_TEXT}>
            {b.duration ? `${b.duration} ${b.durationUnit}` : "—"}
          </Text>
        </View>
      ),
    });
  }

  if (vis("participants")) {
    columns.push({
      key: "participants",
      label: "Guests",
      width: 80,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-[#0644C7] dark:text-blue-300"
        >
          {b.participants}
        </Text>
      ),
    });
  }

  if (vis("status")) {
    columns.push({
      // Tap-to-change status pill — defers to the parent's picker sheet, the
      // mobile stand-in for the web cell's inline select.
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
    });
  }

  if (vis("paymentMethod")) {
    columns.push({
      key: "paymentMethod",
      label: "Payment",
      width: 130,
      render: (b) => (
        <Pill
          style={PAYMENT_METHOD_STYLE[b.paymentMethod ?? ""] ?? PILL_FALLBACK}
          label={paymentMethodLabel(b.paymentMethod)}
        />
      ),
    });
  }

  if (vis("paymentStatus")) {
    columns.push({
      key: "paymentStatus",
      label: "Pay Status",
      width: 120,
      render: (b) => {
        const ps = derivePaymentStatus(b.amountPaid, b.totalAmount);
        return (
          <Pill style={PAYMENT_STATUS_STYLE[ps] ?? PILL_FALLBACK} label={ps} />
        );
      },
    });
  }

  if (vis("amountPaid")) {
    columns.push({
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
    });
  }

  if (vis("totalAmount")) {
    columns.push({
      key: "totalAmount",
      label: "Total",
      width: 110,
      render: (b) => (
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {money(b.totalAmount)}
        </Text>
      ),
    });
  }

  if (vis("guestOfHonor")) {
    columns.push({
      key: "guestOfHonor",
      label: "Guest of Honor",
      width: 160,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {b.guestOfHonorName || "—"}
        </Text>
      ),
    });
  }

  if (vis("notes")) {
    columns.push({
      key: "notes",
      label: "Notes",
      width: 200,
      render: (b) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {b.customerNotes || "—"}
        </Text>
      ),
    });
  }

  if (vis("specialRequests")) {
    columns.push({
      key: "specialRequests",
      label: "Special Requests",
      width: 200,
      render: (b) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {b.specialRequests || "—"}
        </Text>
      ),
    });
  }

  if (vis("createdAt")) {
    columns.push({
      key: "createdAt",
      label: "Created",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {longDate(b.createdAt)}
        </Text>
      ),
    });
  }

  if (vis("updatedAt")) {
    columns.push({
      key: "updatedAt",
      label: "Updated",
      width: 140,
      render: (b) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {longDate(b.updatedAt)}
        </Text>
      ),
    });
  }

  columns.push({
    // Inline row actions, in the web's order: Process Payment (unpaid only),
    // Internal Notes, View Details, Edit, Delete.
    key: "actions",
    label: "Actions",
    width: 164,
    render: (b) => {
      const unpaid =
        derivePaymentStatus(b.amountPaid, b.totalAmount) !== "paid";
      return (
        <View className="flex-row items-center gap-0.5">
          {unpaid && (
            <IconAction
              icon="dollar-sign"
              tint={PRIMARY}
              label={`Process payment for ${b.customerName}`}
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
  });

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

/**
 * Toggleable fields for the Columns sheet, in the web's group order. Driven off
 * COLUMN_META rather than the rendered columns, because several of these keys
 * are lines *inside* a grouped cell (email, phone, room …) and never appear as
 * a column of their own.
 */
export const bookingColumns = (showLocation: boolean): ColumnMeta[] =>
  Object.entries(COLUMN_META)
    .filter(([key]) => key !== "actions" && (showLocation || key !== "location"))
    .map(([key, meta]) => ({
      key,
      label: TOGGLE_LABELS[key] ?? key,
      group: meta.group,
      lockVisible: !!meta.lockVisible,
    }));

/** The field keys on before the user changes anything (matches the web). */
export const defaultBookingColumnKeys = (showLocation: boolean): Set<string> =>
  new Set(
    Object.entries(COLUMN_META)
      .filter(
        ([key, meta]) =>
          !meta.defaultHidden && (showLocation || key !== "location"),
      )
      .map(([key]) => key),
  );

/** Every field key, for the sheet's "Show All". */
export const allBookingColumnKeys = (showLocation: boolean): Set<string> =>
  new Set(
    Object.keys(COLUMN_META).filter(
      (key) => showLocation || key !== "location",
    ),
  );

/**
 * Table layout for the bookings list. Thin wrapper over the generic
 * SelectableTable, defining the web-parity booking columns plus the inline
 * row actions. Tapping a row opens Booking Details; the checkbox, status pill
 * and action icons handle their own touches.
 */
export function BookingsTable({
  bookings,
  showLocation,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  handlers,
  visibleColumns,
}: {
  bookings: CalendarBooking[];
  showLocation: boolean;
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  /** Row tap — opens the booking's detail sheet. */
  onRowPress: (booking: CalendarBooking) => void;
  /** Per-row action handlers behind the inline icons. */
  handlers: BookingRowHandlers;
  /**
   * Field keys switched on in the "Columns" sheet. Omit for the default set.
   * Locked fields (Name, Actions) are always treated as visible.
   */
  visibleColumns?: Set<string>;
}) {
  const columns = useMemo(() => {
    const keys = visibleColumns ?? defaultBookingColumnKeys(showLocation);
    const vis = (key: string) =>
      !!COLUMN_META[key]?.lockVisible || keys.has(key);
    return buildColumns(showLocation, handlers, vis);
  }, [showLocation, handlers, visibleColumns]);

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
