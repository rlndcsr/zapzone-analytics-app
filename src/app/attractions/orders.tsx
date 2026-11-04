import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useRef, useState } from "react";
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
  BULK_ORDER_COLUMN_META,
  BulkOrdersTable,
  DEFAULT_BULK_ORDER_COLUMNS,
  ENDED_ORDER_STATUSES as ENDED,
  OrderStatusBadge,
  money,
} from "../../components/ui/BulkOrdersTable";
import { ColumnsSheet } from "../../components/ui/ColumnsSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import {
  countActiveOrderFilters,
  EMPTY_ORDER_FILTERS,
  OrderFiltersSheet,
  type OrderFilterValues,
} from "../../components/ui/OrderFiltersSheet";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { PurchasesListSkeleton } from "../../components/ui/skeleton/AttractionPurchasesSkeleton";
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import { getToken } from "../../lib/session";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  checkInTicketOrder,
  listAllTicketOrders,
  type TicketOrderDetail,
} from "../../services/ticketOrdersService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

/** Web parity: "authorize.net" reads as "Authorize.Net", anything else verbatim. */
const methodLabel = (method: string | null) =>
  method === "authorize.net" ? "Authorize.Net" : (method ?? "N/A");

const allCheckedIn = (o: TicketOrderDetail) =>
  o.lines.length > 0 && o.lines.every((l) => l.checkedInAt);

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own shadowed tile — the same panel as Manage Attractions.
 */
