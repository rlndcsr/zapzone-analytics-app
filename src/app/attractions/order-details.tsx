import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectedWaiversPanel } from "../../components/ui/ConnectedWaiversPanel";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { OrderQRSheet } from "../../components/ui/OrderQRSheet";
import { getToken } from "../../lib/session";
import {
  PAYMENT_TYPE,
  fetchPaymentsForPayable,
  recordPayment,
  type PaymentRow,
} from "../../services/paymentsService";
import {
  cancelTicketOrder,
  checkInTicketOrder,
  fetchTicketOrder,
  type TicketOrderDetail,
  type TicketOrderLine,
} from "../../services/ticketOrdersService";
import {
  fetchEntityWaivers,
  type EntityWaivers,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

const ENDED = ["cancelled", "refunded"];

const STATUS_LABEL: Record<string, { label: string; wrap: string; text: string }> = {
  draft: {
    label: "Draft",
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-800 dark:text-gray-200",
  },
  pending: {
    label: "Pending",
    wrap: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-800 dark:text-yellow-300",
  },
  confirmed: {
    label: "Confirmed",
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
  },
  "checked-in": {
    label: "Checked In",
    wrap: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
  },
  cancelled: {
    label: "Cancelled",
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-800 dark:text-gray-200",
  },
  refunded: {
    label: "Refunded",
    wrap: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-800 dark:text-purple-300",
  },
};

/** "14:00" | "14:00:00" -> "2:00 PM". */
function fmtTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

function methodLabel(method: string | null): string {
  if (method === "authorize.net") return "Card (Authorize.Net)";
  if (method === "paylater") return "Pay Later";
  if (method === "in-store") return "In-Store";
  return method ?? "—";
}

function StatusPill({ status }: { status: string }) {
  const style = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
  return (
    <View className={`self-start rounded-full px-3 py-1 ${style.wrap}`}>
      <Text className={`text-xs font-medium ${style.text}`}>{style.label}</Text>
    </View>
  );
}

function InfoTile({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="w-1/2 px-2 pb-4">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-[#0644C7]/10">
          <Feather name={icon} size={16} color={PRIMARY} />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
            {label}
          </Text>
          {children}
        </View>
      </View>
    </View>
  );
}

function LineCard({
  line,
  order,
  busy,
  waivers,
  onCheckIn,
  onEdit,
}: {
  line: TicketOrderLine;
  order: TicketOrderDetail;
  busy: number | "all" | null;
  waivers: EntityWaivers | null;
  onCheckIn: () => void;
  onEdit: () => void;
}) {
  const time = fmtTime(line.scheduledTime);
  const unpaid = line.amountPaid < line.totalAmount;
  const status = STATUS_LABEL[line.status] ?? STATUS_LABEL.pending;
  const checkInDisabled =
    busy !== null || order.status === "cancelled" || unpaid;

  return (
    <View className="mb-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-[#0644C7]/10">
          <Feather
            name={line.type === "event" ? "calendar" : "tag"}
            size={16}
            color={PRIMARY}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-semibold text-gray-900 dark:text-white"
            numberOfLines={2}
          >
            {line.position}. {line.name}
          </Text>
          <Text className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            {line.unitPrice != null
              ? `${line.quantity} × ${money(line.unitPrice)}`
              : `${line.quantity} ${line.quantity === 1 ? "ticket" : "tickets"}`}
            {line.scheduledDate ? ` · ${line.scheduledDate}` : ""}
            {time ? ` at ${time}` : ""}
          </Text>
          {!!line.referenceNumber && (
            <Text className="text-[11px] text-gray-500 dark:text-gray-400">
              {line.referenceNumber}
            </Text>
          )}
          {line.discountLabels.map((label, i) => (
            <Text
              key={i}
              className="text-[11px] text-green-600 dark:text-green-400"
            >
              {label}
            </Text>
          ))}
          {line.addOns.map((addOn, i) => (
            <Text
              key={`a${i}`}
              className="text-[11px] text-gray-600 dark:text-gray-300"
            >
              + {addOn.quantity}× {addOn.name} · {money(addOn.lineTotal)}
            </Text>
          ))}
        </View>
        <View className="items-end">
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            {money(line.totalAmount)}
          </Text>
          {unpaid && (
            <Text className="text-[11px] text-yellow-700 dark:text-yellow-400">
              {money(line.totalAmount - line.amountPaid)} due
            </Text>
          )}
        </View>
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        {line.checkedInAt ? (
          <View className="flex-row items-center gap-1 rounded-full bg-green-100 px-3 py-1 dark:bg-green-900/40">
            <Feather name="check-circle" size={12} color="#16A34A" />
            <Text className="text-[11px] font-medium text-green-800 dark:text-green-300">
              Checked In
            </Text>
          </View>
        ) : (
          <View className={`rounded-full px-3 py-1 ${status.wrap}`}>
            <Text className={`text-[11px] font-medium ${status.text}`}>
              {status.label}
            </Text>
          </View>
        )}
      </View>

      <View className="mt-3 flex-row gap-2">
        {!line.checkedInAt && (
          <Pressable
            onPress={onCheckIn}
            disabled={checkInDisabled}
            accessibilityRole="button"
            accessibilityLabel={`Check in ${line.name}`}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-[#0644C7] py-2.5 active:opacity-90 ${
              checkInDisabled ? "opacity-50" : ""
            }`}
          >
            {busy === line.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Feather name="check-circle" size={14} color="#FFFFFF" />
                <Text className="text-xs font-semibold text-white">
                  Check In
                </Text>
              </>
            )}
          </Pressable>
        )}
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit schedule and notes for ${line.name}`}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-2.5 active:opacity-70 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <Feather name="edit-2" size={14} color="#374151" />
          <Text
            className="text-xs font-semibold text-gray-700 dark:text-gray-200"
            numberOfLines={1}
          >
            Edit Schedule
          </Text>
        </Pressable>
      </View>

      {unpaid && !line.checkedInAt && (
        <Text className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          Money and status are managed on the order — collect the balance below
          to release this ticket.
        </Text>
      )}

      {line.type === "attraction" && (
        <View className="mt-3">
          <ConnectedWaiversPanel
            sourceType="attraction_purchase"
            sourceId={line.id}
            entityLabel="ticket"
            waivers={waivers}
            loading={waivers === null}
          />
        </View>
      )}
    </View>
  );
}

export default function OrderDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = Number(id);

  const [order, setOrder] = useState<TicketOrderDetail | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [waivers, setWaivers] = useState<Record<number, EntityWaivers | null>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<number | "all" | null>(null);
  const [acting, setActing] = useState<"pay" | "cancel" | null>(null);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setError("Order not found");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    try {
      const fetched = await fetchTicketOrder(token, orderId);
      setOrder(fetched);
      setError(null);

      try {
        setPayments(
          await fetchPaymentsForPayable(
            token,
            PAYMENT_TYPE.TICKET_ORDER,
            fetched.id,
          ),
        );
      } catch {
        setPayments([]);
      }

      const attractionLines = fetched.lines.filter(
        (l) => l.type === "attraction",
      );
      const entries = await Promise.all(
        attractionLines.map(async (line) => {
          try {
            return [
              line.id,
              await fetchEntityWaivers(token, "attraction_purchase", line.id),
            ] as const;
          } catch {
            return [line.id, null] as const;
          }
        }),
      );
      setWaivers(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not load that order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const checkIn = useCallback(
    async (lineIds?: number[]) => {
      if (!order) return;
      const token = getToken();
      if (!token) return;
      setCheckingIn(lineIds ? lineIds[0] : "all");
      try {
        const res = await checkInTicketOrder(token, order.id, lineIds);
        const skipped = res.skipped.length
          ? ` — skipped: ${res.skipped.map((s) => s.reason).join(", ")}`
          : "";
        Alert.alert(
          res.checkedIn > 0 ? "Check-in complete" : "Nothing checked in",
          `Checked in ${res.checkedIn}${skipped}`,
        );
        await load();
      } catch (e) {
        Alert.alert(
          "Check-in failed",
          e instanceof Error ? e.message : "Please try again.",
        );
      } finally {
        setCheckingIn(null);
      }
    },
    [order, load],
  );

  const recordVenuePayment = useCallback(() => {
    if (!order || order.remainingBalance <= 0) return;
    Alert.alert(
      "Record payment",
      `Record ${money(order.remainingBalance)} collected at the venue for ${order.referenceNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setActing("pay");
            try {
              await recordPayment(token, {
                payable_id: order.id,
                payable_type: PAYMENT_TYPE.TICKET_ORDER,
                amount: order.remainingBalance,
                method: "in-store",
                status: "completed",
                location_id: order.locationId,
                notes: `Venue payment for order ${order.referenceNumber}`,
              });
              Alert.alert(
                "Payment recorded",
                "Every ticket on the order is settled.",
              );
              await load();
            } catch (e) {
              Alert.alert(
                "Payment failed",
                e instanceof Error ? e.message : "Please try again.",
              );
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  }, [order, load]);

  const cancelOrder = useCallback(() => {
    if (!order) return;
    Alert.alert(
      "Cancel order",
      `Cancel order ${order.referenceNumber}? Every ticket on it will be cancelled.`,
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            setActing("cancel");
            try {
              await cancelTicketOrder(token, order.id);
              Alert.alert("Order cancelled", `${order.referenceNumber} was cancelled.`);
              await load();
            } catch (e) {
              Alert.alert(
                "Cancel failed",
                e instanceof Error ? e.message : "Please try again.",
              );
            } finally {
              setActing(null);
            }
          },
        },
      ],
    );
  }, [order, load]);

  const openLineEdit = useCallback((line: TicketOrderLine) => {
    router.push({
      pathname:
        line.type === "attraction"
          ? "/attractions/edit-purchase"
          : "/events/edit-purchase",
      params: { id: String(line.id), from: "order" },
    });
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8 dark:bg-black">
        <Feather name="alert-circle" size={44} color="#DC2626" />
        <Text className="mt-3 text-center text-xl font-bold text-gray-900 dark:text-white">
          {error ?? "Order not found"}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-5 rounded-xl bg-[#0644C7] px-5 py-3.5 active:opacity-90"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-white">
            Back to Bulk Orders
          </Text>
        </Pressable>
      </View>
    );
  }

  const allIn = order.lines.length > 0 && order.lines.every((l) => l.checkedInAt);
  const ended = ENDED.includes(order.status);
  const canRecordPayment = order.remainingBalance > 0 && !ended;
  const canCancel =
    order.amountPaid === 0 &&
    !ENDED.includes(order.status) &&
    order.status !== "checked-in" &&
    !order.lines.some((l) => l.checkedInAt);
  const checkInAllDisabled =
    checkingIn !== null ||
    allIn ||
    order.status === "cancelled" ||
    order.remainingBalance > 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View className="z-10 w-full border-b border-gray-100 bg-white px-5 pb-4 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Order Details
            </Text>
            <Text
              className="text-xs text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
              Order: {order.referenceNumber}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowQr(true)}
            className="rounded-full bg-gray-100 p-2 active:opacity-70 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="View order QR code"
          >
            <Feather name="grid" size={20} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        <View className="px-5 pt-5">
          {(canRecordPayment || canCancel) && (
            <View className="mb-4 flex-row gap-3">
              {canRecordPayment && (
                <Pressable
                  onPress={recordVenuePayment}
                  disabled={acting !== null}
                  accessibilityRole="button"
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3.5 active:opacity-70 dark:border-amber-900/40 dark:bg-amber-900/20 ${
                    acting !== null ? "opacity-50" : ""
                  }`}
                >
                  {acting === "pay" ? (
                    <ActivityIndicator size="small" color="#D97706" />
                  ) : (
                    <>
                      <Feather name="dollar-sign" size={15} color="#D97706" />
                      <Text className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Record {money(order.remainingBalance)}
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
              {canCancel && (
                <Pressable
                  onPress={cancelOrder}
                  disabled={acting !== null}
                  accessibilityRole="button"
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 active:opacity-70 dark:border-red-900/40 dark:bg-red-900/20 ${
                    acting !== null ? "opacity-50" : ""
                  }`}
                >
                  {acting === "cancel" ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <>
                      <Feather name="x-circle" size={15} color="#DC2626" />
                      <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                        Cancel Order
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}

          {/* Order Information */}
          <View className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="mb-3 text-base font-bold text-gray-900 dark:text-white">
              Order Information
            </Text>
            <View className="-mx-2 flex-row flex-wrap">
              <InfoTile icon="user" label="Customer">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {order.customerName}
                </Text>
                {!!order.customerEmail && (
                  <Text
                    className="text-[11px] text-gray-500 dark:text-gray-400"
                    numberOfLines={1}
                  >
                    {order.customerEmail}
                  </Text>
                )}
                {!!order.customerPhone && (
                  <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                    {order.customerPhone}
                  </Text>
                )}
              </InfoTile>
              <InfoTile icon="calendar" label="Order Date">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {order.purchaseDate ?? "—"}
                </Text>
              </InfoTile>
              <InfoTile icon="check-circle" label="Status">
                <View className="mt-0.5">
                  <StatusPill status={order.status} />
                </View>
              </InfoTile>
              <InfoTile icon="map-pin" label="Location">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {order.locationName ?? "—"}
                </Text>
              </InfoTile>
              <InfoTile icon="credit-card" label="Payment Method">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {methodLabel(order.paymentMethod)}
                </Text>
              </InfoTile>
              <InfoTile icon="tag" label="Items">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
                  {order.ticketCount} tickets
                  {allIn ? " · all checked in" : ""}
                </Text>
              </InfoTile>
            </View>
            {!!order.notes && (
              <View className="mt-1 border-t border-gray-100 pt-3 dark:border-neutral-800">
                <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                  Notes
                </Text>
                <Text className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">
                  {order.notes}
                </Text>
              </View>
            )}
          </View>

          {/* Tickets on this Order */}
          <View className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <Text className="flex-1 text-base font-bold text-gray-900 dark:text-white">
                Tickets on this Order
              </Text>
              <Pressable
                onPress={() => void checkIn()}
                disabled={checkInAllDisabled}
                accessibilityRole="button"
                accessibilityLabel="Check in every ticket on this order"
                className={`flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-3 py-2 active:opacity-90 ${
                  checkInAllDisabled ? "opacity-50" : ""
                }`}
              >
                {checkingIn === "all" ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-xs font-semibold text-white">
                    {allIn ? "All Checked In" : "Check In All"}
                  </Text>
                )}
              </Pressable>
            </View>

            {order.lines.length === 0 ? (
              <Text className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
                This order has no ticket lines.
              </Text>
            ) : (
              order.lines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  order={order}
                  busy={checkingIn}
                  waivers={waivers[line.id] ?? null}
                  onCheckIn={() => void checkIn([line.id])}
                  onEdit={() => openLineEdit(line)}
                />
              ))
            )}
          </View>

          {/* Payment Information */}
          <View className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="mb-3 text-base font-bold text-gray-900 dark:text-white">
              Payment Information
            </Text>

            <View className="-mx-2 flex-row flex-wrap">
              <InfoTile icon="dollar-sign" label="Subtotal">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {money(order.subtotal)}
                </Text>
                {order.discountAmount > 0 && (
                  <Text className="text-[11px] text-green-600 dark:text-green-400">
                    −{money(order.discountAmount)} discounts
                  </Text>
                )}
                {order.feeTotal > 0 && (
                  <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                    +{money(order.feeTotal)} fees
                  </Text>
                )}
              </InfoTile>
              <InfoTile icon="credit-card" label="Total / Paid">
                <Text className="text-sm font-medium text-gray-800 dark:text-white">
                  {money(order.totalAmount)} / {money(order.amountPaid)}
                </Text>
                {order.remainingBalance > 0 && !ended && (
                  <Text className="text-[11px] font-medium text-yellow-700 dark:text-yellow-400">
                    {money(order.remainingBalance)} due at the venue
                  </Text>
                )}
              </InfoTile>
            </View>

            {payments.length === 0 ? (
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {order.remainingBalance > 0
                  ? "No payments recorded yet — the balance is collected at the venue."
                  : "No payment rows found for this order."}
              </Text>
            ) : (
              <View className="gap-2">
                {payments.map((p) => (
                  <View
                    key={p.id}
                    className="flex-row items-center gap-2 rounded-xl bg-gray-50 p-3 dark:bg-neutral-800/40"
                  >
                    <Text className="text-sm font-bold text-gray-900 dark:text-white">
                      {money(p.amount)}
                    </Text>
                    <Text className="text-xs capitalize text-gray-600 dark:text-gray-300">
                      {p.method}
                    </Text>
                    <View
                      className={`rounded-full px-2 py-0.5 ${
                        p.status === "completed"
                          ? "bg-green-100 dark:bg-green-900/30"
                          : p.status === "refunded" || p.status === "voided"
                            ? "bg-purple-100 dark:bg-purple-900/30"
                            : "bg-yellow-100 dark:bg-yellow-900/30"
                      }`}
                    >
                      <Text className="text-[10px] font-medium capitalize text-gray-800 dark:text-gray-200">
                        {p.status}
                      </Text>
                    </View>
                    <Text
                      className="flex-1 text-right text-[10px] text-gray-500 dark:text-gray-400"
                      numberOfLines={1}
                    >
                      {p.createdAt ? formatDateTimeET(p.createdAt) : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <OrderQRSheet
        visible={showQr}
        onClose={() => setShowQr(false)}
        orderId={order.id}
        referenceNumber={order.referenceNumber}
        ticketCount={order.ticketCount}
        customerName={order.customerName}
      />
    </View>
  );
}
