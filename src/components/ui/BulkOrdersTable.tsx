import { Feather } from "@expo/vector-icons";
import { memo, useMemo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  PURCHASE_STATUS_TONE,
  prettyStatus,
} from "../../lib/attractions/purchaseDisplay";
import type { PurchaseStatus } from "../../services/attractionPurchasesService";
import type { TicketOrderDetail } from "../../services/ticketOrdersService";
import type { ColumnMeta } from "./ColumnsSheet";

// Same flat row rhythm as the Manage Attractions table.
const HEADER_MIN_HEIGHT = 44;
const ROW_MIN_HEIGHT = 64;

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Muted second line under a cell's main value (paid, card label). */
const CELL_HINT = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

export const money = (n: number | null | undefined) =>
  `$${Number(n ?? 0).toFixed(2)}`;

export const ENDED_ORDER_STATUSES = ["cancelled", "refunded"];

/**
 * Order status badge — a soft pill with a leading status dot, the same look as
 * the Attractions / Purchases badges. Orders share the purchase palette; a
 * draft reads as neutral. Used by both the table and the card list.
 */
export const OrderStatusBadge = ({ status }: { status: string }) => {
  const tone =
    PURCHASE_STATUS_TONE[status as PurchaseStatus] ??
    PURCHASE_STATUS_TONE.cancelled;
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

type RowContext = {
  /** Order id currently checking in — swaps its action icon for a spinner. */
  checkingInId: number | null;
  onView: (order: TicketOrderDetail) => void;
  onCheckIn: (order: TicketOrderDetail) => void;
  /** Web parity label for the payment method cell. */
  methodLabel: (method: string | null) => string;
  allCheckedIn: (order: TicketOrderDetail) => boolean;
};

/** One button of the Actions segmented group (matches AttractionsTable).
 *  Nested Pressable, so it swallows its own touch. */
const ActionIconButton = ({
  icon,
  color,
  label,
  busy = false,
  divider = false,
  onPress,
}: {
  icon: FeatherIconName;
  color: string;
  label: string;
  busy?: boolean;
  /** Hairline on the leading edge — separates buttons inside the group. */
  divider?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-8 h-8 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
      divider ? "border-l border-gray-200 dark:border-neutral-700" : ""
    }`}
  >
    {busy ? (
      <ActivityIndicator size="small" color={color} />
    ) : (
      <Feather name={icon} size={15} color={color} />
    )}
  </Pressable>
);

type Column = {
  key: string;
  label: string;
  width: number;
  render: (order: TicketOrderDetail, ctx: RowContext) => ReactNode;
};

/**
 * Every column the table can render, keyed like the web `/orders` columns.
 * Which of them show is driven by {@link BULK_ORDER_COLUMN_META} + the caller's
 * visible-key set; the default set matches the web's default-visible columns
 * (Subtotal / Discounts / Fees are `defaultVisible: false` there too). The
 * trailing Actions cell carries the same View / Check In controls as the card.
 */
const COLUMNS: Column[] = [
  {
    key: "reference",
    label: "Order",
    width: 170,
    render: (o) => (
      <Text
        numberOfLines={1}
        className="text-sm font-semibold text-gray-900 dark:text-white"
      >
        {o.referenceNumber || `Order #${o.id}`}
      </Text>
    ),
  },
  {
    key: "customer",
    label: "Customer",
    width: 200,
    render: (o) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {o.customerName}
        </Text>
        {!!o.customerEmail && (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
          >
            {o.customerEmail}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "location",
    label: "Location",
    width: 170,
    render: (o) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {o.locationName || "—"}
      </Text>
    ),
  },
  {
    key: "date",
    label: "Date",
    width: 150,
    render: (o) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {o.purchaseDate || "—"}
      </Text>
    ),
  },
  {
    key: "items",
    label: "Items",
    width: 160,
    render: (o, ctx) => (
      <View>
        <Text numberOfLines={1} className={CELL_TEXT}>
          {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {o.ticketCount}{" "}
          tickets
        </Text>
        {ctx.allCheckedIn(o) && (
          <View className="flex-row items-center gap-1 mt-0.5">
            <Feather name="check" size={11} color="#16A34A" />
            <Text className="text-xs text-green-700 dark:text-green-400">
              All checked in
            </Text>
          </View>
        )}
      </View>
    ),
  },
  {
    key: "total",
    label: "Total",
    width: 130,
    render: (o) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-gray-900 dark:text-white"
        >
          {money(o.totalAmount)}
        </Text>
        {o.remainingBalance > 0 && !ENDED_ORDER_STATUSES.includes(o.status) ? (
          <Text
            numberOfLines={1}
            className="text-xs text-amber-700 dark:text-amber-400 mt-0.5"
          >
            {money(o.remainingBalance)} due
          </Text>
        ) : (
          <Text numberOfLines={1} className={CELL_HINT}>
            {money(o.amountPaid)} paid
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "method",
    label: "Method",
    width: 140,
    render: (o, ctx) => (
      <View>
        <View className="self-start max-w-full px-2 py-1 rounded-md bg-gray-100 dark:bg-neutral-800">
          <Text
            numberOfLines={1}
            className="text-xs font-medium capitalize text-gray-700 dark:text-gray-300"
          >
            {ctx.methodLabel(o.paymentMethod)}
          </Text>
        </View>
        {!!o.cardLabel && (
          <Text numberOfLines={1} className={CELL_HINT}>
            {o.cardLabel}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 140,
    render: (o) => (
      <View className="flex-row">
        <OrderStatusBadge status={o.status} />
      </View>
    ),
  },
  {
    key: "subtotal",
    label: "Subtotal",
    width: 120,
    render: (o) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {money(o.subtotal)}
      </Text>
    ),
  },
  {
    key: "discount",
    label: "Discounts",
    width: 120,
    render: (o) => (
      <Text
        numberOfLines={1}
        className="text-sm text-emerald-700 dark:text-emerald-400"
      >
        −{money(o.discountAmount)}
      </Text>
    ),
  },
  {
    key: "fees",
    label: "Fees",
    width: 110,
    render: (o) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {money(o.feeTotal)}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 100,
    render: (o, ctx) => {
      const canCheckIn =
        !ctx.allCheckedIn(o) &&
        !ENDED_ORDER_STATUSES.includes(o.status) &&
        o.remainingBalance <= 0;
      return (
        // One bordered segmented group, like the Manage Attractions table.
        <View className="flex-row items-center self-start rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
          <ActionIconButton
            icon="eye"
            color="#6B7280"
            label={`View order ${o.referenceNumber}`}
            onPress={() => ctx.onView(o)}
          />
          {canCheckIn && (
            <ActionIconButton
              divider
              icon="check-circle"
              color="#16A34A"
              label={`Check in every ticket on order ${o.referenceNumber}`}
              busy={ctx.checkingInId === o.id}
              onPress={() => ctx.onCheckIn(o)}
            />
          )}
        </View>
      );
    },
  },
];

const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

/**
 * Toggleable columns, in the web Columns dropdown's order and grouping. Order
 * and Actions are locked visible — rows are inert, so without them a row can't
 * be identified or opened.
 */
export const BULK_ORDER_COLUMN_META: ColumnMeta[] = [
  { key: "reference", label: "Order", group: "Identifiers", lockVisible: true },
  { key: "customer", label: "Customer", group: "Customer", lockVisible: false },
  { key: "location", label: "Location", group: "Purchase", lockVisible: false },
  { key: "date", label: "Date", group: "Purchase", lockVisible: false },
  { key: "items", label: "Items", group: "Purchase", lockVisible: false },
  { key: "total", label: "Total", group: "Payment", lockVisible: false },
  { key: "method", label: "Method", group: "Payment", lockVisible: false },
  { key: "subtotal", label: "Subtotal", group: "Payment", lockVisible: false },
  { key: "discount", label: "Discounts", group: "Payment", lockVisible: false },
  { key: "fees", label: "Fees", group: "Payment", lockVisible: false },
  { key: "status", label: "Status", group: "Status", lockVisible: false },
  { key: "actions", label: "Actions", group: "Details", lockVisible: true },
];

/** Columns shown before the user touches the Columns picker (matches the web). */
export const DEFAULT_BULK_ORDER_COLUMNS = [
  "reference",
  "customer",
  "location",
  "date",
  "items",
  "total",
  "method",
  "status",
  "actions",
];

/**
 * Table layout for the Bulk Orders list — the same rows the card list renders,
 * laid out like the web admin's orders table in the flat Manage Attractions
 * style. Horizontally scrollable with fixed column widths. Rows are inert:
 * order details open from the row's eye action only, so a stray tap while
 * scrolling can't navigate.
 */
export const BulkOrdersTable = memo(function BulkOrdersTable({
  orders,
  checkingInId,
  visibleKeys,
  onView,
  onCheckIn,
  methodLabel,
  allCheckedIn,
}: {
  orders: TicketOrderDetail[];
  checkingInId: number | null;
  /** Which columns to render — see {@link BULK_ORDER_COLUMN_META}. */
  visibleKeys: Set<string>;
  onView: (order: TicketOrderDetail) => void;
  onCheckIn: (order: TicketOrderDetail) => void;
  methodLabel: (method: string | null) => string;
  allCheckedIn: (order: TicketOrderDetail) => boolean;
}) {
  // Drive order from the meta list so the Columns picker and the table agree.
  const columns = useMemo(
    () =>
      BULK_ORDER_COLUMN_META.filter(
        (m) => m.lockVisible || visibleKeys.has(m.key),
      )
        .map((m) => COLUMN_BY_KEY.get(m.key))
        .filter((c): c is Column => Boolean(c)),
    [visibleKeys],
  );
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  // Row-independent, so it's built once rather than per row.
  const ctx: RowContext = {
    checkingInId,
    onView,
    onCheckIn,
    methodLabel,
    allCheckedIn,
  };

  return (
    <View className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center border-b border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/50"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {columns.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                <Text
                  numberOfLines={1}
                  className="text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {orders.map((order, i) => (
            <View
              key={order.id}
              className={`flex-row items-center ${
                i < orders.length - 1
                  ? "border-b border-gray-100 dark:border-neutral-800"
                  : ""
              }`}
              style={{ minHeight: ROW_MIN_HEIGHT }}
            >
              {columns.map((col) => (
                <View
                  key={col.key}
                  className="justify-center px-4 py-3"
                  style={{ width: col.width }}
                >
                  {col.render(order, ctx)}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});
