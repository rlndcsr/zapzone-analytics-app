import { Text, View } from "react-native";

import type { PurchaseRow } from "../../services/attractionPurchasesService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

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

const StatusPill = ({ status }: { status: PurchaseRow["status"] }) => {
  const cls = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  const [bg1, bg2, fg1, fg2] = cls.split(" ");
  return (
    <View className="flex-row">
      <View className={`px-2.5 py-1 rounded-full ${bg1} ${bg2}`}>
        <Text className={`text-xs font-semibold ${fg1} ${fg2}`}>
          {prettyStatus(status)}
        </Text>
      </View>
    </View>
  );
};

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

/**
 * Columns mirror the web `/attractions/purchases` default-visible set, in order
 * and label: Customer · Attraction · Quantity · Total · Paid · Payment ·
 * Purchase Date · Scheduled · Status. (Purchase #, Category and Duration are
 * `defaultVisible: false` on the web, so they're omitted here too.) Paid is
 * green when fully paid, amber otherwise — the same rule the web uses.
 */
const COLUMNS: TableColumn<PurchaseRow>[] = [
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
    width: 120,
    render: (p) => <StatusPill status={p.status} />,
  },
];

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
}: {
  purchases: PurchaseRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (purchase: PurchaseRow) => void;
}) {
  return (
    <SelectableTable
      columns={COLUMNS}
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
