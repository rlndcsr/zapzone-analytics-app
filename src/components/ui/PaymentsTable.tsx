import { Feather } from "@expo/vector-icons";
import { memo, type ComponentProps, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { PaymentRow } from "../../services/paymentsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

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

/** Icon for the payable type, keyed off the type label (Package / Attraction / Event). */
function typeIcon(typeLabel: string): FeatherName {
  const t = typeLabel.toLowerCase();
  if (t.includes("package")) return "package";
  if (t.includes("attraction")) return "zap";
  if (t.includes("event")) return "calendar";
  if (t.includes("membership")) return "credit-card";
  return "tag";
}

type RowContext = { onView: () => void };

type Column = {
  key: string;
  label: string;
  width: number;
  render: (p: PaymentRow, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "transaction",
    label: "Transaction",
    width: 170,
    render: (p) => (
      <View>
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-[#0644C7] dark:text-blue-300"
        >
          {p.reference}
        </Text>
        <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          ID: {p.id}
        </Text>
      </View>
    ),
  },
  {
    key: "type",
    label: "Type",
    width: 230,
    render: (p) => (
      <View className="flex-row items-center gap-2.5">
        <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
          <Feather name={typeIcon(p.typeLabel)} size={15} color="#0644C7" />
        </View>
        <View className="flex-1">
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {p.payableReference ?? p.reference}
          </Text>
          <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {p.typeLabel}
            {p.countLabel ? ` • ${p.countLabel}` : ""}
          </Text>
        </View>
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
        {!!p.customerEmail && (
          <Text numberOfLines={1} className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {p.customerEmail}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    width: 110,
    render: (p) => (
      <Text numberOfLines={1} className="text-sm font-bold text-gray-900 dark:text-white">
        {money(p.amount)}
      </Text>
    ),
  },
  {
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
  {
    key: "status",
    label: "Status",
    width: 140,
    render: (p) => {
      const s = statusPill(p.status);
      return (
        <View className={`flex-row items-center gap-1 self-start px-2.5 py-1 rounded-full ${s.pill}`}>
          <Feather name={s.icon} size={11} color={MUTED} />
          <Text className={`text-xs font-semibold ${s.text}`}>{p.statusLabel}</Text>
        </View>
      );
    },
  },
  {
    key: "location",
    label: "Location",
    width: 180,
    render: (p) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {p.locationName || "—"}
      </Text>
    ),
  },
  {
    key: "date",
    label: "Date",
    width: 190,
    render: (p) => (
      <Text numberOfLines={2} className={CELL_TEXT}>
        {fmtDateTime(p.createdAt)}
      </Text>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 90,
    render: (_p, ctx) => (
      <Pressable
        onPress={ctx.onView}
        className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="View payment"
      >
        <Feather name="eye" size={15} color="#0644C7" />
      </Pressable>
    ),
  },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Table layout for the Payments list, mirroring the web admin's transactions
 * table: Transaction (ref + ID), Type (icon + payable ref + type/count),
 * Customer, Amount, Method, Status, Location, Date, and a trailing Actions cell
 * (View — the only per-row action available for active payments). Horizontally
 * scrollable with fixed column widths; tapping a row opens the detail sheet.
 */
export const PaymentsTable = memo(function PaymentsTable({
  payments,
  onRowPress,
}: {
  payments: PaymentRow[];
  onRowPress: (p: PaymentRow) => void;
}) {
  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: TABLE_WIDTH }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {COLUMNS.map((col) => (
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
          {payments.map((p, i) => {
            const ctx: RowContext = { onView: () => onRowPress(p) };
            return (
              <Pressable
                key={p.id}
                onPress={() => onRowPress(p)}
                accessibilityRole="button"
                accessibilityLabel={`View payment ${p.reference}`}
                className={`flex-row items-center ${
                  i < payments.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={({ pressed }) => ({
                  minHeight: ROW_MIN_HEIGHT,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {COLUMNS.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(p, ctx)}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
