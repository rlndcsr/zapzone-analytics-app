import { Feather } from "@expo/vector-icons";
import { memo, useMemo, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { PaymentRow } from "../../services/paymentsService";
import {
  isRefundRecord,
  isVoidRecord,
  originalPaymentId,
} from "../../services/paymentsService";
import type { ColumnMeta } from "./ColumnsSheet";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";
const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";
const MUTED = "#9CA3AF";

type FeatherName = ComponentProps<typeof Feather>["name"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const money = (n: number) => `$${n.toFixed(2)}`;

/** ISO -> "Jul 21, 2026, 10:24 AM" (mirrors the payments screen formatter). */
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  let h = d.getHours();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = `${d.getMinutes()}`.padStart(2, "0");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${h}:${min} ${mer}`;
}

/** Pill classes for a payment status (matches the payments screen). */
function statusPill(status: string): { pill: string; text: string; icon: FeatherName } {
  switch (status) {
    case "completed":
      return {
        pill: "bg-green-100 dark:bg-green-900/40",
        text: "text-green-700 dark:text-green-300",
        icon: "check-circle",
      };
    case "pending":
      return {
        pill: "bg-amber-100 dark:bg-amber-900/40",
        text: "text-amber-700 dark:text-amber-300",
        icon: "clock",
      };
    case "refunded":
    case "voided":
      return {
        pill: "bg-orange-100 dark:bg-orange-900/40",
        text: "text-orange-700 dark:text-orange-300",
        icon: "rotate-ccw",
      };
    case "failed":
      return {
        pill: "bg-red-100 dark:bg-red-900/40",
        text: "text-red-700 dark:text-red-300",
        icon: "x-circle",
      };
    default:
      return {
        pill: "bg-gray-200 dark:bg-neutral-700",
        text: "text-gray-600 dark:text-gray-300",
        icon: "circle",
      };
  }
}

/**
 * Icon for the payable type, keyed off the type label (Package / Attraction /
 * Event / Bulk Order) — the same pairing the web's `payableTypeConfig` uses.
 */
function typeIcon(typeLabel: string): FeatherName {
  const t = typeLabel.toLowerCase();
  if (t.includes("bulk") || t.includes("order")) return "shopping-cart";
  if (t.includes("package")) return "package";
  if (t.includes("attraction")) return "zap";
  if (t.includes("event")) return "calendar";
  if (t.includes("membership")) return "credit-card";
  return "tag";
}

/* ------------------------------------------------------------------ columns -- */

/**
 * Toggleable columns, in the web Columns dropdown's order and grouping.
 * Transaction and Actions are locked visible — without them a row can't be
 * identified or acted on.
 */
export const PAYMENT_COLUMN_META: ColumnMeta[] = [
  { key: "paymentId", label: "Payment ID", group: "Identifiers", lockVisible: false },
  { key: "transaction", label: "Transaction", group: "Identifiers", lockVisible: true },
  { key: "type", label: "Type", group: "Source", lockVisible: false },
  { key: "customer", label: "Customer", group: "Customer", lockVisible: false },
  { key: "amount", label: "Amount", group: "Payment", lockVisible: false },
  { key: "method", label: "Method", group: "Payment", lockVisible: false },
  { key: "status", label: "Status", group: "Status", lockVisible: false },
  { key: "location", label: "Location", group: "Location", lockVisible: false },
  { key: "date", label: "Date", group: "Dates", lockVisible: false },
  { key: "paidAt", label: "Paid At", group: "Dates", lockVisible: false },
  { key: "refundedAt", label: "Refunded At", group: "Dates", lockVisible: false },
  { key: "updatedAt", label: "Updated At", group: "Dates", lockVisible: false },
  { key: "notes", label: "Notes", group: "Details", lockVisible: false },
  { key: "actions", label: "Actions", group: "Details", lockVisible: true },
];

/** Columns shown before the user touches the Columns picker (matches the web). */
export const DEFAULT_PAYMENT_COLUMNS = [
  "transaction",
  "type",
  "customer",
  "amount",
  "method",
  "status",
  "location",
  "date",
  "actions",
];

/** Per-row action callbacks — the trailing Actions cell is the only way in. */
export type PaymentRowActions = {
  onSignature: (p: PaymentRow) => void;
  onInvoice: (p: PaymentRow) => void;
  onMore: (p: PaymentRow) => void;
};

const IconButton = ({
  icon,
  label,
  busy,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="w-8 h-8 rounded-lg items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
  >
    {busy ? (
      <ActivityIndicator size="small" color={PRIMARY} />
    ) : (
      <Feather name={icon} size={15} color="#6B7280" />
    )}
  </Pressable>
);

function buildColumns(
  actions: PaymentRowActions,
  invoiceBusyId: number | null,
): Record<string, TableColumn<PaymentRow>> {
  return {
    paymentId: {
      key: "paymentId",
      label: "Payment ID",
      width: 110,
      render: (p) => <Text className={CELL_TEXT}>#{p.id}</Text>,
    },
    transaction: {
      key: "transaction",
      label: "Transaction",
      width: 190,
      render: (p) => {
        // Refund/void bookkeeping rows point back at the payment they undo.
        const original = originalPaymentId(p.notes);
        const refund = isRefundRecord(p);
        const voided = isVoidRecord(p);
        return (
          <View>
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-[#0644C7] dark:text-blue-300"
            >
              {p.reference}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              ID: {p.id}
              {original && refund ? `  ↩ from #${original}` : ""}
              {original && voided ? `  ✕ from #${original}` : ""}
            </Text>
          </View>
        );
      },
    },
    type: {
      key: "type",
      label: "Type",
      width: 230,
      render: (p) => {
        const refund = isRefundRecord(p);
        const voided = isVoidRecord(p);
        return (
          <View className="flex-row items-center gap-2.5">
            <View
              className={`w-8 h-8 rounded-lg items-center justify-center ${
                refund
                  ? "bg-orange-100 dark:bg-orange-900/30"
                  : voided
                    ? "bg-red-100 dark:bg-red-900/30"
                    : "bg-[#0644C7]/10"
              }`}
            >
              <Feather
                name={refund ? "rotate-ccw" : voided ? "slash" : typeIcon(p.typeLabel)}
                size={15}
                color={refund ? "#EA580C" : voided ? "#DC2626" : PRIMARY}
              />
            </View>
            <View className="flex-1">
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-gray-900 dark:text-white"
              >
                {p.payableReference ?? p.reference}
              </Text>
              <Text
                numberOfLines={1}
                className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
              >
                {p.typeLabel}
                {p.countLabel ? ` • ${p.countLabel}` : ""}
              </Text>
            </View>
          </View>
        );
      },
    },
    customer: {
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
          {!!p.customerEmail && (
            <Text
              numberOfLines={1}
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
            >
              {p.customerEmail}
            </Text>
          )}
        </View>
      ),
    },
    amount: {
      key: "amount",
      label: "Amount",
      width: 110,
      render: (p) => (
        <Text
          numberOfLines={1}
          className="text-sm font-bold text-gray-900 dark:text-white"
        >
          {money(p.amount)}
        </Text>
      ),
    },
    method: {
      key: "method",
      label: "Method",
      width: 170,
      render: (p) => (
        <View className="flex-row items-center gap-1.5">
          <Feather name="credit-card" size={13} color={MUTED} />
          <Text numberOfLines={1} className={`flex-1 ${CELL_TEXT}`}>
            {p.methodLabel}
          </Text>
        </View>
      ),
    },
    status: {
      key: "status",
      label: "Status",
      width: 140,
      render: (p) => {
        const s = statusPill(p.status);
        return (
          <View
            className={`flex-row items-center gap-1 self-start px-2.5 py-1 rounded-full ${s.pill}`}
          >
            <Feather name={s.icon} size={11} color={MUTED} />
            <Text className={`text-xs font-semibold ${s.text}`}>{p.statusLabel}</Text>
          </View>
        );
      },
    },
    location: {
      key: "location",
      label: "Location",
      width: 180,
      render: (p) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {p.locationName || "—"}
        </Text>
      ),
    },
    date: {
      key: "date",
      label: "Date",
      width: 190,
      render: (p) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {fmtDateTime(p.createdAt)}
        </Text>
      ),
    },
    paidAt: {
      key: "paidAt",
      label: "Paid At",
      width: 190,
      render: (p) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {fmtDateTime(p.paidAt)}
        </Text>
      ),
    },
    refundedAt: {
      key: "refundedAt",
      label: "Refunded At",
      width: 190,
      render: (p) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {fmtDateTime(p.refundedAt)}
        </Text>
      ),
    },
    updatedAt: {
      key: "updatedAt",
      label: "Updated At",
      width: 190,
      render: (p) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {fmtDateTime(p.updatedAt)}
        </Text>
      ),
    },
    notes: {
      key: "notes",
      label: "Notes",
      width: 240,
      render: (p) => (
        <Text numberOfLines={2} className={CELL_TEXT}>
          {p.notes || "—"}
        </Text>
      ),
    },
    actions: {
      key: "actions",
      label: "Actions",
      width: 130,
      render: (p) => (
        <View className="flex-row items-center gap-0.5">
          <IconButton
            icon="edit-3"
            label={`View signature and terms for payment ${p.id}`}
            onPress={() => actions.onSignature(p)}
          />
          <IconButton
            icon="download"
            label={`Download invoice for payment ${p.id}`}
            busy={invoiceBusyId === p.id}
            onPress={() => actions.onInvoice(p)}
          />
          <IconButton
            icon="more-vertical"
            label={`More actions for payment ${p.id}`}
            onPress={() => actions.onMore(p)}
          />
        </View>
      ),
    },
  };
}

