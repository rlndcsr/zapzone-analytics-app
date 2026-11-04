import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  formatMoney,
  formatPurchaseDateTime,
  formatScheduled,
  paymentLabel,
  prettyStatus,
  purchaseStatusTone,
} from "../../lib/attractions/purchaseDisplay";
import type { PurchaseRow } from "../../services/attractionPurchasesService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Muted second line under a cell's main value (card label, time). */
const CELL_HINT = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

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
  const tone = purchaseStatusTone(status);
  return (
    <View className="flex-row">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change status, currently ${prettyStatus(status)}`}
        className={`flex-row items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full ${tone.bg} active:opacity-70`}
      >
        <View className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
        <Text className={`text-xs font-medium ${tone.text}`}>
          {prettyStatus(status)}
        </Text>
        <Feather name="chevron-down" size={12} color={tone.chevron} />
      </Pressable>
    </View>
  );
};

/** One button of the Actions segmented group (matches AttractionsTable). */
const ActionIconButton = ({
  icon,
  color,
  label,
  divider = false,
  onPress,
}: {
  icon: FeatherIconName;
  color: string;
  label: string;
  /** Hairline on the leading edge — separates buttons inside the group. */
  divider?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-8 h-8 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
      divider ? "border-l border-gray-200 dark:border-neutral-700" : ""
    }`}
  >
    <Feather name={icon} size={15} color={color} />
  </Pressable>
);

/**
 * "BULK #1" chip trailing the attraction name when the purchase is one line of
 * a ticket order — the mobile twin of the web Attraction cell's bulk link.
 * Nested Pressable, so tapping it opens the parent order instead of the row's
 * Purchase Details.
 */
const BulkBadge = ({
  linePosition,
  onPress,
}: {
  linePosition: number | null;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={`Item ${linePosition ?? ""} of a bulk order — view the order`}
    className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 active:opacity-70"
  >
    <Text className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
      {linePosition != null ? `Bulk #${linePosition}` : "Bulk"}
    </Text>
  </Pressable>
);

type Handlers = {
  /** Eye icon and row tap — open Purchase Details. */
  onView: (purchase: PurchaseRow) => void;
  /** Pencil icon — open Edit Purchase. */
  onEdit: (purchase: PurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: PurchaseRow) => void;
  onDelete: (purchase: PurchaseRow) => void;
  /** Bulk chip in the Attraction cell — open the parent ticket order. */
  onOpenOrder: (purchase: PurchaseRow) => void;
};

/**
 * Columns mirror the web `/attractions/purchases` default-visible set, in order
 * and label: Customer · Attraction · Quantity · Total · Paid · Payment ·
 * Purchase Date · Scheduled · Status · Actions. (Purchase #, Category and
 * Duration are `defaultVisible: false` on the web, so they're omitted here too.)
 * Paid is green when fully paid, amber otherwise — the same rule the web uses.
 * The Status cell is a tap-to-change pill and the trailing Actions cell carries
 * the inline View (eye → Details) / Edit (pencil → Edit Purchase) / Delete
 * controls, in the same order as the web table.
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
            <Text
              numberOfLines={1}
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            >
              {p.email}
            </Text>
          )}
          {!!p.phone && (
            <Text
              numberOfLines={1}
              className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5"
            >
              {p.phone}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "attraction",
      label: "Attraction",
      width: 220,
      render: (p) => (
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="shrink text-sm font-medium text-gray-900 dark:text-white"
          >
            {p.attractionName}
          </Text>
          {p.ticketOrderId != null && (
            <BulkBadge
              linePosition={p.linePosition}
              onPress={() => h.onOpenOrder(p)}
            />
          )}
        </View>
      ),
    },
    {
      key: "quantity",
      label: "Quantity",
      width: 90,
      render: (p) => (
        <View className="self-start min-w-[28px] h-7 px-1.5 rounded-md bg-gray-100 dark:bg-neutral-800 items-center justify-center">
          <Text
            numberOfLines={1}
            className="text-xs font-semibold text-gray-600 dark:text-gray-300"
          >
            {p.quantity}
          </Text>
        </View>
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
          {formatMoney(p.totalAmount)}
        </Text>
      ),
    },
    {
      key: "paid",
      label: "Paid",
      width: 110,
      render: (p) => {
        const paidInFull = p.amountPaid >= p.totalAmount;
        return (
          <View>
            <Text
              numberOfLines={1}
              className={`text-sm font-medium ${
                paidInFull
                  ? "text-green-700 dark:text-green-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
            >
              {formatMoney(p.amountPaid)}
            </Text>
            {!paidInFull && (
              <Text numberOfLines={1} className={CELL_HINT}>
                {formatMoney(p.totalAmount - p.amountPaid)} due
              </Text>
            )}
          </View>
        );
      },
    },
    {
      key: "paymentMethod",
      label: "Payment",
      width: 130,
      render: (p) => (
        <View>
          <View className="self-start max-w-full px-2 py-1 rounded-md bg-gray-100 dark:bg-neutral-800">
            <Text
              numberOfLines={1}
              className="text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              {paymentLabel(p.paymentMethod)}
            </Text>
          </View>
          {!!p.cardLabel && (
            <Text numberOfLines={1} className={CELL_HINT}>
              {p.cardLabel}
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "purchaseDate",
      label: "Purchase Date",
      width: 170,
      render: (p) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {formatPurchaseDateTime(p.createdAt)}
        </Text>
      ),
    },
    {
      key: "scheduled",
      label: "Scheduled",
      width: 170,
      render: (p) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
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
      width: 132,
      render: (p) => (
        // One bordered segmented group: neutral icons, with only the edit and
        // destructive actions tinted, so the column reads as a single control.
        <View className="flex-row items-center self-start rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
          <ActionIconButton
            icon="eye"
            color="#6B7280"
            label={`View details for ${p.customerName}`}
            onPress={() => h.onView(p)}
          />
          <ActionIconButton
            divider
            icon="edit-2"
            color={PRIMARY}
            label={`Edit purchase for ${p.customerName}`}
            onPress={() => h.onEdit(p)}
          />
          <ActionIconButton
            divider
            icon="trash-2"
            color="#DC2626"
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
 * SelectableTable (in its `flat` look, matching the Manage Attractions table),
 * rendering the web-parity purchase columns from the same `PurchaseRow[]` as
 * the card view. Tapping a row opens Purchase Details, like the eye action and
 * the card view; the checkbox, status pill and action icons are nested
 * Pressables that keep their own touches.
 */
export function PurchasesTable({
  purchases,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onView,
  onEdit,
  onStatusPress,
  onDelete,
  onOpenOrder,
}: {
  purchases: PurchaseRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  /** Eye action and row tap — open Purchase Details. */
  onView: (purchase: PurchaseRow) => void;
  /** Pencil action — open Edit Purchase. */
  onEdit: (purchase: PurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: PurchaseRow) => void;
  onDelete: (purchase: PurchaseRow) => void;
  /** Bulk chip in the Attraction cell — open the purchase's parent order. */
  onOpenOrder: (purchase: PurchaseRow) => void;
}) {
  const columns = useMemo(
    () => buildColumns({ onView, onEdit, onStatusPress, onDelete, onOpenOrder }),
    [onView, onEdit, onStatusPress, onDelete, onOpenOrder],
  );
  return (
    <SelectableTable
      flat
      columns={columns}
      rows={purchases}
      rowId={(p) => p.id}
      onRowPress={onView}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(p) => `purchase for ${p.customerName}`}
    />
  );
}
