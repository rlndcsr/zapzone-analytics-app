import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type {
  EventPaymentStatus,
  EventPurchaseRow,
  EventPurchaseStatus,
} from "../../services/eventPurchasesService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Payment-method labels matching the web ("Authorize Net", "In-Store", …).
const METHOD_LABELS: Record<string, string> = {
  "authorize.net": "Authorize Net",
  "in-store": "In-Store",
  paylater: "Pay Later",
  card: "Card",
  cash: "Cash",
};

function prettyMethod(method: string): string {
  if (!method) return "—";
  return (
    METHOD_LABELS[method] ??
    (() => {
      const spaced = method.replace(/_/g, " ");
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    })()
  );
}

/** "…-07-24T…" -> "Jul 24, 2026, 4:00 PM" (created cell). */
function formatDateTime(dateString: string): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Scheduled date (+ optional 12-hour time), mirroring the web scheduled cell. */
function formatScheduled(dateStr: string, timeStr: string | null): string {
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

// Status + payment-status colors match the Event Purchases card badges.
const STATUS_STYLE: Record<EventPurchaseStatus, string> = {
  confirmed: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "checked-in":
    "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  completed: "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
  pending: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  cancelled: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
};

const PAYMENT_STYLE: Record<EventPaymentStatus, string> = {
  paid: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  partial: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  pending: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
  refunded:
    "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  voided: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

const prettyStatus = (s: string) =>
  s === "checked-in" ? "Checked In" : s.charAt(0).toUpperCase() + s.slice(1);

const Pill = ({ style, label }: { style: string; label: string }) => {
  const [bg1, bg2, fg1, fg2] = style.split(" ");
  return (
    <View className="flex-row">
      <View className={`px-2.5 py-1 rounded-full ${bg1} ${bg2}`}>
        <Text className={`text-xs font-semibold ${fg1} ${fg2}`}>{label}</Text>
      </View>
    </View>
  );
};

/**
 * Status cell as a tap-to-change pill — the same pattern as the Manage Accounts
 * / Manage Purchases tables. Tapping defers to the parent's "Set Status" picker
 * sheet (via `onPress`) so the picker style stays consistent app-wide. Nested
 * Pressable, so it swallows its own touch and never opens the row's details.
 */
const StatusPill = ({
  style,
  label,
  onPress,
}: {
  style: string;
  label: string;
  onPress: () => void;
}) => {
  const [bg1, bg2, fg1, fg2] = style.split(" ");
  return (
    <View className="flex-row">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change status, currently ${label}`}
        className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${bg1} ${bg2} active:opacity-70`}
      >
        <Text className={`text-xs font-semibold ${fg1} ${fg2}`}>{label}</Text>
        <Feather name="chevron-down" size={12} color="#6B7280" />
      </Pressable>
    </View>
  );
};

/** A small circular icon button for the Actions column (matches AccountsTable). */
const IconAction = ({
  icon,
  tint,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="w-8 h-8 rounded-full items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
  >
    <Feather name={icon} size={16} color={tint} />
  </Pressable>
);

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

type Handlers = {
  /** Eye icon + row tap — open Purchase Details. */
  onView: (purchase: EventPurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: EventPurchaseRow) => void;
  onDelete: (purchase: EventPurchaseRow) => void;
};

/**
 * Columns mirror the web `/events/purchases` default-visible set, in order and
 * label: Reference · Customer · Event · Qty · Total · Paid · Method · Payment
 * Status · Scheduled · Created · Status · Actions. (Purchase # and Customer Type
 * are `defaultVisible: false` on the web, so they're omitted here too.) The
 * Status cell is a tap-to-change pill and the trailing Actions cell carries the
 * inline View (eye → Details) / Delete controls, matching the web table.
 */
function buildColumns(h: Handlers): TableColumn<EventPurchaseRow>[] {
  return [
  {
    key: "reference",
    label: "Reference",
    width: 130,
    render: (p) => (
      <Text
        numberOfLines={1}
        className="text-xs font-semibold text-[#0644C7] dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded self-start"
      >
        {p.referenceNumber || "—"}
      </Text>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    width: 200,
    render: (p) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {p.customerName}
        </Text>
        {!!p.email && (
          <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400">
            {p.email}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "event",
    label: "Event",
    width: 170,
    render: (p) => (
      <Text
        numberOfLines={1}
        className="text-sm font-medium text-gray-900 dark:text-white"
      >
        {p.eventName}
      </Text>
    ),
  },
  {
    key: "quantity",
    label: "Qty",
    width: 70,
    render: (p) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {p.quantity}
      </Text>
    ),
  },
  {
    key: "total",
    label: "Total",
    width: 100,
    render: (p) => (
      <Text
        numberOfLines={1}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        {money(p.totalAmount)}
      </Text>
    ),
  },
  {
    key: "paid",
    label: "Paid",
    width: 100,
    render: (p) => (
      <Text
        numberOfLines={1}
        className={`text-sm font-medium ${
          p.amountPaid >= p.totalAmount ? "text-green-600" : "text-amber-600"
        }`}
      >
        {money(p.amountPaid)}
      </Text>
    ),
  },
  {
    key: "method",
    label: "Method",
    width: 120,
    render: (p) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {prettyMethod(p.paymentMethod)}
      </Text>
    ),
  },
  {
    key: "paymentStatus",
    label: "Payment Status",
    width: 130,
    render: (p) => (
      <Pill
        style={PAYMENT_STYLE[p.paymentStatus] ?? PAYMENT_STYLE.pending}
        label={prettyStatus(p.paymentStatus)}
      />
    ),
  },
  {
    key: "scheduled",
    label: "Scheduled",
    width: 160,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {p.purchaseDate ? formatScheduled(p.purchaseDate, p.purchaseTime) : "—"}
      </Text>
    ),
  },
  {
    key: "created",
    label: "Created",
    width: 160,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {formatDateTime(p.createdAt)}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 140,
    render: (p) => (
      <StatusPill
        style={STATUS_STYLE[p.status] ?? STATUS_STYLE.pending}
        label={prettyStatus(p.status)}
        onPress={() => h.onStatusPress(p)}
      />
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 110,
    render: (p) => (
      <View className="flex-row items-center gap-0.5">
        <IconAction
          icon="eye"
          tint={PRIMARY}
          label={`View details for ${p.customerName}`}
          onPress={() => h.onView(p)}
        />
        <IconAction
          icon="trash-2"
          tint="#EF4444"
          label={`Delete purchase for ${p.customerName}`}
          onPress={() => h.onDelete(p)}
        />
      </View>
    ),
  },
  ];
}

/**
 * Table layout for the Event Purchases list. Thin wrapper over the generic
 * SelectableTable (same shell as Bookings/Manage Purchases); renders from the
 * same `EventPurchaseRow[]` as the cards, row tap opens details.
 */
export function EventPurchasesTable({
  purchases,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  onStatusPress,
  onDelete,
}: {
  purchases: EventPurchaseRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (purchase: EventPurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: EventPurchaseRow) => void;
  onDelete: (purchase: EventPurchaseRow) => void;
}) {
  const columns = useMemo(
    () => buildColumns({ onView: onRowPress, onStatusPress, onDelete }),
    [onRowPress, onStatusPress, onDelete],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={purchases}
      rowId={(p) => p.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(p) => `purchase for ${p.customerName}`}
    />
  );
}
