import { Feather } from "@expo/vector-icons";
import { memo, useMemo, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import type { TicketOrderDetail } from "../../services/ticketOrdersService";
import type { ColumnMeta } from "./ColumnsSheet";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 68;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

type IconName = ComponentProps<typeof Feather>["name"];

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

const ENDED = ["cancelled", "refunded"];

/** Same pill palette as the card list, so both layouts read identically. */
const STATUS_STYLE: Record<string, { wrap: string; text: string; icon: IconName }> = {
  draft: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-800 dark:text-gray-200",
    icon: "clock",
  },
  pending: {
    wrap: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-800 dark:text-yellow-300",
    icon: "clock",
  },
  confirmed: {
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
    icon: "check-circle",
  },
  "checked-in": {
    wrap: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
    icon: "check-circle",
  },
  cancelled: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-800 dark:text-gray-200",
    icon: "x-circle",
  },
  refunded: {
    wrap: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-800 dark:text-purple-300",
    icon: "x-circle",
  },
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

/** A single icon action. Nested Pressable, so it swallows its own touch and the
 *  row's open-details press never fires behind it. */
const ActionIconButton = ({
  icon,
  color,
  label,
  busy = false,
  onPress,
}: {
  icon: IconName;
  color: string;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="h-8 w-8 items-center justify-center rounded-lg active:opacity-60"
  >
    {busy ? (
      <ActivityIndicator size="small" color={color} />
    ) : (
      <Feather name={icon} size={16} color={color} />
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
        className="text-sm font-bold text-gray-900 dark:text-white"
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
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
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
          <Text className="mt-0.5 text-[11px] font-medium text-green-600 dark:text-green-400">
            All checked in
          </Text>
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
          className="text-sm font-bold text-gray-900 dark:text-white"
        >
          {money(o.totalAmount)}
        </Text>
        <Text className="text-[11px] text-gray-500 dark:text-gray-400">
          {money(o.amountPaid)} paid
        </Text>
        {o.remainingBalance > 0 && !ENDED.includes(o.status) && (
          <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
            {money(o.remainingBalance)} due
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
      <Text numberOfLines={1} className={`capitalize ${CELL_TEXT}`}>
        {ctx.methodLabel(o.paymentMethod)}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 140,
    render: (o) => {
      const style = STATUS_STYLE[o.status] ?? STATUS_STYLE.pending;
      return (
        <View className="flex-row">
          <View
            className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${style.wrap}`}
          >
            <Feather name={style.icon} size={11} color="#6B7280" />
            <Text className={`text-[11px] font-medium capitalize ${style.text}`}>
              {o.status.replace("-", " ")}
            </Text>
          </View>
        </View>
      );
    },
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
    width: 110,
    render: (o, ctx) => {
      const canCheckIn =
        !ctx.allCheckedIn(o) && !ENDED.includes(o.status) && o.remainingBalance <= 0;
      return (
        <View className="flex-row items-center gap-0.5">
          <ActionIconButton
            icon="eye"
            color={PRIMARY}
            label={`View order ${o.referenceNumber}`}
            onPress={() => ctx.onView(o)}
          />
          {canCheckIn && (
            <ActionIconButton
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
 * laid out like the web admin's orders table. Horizontally scrollable with fixed
 * column widths (matching GroupInvitesTable/WaiversTable). Rows are inert: order
 * details open from the row's eye action only, so a stray tap while scrolling
 * can't navigate.
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
    <View
      className="mb-3 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: tableWidth }}>
          {/* Header */}
          <View
            className="flex-row items-center border-b border-gray-100 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/60"
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
                  className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
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
