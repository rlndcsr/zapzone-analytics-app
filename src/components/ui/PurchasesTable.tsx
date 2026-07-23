import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { PurchaseRow } from "../../services/attractionPurchasesService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Title-case a payment method ("in_store" -> "In Store"), like the web cell. */
function paymentLabel(method: string): string {
  if (!method) return "—";
  const spaced = method.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "…-07-24T…" -> "Jul 24, 2026, 4:00 PM" (purchase-date cell). */
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

// Purchase-specific status colors (includes refunded/voided the shared
// StatusBadge lacks), matching the card's StatusBadge in purchases.tsx.
const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "checked-in":
    "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  pending: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  cancelled: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
  refunded:
    "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  voided: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

const prettyStatus = (s: string) =>
  s === "checked-in" ? "Checked In" : s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Status cell as a tap-to-change pill — the same pattern as the Manage Accounts
 * / Attractions tables. Tapping defers to the parent's "Set Status" picker
 * sheet (via `onPress`) so the picker style stays consistent app-wide. Nested
 * Pressable, so it swallows its own touch and never opens the row's details.
 */
const StatusPill = ({
  status,
  onPress,
}: {
  status: PurchaseRow["status"];
  onPress: () => void;
}) => {
  const cls = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  const [bg1, bg2, fg1, fg2] = cls.split(" ");
  return (
    <View className="flex-row">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change status, currently ${prettyStatus(status)}`}
        className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${bg1} ${bg2} active:opacity-70`}
      >
        <Text className={`text-xs font-semibold ${fg1} ${fg2}`}>
          {prettyStatus(status)}
        </Text>
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
  onView: (purchase: PurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: PurchaseRow) => void;
  onDelete: (purchase: PurchaseRow) => void;
};

/**
 * Columns mirror the web `/attractions/purchases` default-visible set, in order
 * and label: Customer · Attraction · Quantity · Total · Paid · Payment ·
 * Purchase Date · Scheduled · Status · Actions. (Purchase #, Category and
 * Duration are `defaultVisible: false` on the web, so they're omitted here too.)
 * Paid is green when fully paid, amber otherwise — the same rule the web uses.
 * The Status cell is a tap-to-change pill and the trailing Actions cell carries
 * the inline View (eye → Details) / Delete controls, matching the web table.
 */
function buildColumns(h: Handlers): TableColumn<PurchaseRow>[] {
  return [
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
        {!!p.phone && (
          <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400">
            {p.phone}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "attraction",
    label: "Attraction",
    width: 170,
    render: (p) => (
      <Text
        numberOfLines={1}
        className="text-sm font-medium text-gray-900 dark:text-white"
      >
        {p.attractionName}
      </Text>
    ),
  },
  {
    key: "quantity",
    label: "Quantity",
    width: 90,
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
    key: "paymentMethod",
    label: "Payment",
    width: 120,
    render: (p) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {paymentLabel(p.paymentMethod)}
      </Text>
    ),
  },
  {
    key: "purchaseDate",
    label: "Purchase Date",
    width: 170,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {formatDateTime(p.createdAt)}
      </Text>
    ),
  },
  {
    key: "scheduled",
    label: "Scheduled",
    width: 170,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {p.scheduledDate
          ? formatScheduled(p.scheduledDate, p.scheduledTime)
          : "—"}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 140,
    render: (p) => (
      <StatusPill status={p.status} onPress={() => h.onStatusPress(p)} />
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
 * Table layout for the Manage Purchases list. Thin wrapper over the generic
 * SelectableTable (same shell as BookingsTable), rendering the web-parity
 * purchase columns from the same `PurchaseRow[]` as the card view; tapping a row
 * opens Purchase Details (via onRowPress), the checkbox toggles selection only.
 */
export function PurchasesTable({
  purchases,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  onStatusPress,
  onDelete,
}: {
  purchases: PurchaseRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (purchase: PurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: PurchaseRow) => void;
  onDelete: (purchase: PurchaseRow) => void;
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