/**
 * Table layout for the Payments list, mirroring the web admin's transactions
 * table. Built on the shared {@link SelectableTable}, so it gets checkbox
 * selection and the indeterminate header checkbox for free.
 *
 * Rows are deliberately inert: signature, invoice, and the refund / void /
 * details / delete menu are all reached from the trailing Actions cell, so a
 * stray tap while scrolling can't open anything. Which columns render is driven
 * by `visibleKeys` (see {@link PAYMENT_COLUMN_META}).
 */
export const PaymentsTable = memo(function PaymentsTable({
  payments,
  selectedIds,
  onToggleRow,
  onToggleAll,
  visibleKeys,
  actions,
  invoiceBusyId = null,
}: {
  payments: PaymentRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  visibleKeys: Set<string>;
  actions: PaymentRowActions;
  /** Row whose invoice is downloading — swaps its icon for a spinner. */
  invoiceBusyId?: number | null;
}) {
  const columns = useMemo(() => {
    const byKey = buildColumns(actions, invoiceBusyId);
    // Drive order from the meta list so the Columns picker and the table agree.
    return PAYMENT_COLUMN_META.filter(
      (m) => m.lockVisible || visibleKeys.has(m.key),
    )
      .map((m) => byKey[m.key])
      .filter(Boolean);
  }, [actions, visibleKeys, invoiceBusyId]);

  return (
    <SelectableTable
      columns={columns}
      rows={payments}
      rowId={(p) => p.id}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(p) => `payment ${p.reference}`}
    />
  );
});