const SummaryCell = ({
  icon,
  title,
  value,
  hint,
  divideLeft = false,
  divideTop = false,
}: {
  icon: FeatherIconName;
  title: string;
  value: string;
  hint: string;
  divideLeft?: boolean;
  divideTop?: boolean;
}) => (
  <View
    className={`flex-1 p-4 ${
      divideLeft ? "border-l border-gray-100 dark:border-neutral-800" : ""
    } ${divideTop ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
  >
    <View className="flex-row items-center gap-1.5">
      <Feather name={icon} size={13} color="#9CA3AF" />
      <Text
        numberOfLines={1}
        className="shrink text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {title}
      </Text>
    </View>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      className="text-2xl font-semibold text-gray-900 dark:text-white mt-1.5"
    >
      {value}
    </Text>
    <Text
      numberOfLines={1}
      className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
    >
      {hint}
    </Text>
  </View>
);

/** Square icon button used in the list header (Columns). */
const ToolbarIconButton = ({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-9 h-9 rounded-xl items-center justify-center active:opacity-70 ${
      active
        ? "bg-blue-50 dark:bg-blue-900/30"
        : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Feather name={icon} size={16} color={active ? PRIMARY : "#6B7280"} />
  </Pressable>
);

/** One labelled cell in the card's Total / Paid / Due strip. */
const Spec = ({
  label,
  value,
  valueClass = "text-gray-900 dark:text-white",
  divider = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    <Text
      numberOfLines={1}
      className={`text-sm font-semibold mt-0.5 ${valueClass}`}
    >
      {value}
    </Text>
  </View>
);

/**
 * Card layout for a single bulk order, matching the Manage Attractions card:
 * reference + status, customer, items, a Total / Paid / Due strip and a quiet
 * footer. Tapping the card opens Order Details; Check In is a nested button.
 */
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
  const checkedIn = allCheckedIn(order);
  const canCheckIn = !checkedIn && !ended && settled;
  const owing = order.remainingBalance > 0 && !ended;
  const customer = [order.customerName, order.customerEmail]
    .filter(Boolean)
    .join("  ·  ");
  const meta = [methodLabel(order.paymentMethod), order.locationName, order.purchaseDate]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Open order ${order.referenceNumber}`}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
    >
      {/* Reference + status */}
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {order.referenceNumber || `Order #${order.id}`}
        </Text>
        <OrderStatusBadge status={order.status} />
      </View>

      {/* Customer · email */}
      {!!customer && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-1"
          numberOfLines={1}
        >
          {customer}
        </Text>
      )}

      {/* Items / tickets */}
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="tag" size={13} color="#9CA3AF" />
        <Text
          className="shrink text-[13px] font-medium text-gray-700 dark:text-gray-200"
          numberOfLines={1}
        >
          {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
          {order.ticketCount} tickets
        </Text>
        {checkedIn && (
          <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30">
            <Feather name="check" size={10} color="#16A34A" />
            <Text className="text-[10px] font-semibold text-green-700 dark:text-green-400">
              All checked in
            </Text>
          </View>
        )}
      </View>

      {/* Total / Paid / Due */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <Spec label="Total" value={money(order.totalAmount)} />
        <Spec
          divider
          label="Paid"
          value={money(order.amountPaid)}
          valueClass={
            owing
              ? "text-gray-900 dark:text-white"
              : "text-green-700 dark:text-green-400"
          }
        />
        <Spec
          divider
          label="Due"
          value={owing ? money(order.remainingBalance) : "—"}
          valueClass={
            owing
              ? "text-amber-700 dark:text-amber-400"
              : "text-gray-400 dark:text-gray-500"
          }
        />
      </View>

      {/* Method · location · date + actions */}
      <View className="flex-row items-center justify-between gap-3 mt-3">
        <Text
          numberOfLines={1}
          className="shrink text-xs capitalize text-gray-400 dark:text-gray-500"
        >
          {meta}
        </Text>
        <View className="flex-row items-center gap-3">
          {canCheckIn && (
            <Pressable
              onPress={onCheckIn}
              disabled={checkingIn}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Check in every ticket on this order"
              className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 active:opacity-70 ${
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
          <View className="flex-row items-center gap-0.5">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Details
            </Text>
            <Feather name="chevron-right" size={14} color="#9CA3AF" />
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
  // Table is the default layout everywhere in the app (see ViewToggle).
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Which columns the table renders (the web's Columns dropdown).
  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(DEFAULT_BULK_ORDER_COLUMNS),
  );
  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Only the latest load may land — a slower reply for another location must not win (web parity).
  const loadRequestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const isCurrent = () => requestId === loadRequestRef.current;
    const token = getToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }
    try {
      const rows = await listAllTicketOrders(token, {
        locationId: activeLocation.id === "all" ? null : activeLocation.id,
      });
      if (!isCurrent()) return;
      setOrders(rows);
      setError(null);
    } catch (e) {
      if (isCurrent())
        setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      if (isCurrent()) setLoading(false);
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

  const openOrder = useCallback((order: TicketOrderDetail) => {
    router.push({
      pathname: "/attractions/order-details",
      params: { id: String(order.id) },
    });
  }, []);

  // The page's secondary actions as module-hub shortcuts, like the Manage
  // Attractions "More" row.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: "Manage Purchases",
      icon: "shopping-bag",
      route: "/attractions/purchases",
    },
    { label: "Check-In", icon: "check-square", route: "/check-in" },
    {
      label: "Export CSV",
      icon: "file-text",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
  ];

  const initialLoad = loading && orders.length === 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action. */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-full active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text
            numberOfLines={1}
            className="flex-1 text-gray-900 dark:text-white text-lg font-semibold"
          >
            Bulk Orders
          </Text>
          <Pressable
            onPress={() => router.push("/attractions/create-purchase")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New order"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-4 mt-4">
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state */}
          {!!error && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load orders
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {error}
                </Text>
                <Pressable
                  onPress={onRefresh}
                  className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Summary — one panel, four figures, divided by hairlines. */}
          {initialLoad ? (
            <AttractionsSummarySkeleton />
          ) : (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="flex-row">
                <SummaryCell
                  icon="layers"
                  title="Total Orders"
                  value={String(kpis.total)}
                  hint={`${kpis.lines} ticket lines`}
                />
                <SummaryCell
                  divideLeft
                  icon="check-circle"
                  title="Collected"
                  value={money(kpis.collected)}
                  hint="Payments received"
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="dollar-sign"
                  title="Outstanding"
                  value={money(kpis.outstanding)}
                  hint="Due at the venue"
                />
                <SummaryCell
                  divideTop
                  divideLeft
                  icon="tag"
                  title="Tickets"
                  value={String(kpis.tickets)}
                  hint="Across all orders"
                />
              </View>
            </View>
          )}

          {/* More — the page's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search orders"
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
                className="flex-1 text-sm text-gray-900 dark:text-white"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setShowFilters(true)}
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0
                  ? `Filters, ${activeFilterCount} applied`
                  : "Filters"
              }
              className={`flex-row items-center gap-1.5 h-11 px-3.5 rounded-xl border active:opacity-70 ${
                activeFilterCount > 0
                  ? "bg-blue-50 dark:bg-blue-900/30 border-[#0644C7]/40"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
              }`}
            >
              <Feather
                name="sliders"
                size={15}
                color={activeFilterCount > 0 ? PRIMARY : "#6B7280"}
              />
              <Text
                className={`text-sm font-medium ${
                  activeFilterCount > 0
                    ? "text-[#0644C7] dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Applied-filters hint with a one-tap reset. */}
          {activeFilterCount > 0 && (
            <View className="flex-row items-center justify-between mb-3 -mt-1">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {activeFilterCount}{" "}
                {activeFilterCount === 1 ? "filter" : "filters"} applied
              </Text>
              <Pressable
                onPress={() => setFilters(EMPTY_ORDER_FILTERS)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* List header — title + count, Columns (table only), layout toggle. */}
          <View className="flex-row items-center justify-between gap-2 mb-3">
            <View className="flex-row items-baseline gap-2 shrink">
              <Text
                numberOfLines={1}
                className="shrink text-base font-semibold text-gray-900 dark:text-white"
              >
                All Orders
              </Text>
              {!initialLoad && (
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              )}
            </View>
            <View className="flex-row items-center gap-2">
              {viewMode === "table" && (
                <ToolbarIconButton
                  icon="columns"
                  label="Toggle columns"
                  active={showColumns}
                  onPress={() => setShowColumns(true)}
                />
              )}
              <ViewToggle mode={viewMode} onChange={setViewMode} />
            </View>
          </View>

          {/* List / states. Distinct keys per state: a View that gains
              shadow, dark: or pseudo classes after mount makes css-interop
              upgrade in place, which crashes. */}
          {initialLoad ? (
            <View key="orders-loading">
              <PurchasesListSkeleton
                flat
                selectable={false}
                view={viewMode}
              />
            </View>
          ) : filtered.length === 0 ? (
            <View
              key="orders-empty"
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center"
            >
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={orders.length === 0 ? "layers" : "search"}
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {orders.length === 0 ? "No bulk orders yet" : "No orders found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {orders.length === 0
                  ? "Orders placed from the cart or Create Purchase appear here."
                  : "Try adjusting your search or filters."}
              </Text>
              {orders.length === 0 ? (
                <Pressable
                  onPress={() => router.push("/attractions/create-purchase")}
                  className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    New Order
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setFilters(EMPTY_ORDER_FILTERS);
                  }}
                  className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Clear search & filters
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            // Table and card layouts render from the same `filtered` list —
            // switching is instant and never refetches.
            <View key="orders-list">
              {viewMode === "table" ? (
                <BulkOrdersTable
                  orders={filtered}
                  checkingInId={checkingIn}
                  visibleKeys={visibleColumns}
                  onView={openOrder}
                  onCheckIn={(order) => void checkInAll(order)}
                  methodLabel={methodLabel}
                  allCheckedIn={allCheckedIn}
                />
              ) : (
                filtered.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    checkingIn={checkingIn === order.id}
                    onOpen={() => openOrder(order)}
                    onCheckIn={() => void checkInAll(order)}
                  />
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <ColumnsSheet
        visible={showColumns}
        columns={BULK_ORDER_COLUMN_META}
        visibleKeys={visibleColumns}
        onToggle={toggleColumn}
        onShowAll={() =>
          setVisibleColumns(new Set(BULK_ORDER_COLUMN_META.map((c) => c.key)))
        }
        onReset={() => setVisibleColumns(new Set(DEFAULT_BULK_ORDER_COLUMNS))}
        onClose={() => setShowColumns(false)}
      />

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
