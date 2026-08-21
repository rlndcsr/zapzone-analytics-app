import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type {
  TicketOrderDetail,
  TicketOrderLine,
} from "../../services/ticketOrdersService";

const PRIMARY = "#0644C7";

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

/** "2026-07-31" -> "7/31/2026" (matches the ticket surface). */
function fmtShort(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** "14:00" | "14:00:00" -> "2:00 PM". */
function fmtTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

type IconName = React.ComponentProps<typeof Feather>["name"];

/** Eligibility banner, in the web modal's four flavours. */
function Banner({
  icon,
  wrap,
  title,
  body,
  accent,
  heading,
  message,
}: {
  icon: IconName;
  wrap: string;
  title: string;
  body: string;
  accent: string;
  heading: string;
  message: string;
}) {
  return (
    <View className={`mb-4 flex-row gap-3 rounded-2xl border p-4 ${wrap}`}>
      <Feather name={icon} size={18} color={accent} />
      <View className="flex-1">
        <Text className={`text-sm font-bold ${title}`}>{heading}</Text>
        <Text className={`mt-0.5 text-xs ${body}`}>{message}</Text>
      </View>
    </View>
  );
}

/** One icon-led detail tile (same shape as the ticket surface's InfoTile). */
function InfoTile({
  icon,
  label,
  value,
  full,
}: {
  icon: IconName;
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <View className={`${full ? "w-full" : "w-1/2"} mb-4 px-2`}>
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-[#0644C7]/10">
          <Feather name={icon} size={16} color={PRIMARY} />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
            {label}
          </Text>
          <Text className="text-sm font-medium text-gray-800 dark:text-white">
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * One line of the order, with the action the web gives it: a line already
 * admitted shows a badge, an unpaid line says so and offers nothing, and
 * anything else gets its own "Check In".
 */
function LineRow({
  line,
  busy,
  onCheckIn,
}: {
  line: TicketOrderLine;
  /** The in-flight target: this line's id, "all", or nothing. */
  busy: number | "all" | null;
  onCheckIn: (lineId: number) => void;
}) {
  const time = fmtTime(line.scheduledTime);
  const schedule = line.scheduledDate
    ? `${fmtShort(line.scheduledDate)}${time ? ` at ${time}` : ""}`
    : "—";
  const unpaid = line.amountPaid < line.totalAmount;

  return (
    <View className="mb-2 rounded-2xl border border-gray-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-[#0644C7]/10">
          <Feather
            name={line.type === "event" ? "calendar" : "tag"}
            size={16}
            color={PRIMARY}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-medium text-gray-800 dark:text-white"
            numberOfLines={1}
          >
            {line.quantity}× {line.name}
          </Text>
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
            {schedule}
          </Text>
        </View>

        {line.checkedInAt ? (
          <View className="flex-row items-center gap-1 rounded-full bg-green-100 px-3 py-1 dark:bg-green-900/40">
            <Feather name="check-circle" size={12} color="#16A34A" />
            <Text className="text-xs font-medium text-green-800 dark:text-green-300">
              Checked In
            </Text>
          </View>
        ) : unpaid ? (
          <View className="rounded-full bg-yellow-100 px-3 py-1 dark:bg-yellow-900/40">
            <Text className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
              Unpaid
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => onCheckIn(line.id)}
            disabled={busy !== null}
            className={`flex-row items-center justify-center rounded-lg bg-[#0644C7] px-3 py-2 active:opacity-90 ${
              busy !== null ? "opacity-50" : ""
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Check in ${line.name}`}
          >
            {busy === line.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-xs font-semibold text-white">Check In</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * The scanned-order verify surface — the mobile counterpart of the web
 * AttractionCheckIn "Verify Order Details" modal: the same four eligibility
 * banners, the Order Information grid, and every ticket on the order with its
 * own check-in action.
 *
 * Read-only apart from the per-line buttons; Close and "Check In All" live in
 * the screen's fixed footer, the way the ticket surface works.
 */
export function VerifyOrderDetails({
  order,
  busy,
  notice,
  onCheckInLine,
}: {
  order: TicketOrderDetail;
  busy: number | "all" | null;
  /** Outcome of the last attempt, including any lines the server skipped. */
  notice: { tone: "success" | "warning" | "error"; message: string } | null;
  onCheckInLine: (lineId: number) => void;
}) {
  const cancelled = order.status === "cancelled";
  const refunded = order.status === "refunded";
  const owes = order.remainingBalance > 0;
  const allCheckedIn =
    order.lines.length > 0 && order.lines.every((l) => l.checkedInAt);

  return (
    <View>
      {/* Same precedence as the web modal: balance, cancellation, all-done,
          then the ready state. */}
      {owes && !cancelled && !refunded && (
        <Banner
          icon="clock"
          wrap="border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-900/20"
          title="text-yellow-800 dark:text-yellow-300"
          body="text-yellow-600 dark:text-yellow-400"
          accent="#CA8A04"
          heading="Payment Incomplete"
          message={`${money(order.remainingBalance)} outstanding on this order. Collect the balance before check-in.`}
        />
      )}

      {cancelled && (
        <Banner
          icon="x-circle"
          wrap="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
          title="text-red-800 dark:text-red-300"
          body="text-red-600 dark:text-red-400"
          accent="#DC2626"
          heading="Order Cancelled"
          message="This order has been cancelled and cannot be used."
        />
      )}

      {allCheckedIn && (
        <Banner
          icon="x-circle"
          wrap="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
          title="text-red-800 dark:text-red-300"
          body="text-red-600 dark:text-red-400"
          accent="#DC2626"
          heading="Already Checked In"
          message="Every ticket on this order has already been checked in."
        />
      )}

      {order.status === "confirmed" &&
        !owes &&
        order.lines.some((l) => !l.checkedInAt) && (
          <Banner
            icon="check-circle"
            wrap="border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20"
            title="text-blue-800 dark:text-blue-300"
            body="text-blue-600 dark:text-blue-400"
            accent="#2563EB"
            heading="Valid Order - Ready for Check-In"
            message="This order is paid in full and ready to be checked in."
          />
        )}

      {/* What the last attempt did, including the server's skip reasons. */}
      {notice && (
        <View
          className={`mb-4 rounded-2xl border p-3 ${
            notice.tone === "success"
              ? "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20"
              : "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              notice.tone === "success"
                ? "text-green-800 dark:text-green-300"
                : "text-red-800 dark:text-red-300"
            }`}
          >
            {notice.message}
          </Text>
        </View>
      )}

      {/* Order Information */}
      <View className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
        <Text className="mb-3 text-sm font-bold text-gray-800 dark:text-white">
          Order Information
        </Text>
        <View className="-mx-2 flex-row flex-wrap">
          <InfoTile
            icon="file-text"
            label="Reference"
            value={order.referenceNumber || `#${order.id}`}
          />
          <InfoTile icon="user" label="Customer" value={order.customerName} />
          <InfoTile
            icon="shopping-bag"
            label="Items"
            value={`${order.itemCount} ${order.itemCount === 1 ? "item" : "items"} · ${order.ticketCount} tickets`}
            full
          />
          <InfoTile
            icon="dollar-sign"
            label="Total / Paid"
            value={`${money(order.totalAmount)} / ${money(order.amountPaid)}`}
          />
          <InfoTile
            icon="credit-card"
            label="Payment"
            value={order.paymentMethod?.replace(/_/g, " ") ?? "—"}
          />
        </View>
      </View>

      {/* Tickets on this order */}
      <View className="mt-4">
        <Text className="mb-2 text-sm font-bold text-gray-800 dark:text-white">
          Tickets on this Order
        </Text>
        {order.lines.length === 0 ? (
          <Text className="rounded-2xl border border-gray-200 bg-white p-4 text-center text-sm text-gray-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-500">
            This order has no ticket lines.
          </Text>
        ) : (
          order.lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              busy={busy}
              onCheckIn={onCheckInLine}
            />
          ))
        )}
      </View>
    </View>
  );
}
