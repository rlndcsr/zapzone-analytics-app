import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  countActiveOrderFilters,
  EMPTY_ORDER_FILTERS,
  OrderFiltersSheet,
  type OrderFilterValues,
} from "../../components/ui/OrderFiltersSheet";
import { StatTile } from "../../components/ui/StatTile";
import { getToken } from "../../lib/session";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  checkInTicketOrder,
  listTicketOrders,
  type TicketOrderDetail,
} from "../../services/ticketOrdersService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

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

const ENDED = ["cancelled", "refunded"];

/** Web parity: "authorize.net" reads as "Authorize.Net", anything else verbatim. */
const methodLabel = (method: string | null) =>
  method === "authorize.net" ? "Authorize.Net" : (method ?? "N/A");

const allCheckedIn = (o: TicketOrderDetail) =>
  o.lines.length > 0 && o.lines.every((l) => l.checkedInAt);

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <View
      className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${style.wrap}`}
    >
      <Feather name={style.icon} size={11} color="#6B7280" />
      <Text className={`text-[11px] font-medium capitalize ${style.text}`}>
        {status.replace("-", " ")}
      </Text>
    </View>
  );
}

function OrderCard({
  order,
  checkingIn,
  onOpen,
  onCheckIn,
}: {
  order: TicketOrderDetail;
  checkingIn: boolean;
  onOpen: () => void;
  onCheckIn: () => void;
}) {
  const settled = order.remainingBalance <= 0;
  const ended = ENDED.includes(order.status);
  const canCheckIn = !allCheckedIn(order) && !ended && settled;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open order ${order.referenceNumber}`}
      className="mb-3 rounded-2xl border border-gray-100 bg-white p-4 active:opacity-80 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {order.referenceNumber || `Order #${order.id}`}
          </Text>
          <Text
            className="mt-0.5 text-sm text-gray-700 dark:text-gray-200"
            numberOfLines={1}
          >
            {order.customerName}
          </Text>
          {!!order.customerEmail && (
            <Text
              className="text-xs text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
              {order.customerEmail}
            </Text>
          )}
        </View>
        <StatusPill status={order.status} />
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <Feather name="tag" size={13} color="#9CA3AF" />
        <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
          {order.ticketCount} tickets
          {allCheckedIn(order) ? " · all checked in" : ""}
        </Text>
      </View>

      <View className="mt-1.5 flex-row items-center gap-2">
        <Feather name="credit-card" size={13} color="#9CA3AF" />
        <Text className="flex-1 text-xs capitalize text-gray-500 dark:text-gray-400">
          {methodLabel(order.paymentMethod)}
          {order.locationName ? ` · ${order.locationName}` : ""}
          {order.purchaseDate ? ` · ${order.purchaseDate}` : ""}
        </Text>
      </View>

      <View className="mt-3 flex-row items-end justify-between border-t border-gray-100 pt-3 dark:border-neutral-800">
        <View>
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            {money(order.totalAmount)}
          </Text>
          <Text className="text-[11px] text-gray-500 dark:text-gray-400">
            {money(order.amountPaid)} paid
          </Text>
          {order.remainingBalance > 0 && !ended && (
            <Text className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              {money(order.remainingBalance)} due
            </Text>
          )}
        </View>

        <View className="flex-row items-center gap-2">
          {canCheckIn && (
            <Pressable
              onPress={onCheckIn}
              disabled={checkingIn}
              accessibilityRole="button"
              accessibilityLabel="Check in every ticket on this order"
              className={`flex-row items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 active:opacity-70 dark:border-green-900/40 dark:bg-green-900/20 ${
                checkingIn ? "opacity-50" : ""
              }`}
            >
              {checkingIn ? (
                <ActivityIndicator size="small" color="#16A34A" />
              ) : (
                <>
                  <Feather name="check-circle" size={13} color="#16A34A" />
                  <Text className="text-xs font-semibold text-green-700 dark:text-green-400">
                    Check In
                  </Text>
                </>
              )}
            </Pressable>
          )}
          <View className="flex-row items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 dark:border-neutral-700">
            <Feather name="eye" size={13} color={PRIMARY} />
            <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
              View
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function BulkOrdersScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const activeLocation = useActiveLocation();

  const [orders, setOrders] = useState<TicketOrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<OrderFilterValues>(EMPTY_ORDER_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    try {
      const rows = await listTicketOrders(token, {
        locationId: activeLocation.id === "all" ? null : activeLocation.id,
      });
      setOrders(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [activeLocation.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const checkInAll = useCallback(
    async (order: TicketOrderDetail) => {
      const token = getToken();
      if (!token) return;
      setCheckingIn(order.id);
      try {
        const res = await checkInTicketOrder(token, order.id);
        const skipped = res.skipped.length
          ? ` (${res.skipped.length} skipped)`
          : "";
        Alert.alert(
          "Check-in complete",
          `Checked in ${res.checkedIn} ticket line${res.checkedIn === 1 ? "" : "s"}${skipped}`,
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
    [load],
  );

  const kpis = useMemo(() => {
    const lines = orders.reduce((n, o) => n + o.itemCount, 0);
    const collected = orders.reduce((s, o) => s + o.amountPaid, 0);
    const outstanding = orders
      .filter((o) => !ENDED.includes(o.status))
      .reduce((s, o) => s + o.remainingBalance, 0);
    const tickets = orders.reduce((n, o) => n + o.ticketCount, 0);
    return { total: orders.length, lines, collected, outstanding, tickets };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (filters.status !== "all" && o.status !== filters.status) return false;
        if (filters.method !== "all" && (o.paymentMethod ?? "") !== filters.method)
          return false;
        if (!q) return true;
        return [
          o.referenceNumber,
          o.customerName,
          o.customerEmail ?? "",
          o.customerPhone ?? "",
          o.locationName ?? "",
          methodLabel(o.paymentMethod),
          o.status,
        ].some((field) => field.toLowerCase().includes(q));
      })
      .sort((a, b) => (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? ""));
  }, [orders, search, filters]);

  const activeFilterCount = countActiveOrderFilters(filters);

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no orders to export.");
      return;
    }
    setExporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "Order",
        "Customer",
        "Email",
        "Phone",
        "Location",
        "Date",
        "Items",
        "Total",
        "Paid",
        "Balance Due",
        "Method",
        "Status",
        "Subtotal",
        "Discounts",
        "Fees",
        "Lines",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = filtered.map((o) =>
        [
          o.referenceNumber,
          o.customerName,
          o.customerEmail ?? "",
          o.customerPhone ?? "",
          o.locationName ?? "",
          o.purchaseDate ?? "",
          `${o.itemCount} items / ${o.ticketCount} tickets`,
          o.totalAmount.toFixed(2),
          o.amountPaid.toFixed(2),
          o.remainingBalance.toFixed(2),
          methodLabel(o.paymentMethod),
          o.status,
          o.subtotal.toFixed(2),
          o.discountAmount.toFixed(2),
          o.feeTotal.toFixed(2),
          o.lines.map((l) => `${l.quantity}x ${l.name}`).join("; "),
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...rows].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}bulk-orders-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Bulk Orders",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Export failed",
        e instanceof Error ? e.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View className="z-10 w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Bulk Orders
          </Text>
          <Pressable
            onPress={exportCsv}
            disabled={exporting}
            className="rounded-full bg-gray-100 p-2 active:opacity-70 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Export CSV"
          >
            {exporting ? (
              <ActivityIndicator size="small" color={headerIcon} />
            ) : (
              <Feather name="download" size={20} color={headerIcon} />
            )}
          </Pressable>
        </View>
        <Text className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
          View and manage all bulk orders
        </Text>
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
        <View className="mt-5 px-5">
          {!!error && (
            <View className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-900/20">
              <Text className="font-semibold text-red-600 dark:text-red-400">
                Something went wrong
              </Text>
              <Text className="mt-1 text-sm text-red-500 dark:text-red-300">
                {error}
              </Text>
            </View>
          )}

          <View className="-mx-1.5 mb-3 flex-row flex-wrap">
            <View className="w-1/2 px-1.5 pb-3">
              <StatTile
                icon="shopping-cart"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Total Orders"
                value={String(kpis.total)}
                hint={`${kpis.lines} ticket lines`}
              />
            </View>
            <View className="w-1/2 px-1.5 pb-3">
              <StatTile
                icon="check-circle"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Collected"
                value={money(kpis.collected)}
                hint="Payments received on orders"
              />
            </View>
            <View className="w-1/2 px-1.5 pb-3">
              <StatTile
                icon="dollar-sign"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Outstanding"
                value={money(kpis.outstanding)}
                hint="Due at the venue"
              />
            </View>
            <View className="w-1/2 px-1.5 pb-3">
              <StatTile
                icon="tag"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Tickets"
                value={String(kpis.tickets)}
                hint="Across all orders"
              />
            </View>
          </View>

          <View className="mb-3 mt-2 flex-row items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by reference, customer, email, phone..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setShowFilters(true)}
              accessibilityRole="button"
              accessibilityLabel={`Open filters${
                activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""
              }`}
              className="flex-1 flex-row items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-4 py-3.5 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <Feather name="sliders" size={16} color="#6B7280" />
              <Text className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-[#0644C7] px-1.5">
                  <Text className="text-[11px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => router.push("/attractions/create-purchase")}
              accessibilityRole="button"
              accessibilityLabel="New order"
              className="flex-row items-center gap-2 rounded-xl bg-[#0644C7] px-4 py-3.5 active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">New Order</Text>
            </Pressable>
          </View>

          <View className="mt-4">
            {loading && orders.length === 0 ? (
              <View
                key="orders-loading"
                className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : filtered.length === 0 ? (
              // Distinct key + matching class features: a View that gains shadow-*/dark:/pseudo
              // after mount makes css-interop upgrade in place, which crashes.
              <View
                key="orders-empty"
                className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <View className="mb-3 h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
                  <Feather name="shopping-cart" size={26} color="#9CA3AF" />
                </View>
                <Text className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                  {orders.length === 0 ? "No bulk orders yet" : "No orders found"}
                </Text>
                <Text className="mt-1 max-w-xs text-center text-sm text-gray-400 dark:text-gray-500">
                  {orders.length === 0
                    ? "Orders placed from the cart or Create Purchase appear here"
                    : "Try adjusting your search or filters."}
                </Text>
              </View>
            ) : (
              <>
                <Text className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  {filtered.length} {filtered.length === 1 ? "order" : "orders"}
                </Text>
                {filtered.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    checkingIn={checkingIn === order.id}
                    onOpen={() =>
                      router.push({
                        pathname: "/attractions/order-details",
                        params: { id: String(order.id) },
                      })
                    }
                    onCheckIn={() => void checkInAll(order)}
                  />
                ))}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <OrderFiltersSheet
        visible={showFilters}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_ORDER_FILTERS)}
        onClose={() => setShowFilters(false)}
      />
    </View>
  );
}
