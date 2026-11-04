import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  PURCHASE_STATUS_TONE,
  formatMoney,
  formatPurchaseDateTime,
  formatScheduled,
  prettyStatus,
} from "../../lib/attractions/purchaseDisplay";
import {
  resolvePaymentState,
  type PaymentState,
} from "../../lib/payments/paymentState";
import type {
  EventPurchaseRow,
  EventPurchaseStatus,
} from "../../services/eventPurchasesService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

/** Muted second line under a cell's main value (card label, balance). */
const CELL_HINT = "text-xs text-gray-400 dark:text-gray-500 mt-0.5";

// Payment-method labels matching the web ("Authorize Net", "In-Store", …).
const METHOD_LABELS: Record<string, string> = {
  "authorize.net": "Authorize Net",
  "in-store": "In-Store",
  paylater: "Pay Later",
  card: "Card",
  cash: "Cash",
};

export function prettyEventMethod(method: string): string {
  if (!method) return "—";
  return (
    METHOD_LABELS[method] ??
    (() => {
      const spaced = method.replace(/_/g, " ");
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    })()
  );
}

type Tone = { bg: string; dot: string; text: string; chevron: string };

// "completed" is event-only, so it gets its own teal tone; every other status
// shares the Manage Purchases palette.
const COMPLETED_TONE: Tone = {
  bg: "bg-teal-50 dark:bg-teal-900/30",
  dot: "bg-teal-500",
  text: "text-teal-700 dark:text-teal-400",
  chevron: "#0D9488",
};

export const eventStatusTone = (status: EventPurchaseStatus): Tone =>
  status === "completed"
    ? COMPLETED_TONE
    : (PURCHASE_STATUS_TONE[status] ?? PURCHASE_STATUS_TONE.pending);

/** A soft pill with a leading status dot — the Attractions / Purchases badge. */
export const DotBadge = ({
  tone,
  label,
}: {
  tone: Pick<Tone, "bg" | "dot" | "text">;
  label: string;
}) => (
  <View
    className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-full ${tone.bg}`}
  >
    <View className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
    <Text numberOfLines={1} className={`text-xs font-medium ${tone.text}`}>
      {label}
    </Text>
  </View>
);

/** Read-only event purchase status badge (card view). */
export const EventStatusBadge = ({
  status,
}: {
  status: EventPurchaseStatus;
}) => <DotBadge tone={eventStatusTone(status)} label={prettyStatus(status)} />;

// Payment-status dot tones. Same colour rule as PaymentStatusBadge /
// resolvePaymentState (paid green, owed red, refunded/voided slate) — only the
// pill shape changes.
const PAYMENT_TONE: Record<PaymentState, Pick<Tone, "bg" | "dot" | "text">> = {
  paid: {
    bg: "bg-green-50 dark:bg-green-900/30",
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
  },
  partial: {
    bg: "bg-red-50 dark:bg-red-900/30",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  pending: {
    bg: "bg-red-50 dark:bg-red-900/30",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  refunded: {
    bg: "bg-slate-100 dark:bg-slate-800/60",
    dot: "bg-slate-400",
    text: "text-slate-700 dark:text-slate-300",
  },
  voided: {
    bg: "bg-slate-100 dark:bg-slate-800/60",
    dot: "bg-slate-400",
    text: "text-slate-700 dark:text-slate-300",
  },
};

/**
 * Status cell as a tap-to-change pill — the same pattern as the Manage Accounts
 * / Manage Purchases tables. Tapping defers to the parent's "Set Status" picker
 * sheet (via `onPress`) so the picker style stays consistent app-wide. Nested
 * Pressable, so it swallows its own touch and never opens the row's details.
 */
const StatusPill = ({
  status,
  onPress,
}: {
  status: EventPurchaseStatus;
  onPress: () => void;
}) => {
  const tone = eventStatusTone(status);
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

type Handlers = {
  /** Eye icon — open Purchase Details. */
  onView: (purchase: EventPurchaseRow) => void;
  /** Pencil icon — open Edit Event Purchase. */
  onEdit: (purchase: EventPurchaseRow) => void;
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
 * inline View (eye → Details) / Edit (pencil → Edit Event Purchase) / Delete
 * controls, in the same order as the web table.
 */
function buildColumns(h: Handlers): TableColumn<EventPurchaseRow>[] {
  return [
    {
      key: "reference",
      label: "Reference",
      width: 130,
      render: (p) => (
        <View className="self-start max-w-full px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30">
          <Text
            numberOfLines={1}
            className="text-xs font-semibold text-[#0644C7] dark:text-blue-300"
          >
            {p.referenceNumber || "—"}
          </Text>
        </View>
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
            <Text
              numberOfLines={1}
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            >
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
      key: "method",
      label: "Method",
      width: 130,
      render: (p) => (
        <View>
          <View className="self-start max-w-full px-2 py-1 rounded-md bg-gray-100 dark:bg-neutral-800">
            <Text
              numberOfLines={1}
              className="text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              {prettyEventMethod(p.paymentMethod)}
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
      key: "paymentStatus",
      label: "Payment Status",
      width: 140,
      // Label and state come from the canonical resolvePaymentState, exactly
      // as PaymentStatusBadge rendered them — only the pill gains a dot.
      render: (p) => {
        const state = resolvePaymentState({
          payment_status: p.paymentStatus,
          total_amount: p.totalAmount,
          amount_paid: p.amountPaid,
        });
        return (
          <View className="flex-row">
            <DotBadge tone={PAYMENT_TONE[state.state]} label={state.label} />
          </View>
        );
      },
    },
    {
      key: "scheduled",
      label: "Scheduled",
      width: 160,
      render: (p) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {p.purchaseDate ? formatScheduled(p.purchaseDate, p.purchaseTime) : "—"}
        </Text>
      ),
    },
    {
      key: "created",
      label: "Created",
      width: 160,
      render: (p) => (
        <Text numberOfLines={1} className={CELL_TEXT}>
          {formatPurchaseDateTime(p.createdAt)}
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
 * Table layout for the Event Purchases list. Thin wrapper over the generic
 * SelectableTable (in its `flat` look, matching the Manage Attractions table),
 * rendering from the same `EventPurchaseRow[]` as the cards. Rows are inert:
 * Purchase Details opens from the row's eye action only, so the checkbox /
 * status pill / actions own every touch and a stray tap can't navigate.
 */
export function EventPurchasesTable({
  purchases,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onView,
  onEdit,
  onStatusPress,
  onDelete,
}: {
  purchases: EventPurchaseRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  /** Eye action — open Purchase Details. */
  onView: (purchase: EventPurchaseRow) => void;
  /** Pencil action — open Edit Event Purchase. */
  onEdit: (purchase: EventPurchaseRow) => void;
  /** Status pill — open the parent-hosted "Set Status" picker sheet. */
  onStatusPress: (purchase: EventPurchaseRow) => void;
  onDelete: (purchase: EventPurchaseRow) => void;
}) {
  const columns = useMemo(
    () => buildColumns({ onView, onEdit, onStatusPress, onDelete }),
    [onView, onEdit, onStatusPress, onDelete],
  );
  return (
    <SelectableTable
      flat
      columns={columns}
      rows={purchases}
      rowId={(p) => p.id}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(p) => `purchase for ${p.customerName}`}
    />
  );
}
