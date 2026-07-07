import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
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
import { useColorScheme } from "nativewind";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { AttractionsKpiSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { PurchasesListSkeleton } from "../../components/ui/skeleton/AttractionPurchasesSkeleton";
import {
  consumeAttractionPurchasesStale,
  useAttractionPurchases,
} from "../../lib/hooks/useAttractionPurchases";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchTrashedAttractionPurchases,
  type PurchaseRow,
  type PurchaseStatus,
} from "../../services/attractionPurchasesService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type StatusFilter = "all" | PurchaseStatus;
type DateRange = "all" | "today" | "week" | "month";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Status", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
  { label: "Checked In", value: "checked-in" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Refunded", value: "refunded" },
];

const PAYMENT_OPTIONS: { label: string; value: string }[] = [
  { label: "All Methods", value: "all" },
  { label: "Card", value: "card" },
  { label: "Authorize.net", value: "authorize.net" },
  { label: "In-Store", value: "in-store" },
  { label: "Pay Later", value: "paylater" },
];

const DATE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "week" },
  { label: "Last 30 Days", value: "month" },
];

const PER_PAGE_OPTIONS = [5, 10, 15];

const STATUS_BADGE: Record<PurchaseStatus, string> = {
  confirmed: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "checked-in": "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  pending: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  cancelled: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
  refunded: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  voided: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function prettyStatus(status: PurchaseStatus): string {
  return status === "checked-in"
    ? "Checked In"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function prettyMethod(method: string): string {
  if (!method) return "—";
  const spaced = method.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDateTime(dateString: string): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatScheduled(dateStr: string, timeStr: string | null): string {
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  const datePart = Number.isNaN(d.getTime())
    ? dateStr
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (!timeStr) return datePart;
  const [hStr, mStr] = timeStr.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${datePart} · ${hour}:${mStr ?? "00"} ${meridian}`;
}

const StatusBadge = ({ status }: { status: PurchaseStatus }) => {
  const cls = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  const [bg1, bg2, fg1, fg2] = cls.split(" ");
  return (
    <View className={`px-2.5 py-1 rounded-full ${bg1} ${bg2}`}>
      <Text className={`text-xs font-semibold ${fg1} ${fg2}`}>
        {prettyStatus(status)}
      </Text>
    </View>
  );
};

const Stat = ({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) => (
  <View>
    <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
      {label}
    </Text>
    <Text className={`text-sm font-bold text-gray-900 dark:text-white ${valueClass}`}>
      {value}
    </Text>
  </View>
);

const PurchaseCard = ({ purchase }: { purchase: PurchaseRow }) => {
  const paidInFull = purchase.amountPaid >= purchase.totalAmount;
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* Customer + status */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {purchase.customerName}
          </Text>
          {!!purchase.email && (
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" numberOfLines={1}>
              {purchase.email}
            </Text>
          )}
          {!!purchase.phone && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {purchase.phone}
            </Text>
          )}
        </View>
        <StatusBadge status={purchase.status} />
      </View>

      {/* Attraction */}
      <View className="flex-row items-center gap-1.5">
        <Feather name="zap" size={13} color="#9CA3AF" />
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200" numberOfLines={1}>
          {purchase.attractionName}
        </Text>
      </View>

      {/* Stats */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Stat label="Qty" value={String(purchase.quantity)} />
        <Stat label="Total" value={formatMoney(purchase.totalAmount)} />
        <Stat
          label="Paid"
          value={formatMoney(purchase.amountPaid)}
          valueClass={paidInFull ? "text-green-600" : "text-amber-600"}
        />
      </View>

      {/* Footer: payment method + created date */}
      <View className="flex-row items-center justify-between mt-3">
        <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-1 rounded-lg">
          <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {prettyMethod(purchase.paymentMethod)}
          </Text>
        </View>
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {formatDateTime(purchase.createdAt)}
        </Text>
      </View>

      {/* Scheduled */}
      {!!purchase.scheduledDate && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="calendar" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Scheduled: {formatScheduled(purchase.scheduledDate, purchase.scheduledTime)}
          </Text>
        </View>
      )}

      {/* Deleted timestamp (trashed view) */}
      {!!purchase.deletedAt && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="trash-2" size={12} color="#EF4444" />
          <Text className="text-xs text-red-500">
            Deleted: {formatDateTime(purchase.deletedAt)}
          </Text>
        </View>
      )}
    </View>
  );
};

type KpiTone = { bg: string; tint: string };

const KpiCard = ({
  icon,
  tone,
  title,
  value,
  change,
}: {
  icon: IconName;
  tone: KpiTone;
  title: string;
  value: string;
  change: string;
}) => (
  <View
    className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 m-1.5 shadow-sm"
    style={CARD_SHADOW}
  >
    <View
      className="w-9 h-9 rounded-xl items-center justify-center"
      style={{ backgroundColor: tone.bg }}
    >
      <Feather name={icon} size={18} color={tone.tint} />
    </View>
    <Text className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3">
      {title}
    </Text>
    <Text
      className="text-2xl font-bold text-gray-900 dark:text-white mt-1"
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {value}
    </Text>
    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">{change}</Text>
  </View>
);

const startOfRange = (range: Exclude<DateRange, "all">): Date => {
  const start = new Date();
  if (range === "today") start.setHours(0, 0, 0, 0);
  else if (range === "week") start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);
  return start;
};

const ManagePurchases = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";

  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  // The location drives the fetch (server-side), exactly like the web — the
  // purchase's own location_id is unreliable, so we can't filter client-side.
  const { purchases, loading, error, refetch } = useAttractionPurchases({
    locationId: locationFilter === "all" ? undefined : locationFilter,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateRange>("all");
  const [sheet, setSheet] = useState<
    null | "status" | "payment" | "date" | "location"
  >(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Deleted ("trashed") view — loaded lazily when toggled on.
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedItems, setDeletedItems] = useState<PurchaseRow[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Company admins can scope by location; options come from the dashboard
  // locationStats (the /api/locations endpoint is too heavy for mobile).
  const { data: metrics } = useDashboardMetrics({ timeframe: "all_time" });
  const locationOptions = useMemo(() => {
    if (!metrics?.locationStats) return [];
    return Object.entries(metrics.locationStats)
      .map(([id, s]) => ({ id: Number(id), name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics]);

  const loadDeleted = useCallback(async () => {
    const token = getToken();
    if (!token || !user?.id) return;
    setDeletedLoading(true);
    setDeletedError(null);
    try {
      const data = await fetchTrashedAttractionPurchases({
        token,
        userId: user.id,
        locationId: locationFilter === "all" ? undefined : locationFilter,
      });
      setDeletedItems(data);
    } catch (err) {
      setDeletedError(
        err instanceof Error ? err.message : "Failed to load deleted purchases",
      );
    } finally {
      setDeletedLoading(false);
    }
  }, [user?.id, locationFilter]);

  // Load / reload the trashed list whenever it's shown or the location changes.
  useEffect(() => {
    if (showDeleted) loadDeleted();
  }, [showDeleted, loadDeleted]);

  const toggleDeleted = () => setShowDeleted((prev) => !prev);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await (showDeleted ? loadDeleted() : refetch());
    } finally {
      setRefreshing(false);
    }
  }, [showDeleted, loadDeleted, refetch]);

  // Refetch when returning from Create Purchase so the new purchase + KPIs
  // appear without a manual pull-to-refresh (filters are preserved in state).
  useFocusEffect(
    useCallback(() => {
      if (consumeAttractionPurchasesStale()) refetch();
    }, [refetch]),
  );

  // KPI values — computed over the active set (already location-scoped by the
  // fetch), like the web metrics.
  const kpis = useMemo(() => {
    const total = purchases.length;
    const confirmed = purchases.filter((p) => p.status === "confirmed").length;
    const revenue = purchases.reduce((sum, p) => sum + p.amountPaid, 0);
    const avg = total > 0 ? revenue / total : 0;
    // Matches the web exactly: `new Set(purchases.map(p => p.email)).size` — no
    // falsy filter, so guest rows with a blank email collapse into one bucket
    // (dropping them would drift the count off the web's value by one).
    const customers = new Set(purchases.map((p) => p.email)).size;
    return { total, confirmed, revenue, avg, customers };
  }, [purchases]);

  // The list uses the active or deleted set (both already location-scoped by
  // the fetch), then narrowed by search/status/payment/date — like the web.
  const listSource = showDeleted ? deletedItems : purchases;
  const listLoading = showDeleted ? deletedLoading : loading;
  const listError = showDeleted ? deletedError : error;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rangeStart = dateFilter === "all" ? null : startOfRange(dateFilter);
    return listSource.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (paymentFilter !== "all" && p.paymentMethod !== paymentFilter) return false;
      if (rangeStart) {
        const d = new Date(p.createdAt);
        if (Number.isNaN(d.getTime()) || d < rangeStart) return false;
      }
      if (term) {
        const haystack =
          `${p.customerName} ${p.email} ${p.attractionName} ${p.phone}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [listSource, search, statusFilter, paymentFilter, dateFilter]);

  // Client-side pagination over the filtered list (matches the notifications
  // pagination: 5 / 10 / 15 per page with Previous / Next).
  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the filters, view, or page size change so
  // we never land on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    paymentFilter,
    dateFilter,
    locationFilter,
    showDeleted,
    perPage,
  ]);

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no purchases to export.");
      return;
    }
    setExporting(true);
    try {
      // Loaded lazily so these native modules never run at app startup (Expo
      // Router evaluates route modules eagerly on boot).
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "ID", "Customer Name", "Email", "Phone", "Attraction",
        "Quantity", "Total Amount", "Status", "Payment Method", "Date",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((p) =>
        [
          p.id, p.customerName, p.email, p.phone, p.attractionName,
          p.quantity, p.totalAmount, p.status, p.paymentMethod,
          p.createdAt ? new Date(p.createdAt).toLocaleString() : "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}purchases-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Purchases",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Status";
  const paymentLabel =
    PAYMENT_OPTIONS.find((o) => o.value === paymentFilter)?.label ?? "All Methods";
  const dateLabel = DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "All Time";
  const locationLabel =
    locationFilter === "all"
      ? "All Locations"
      : (locationOptions.find((l) => l.id === locationFilter)?.name ??
        "All Locations");
  const hasResults = filtered.length > 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Manage Purchases</Text>
          <View style={{ width: 36 }} />
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
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5">
          {/* Overview intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Purchases Overview
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              All customer attraction purchases at a glance
            </Text>
          </View>

          {/* Location (admin) + View Deleted + Export CSV — mirrors the web
              header controls, placed above the KPI cards. */}
          <View className="mb-5">
            {isCompanyAdmin && (
              <Pressable
                onPress={() => setSheet("location")}
                className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3"
              >
                <Feather name="map-pin" size={16} color={PRIMARY} />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  {locationLabel}
                </Text>
                <Feather name="chevron-down" size={14} color="#9CA3AF" />
              </Pressable>
            )}
            <View className="flex-row gap-3">
              <Pressable
                onPress={toggleDeleted}
                className={`flex-1 flex-row items-center justify-center gap-2 px-4 py-3.5 rounded-xl border ${
                  showDeleted
                    ? "bg-[#0644C7] border-[#0644C7]"
                    : "bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800"
                }`}
              >
                <Feather
                  name={showDeleted ? "rotate-ccw" : "archive"}
                  size={16}
                  color={showDeleted ? "#FFFFFF" : PRIMARY}
                />
                <Text
                  className={`text-xs font-semibold ${
                    showDeleted ? "text-white" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {showDeleted ? "View Active" : "View Deleted"}
                </Text>
              </Pressable>
              <Pressable
                onPress={exportCsv}
                disabled={exporting}
                className="flex-1 flex-row items-center justify-center gap-2 px-4 py-3.5 rounded-xl border bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800"
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={PRIMARY} />
                ) : (
                  <Feather name="download" size={16} color={PRIMARY} />
                )}
                <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Export CSV
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Error state */}
          {!listLoading && listError && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{listError}</Text>
            </View>
          )}

          {/* KPI cards */}
          {loading ? (
            <AttractionsKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="credit-card"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total Purchases"
                  value={String(kpis.total)}
                  change={`${kpis.confirmed} confirmed`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="check-circle"
                  tone={{ bg: "#10B98120", tint: "#10B981" }}
                  title="Total Revenue"
                  value={formatMoney(kpis.revenue)}
                  change="All time revenue"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="trending-up"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Avg. Purchase"
                  value={formatMoney(kpis.avg)}
                  change="Per transaction"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="users"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="Unique Customers"
                  value={String(kpis.customers)}
                  change="Total customers"
                />
              </View>
            </View>
          )}

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search purchases..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters: Status + Payment */}
          <View className="flex-row gap-3 mb-3">
            <Pressable
              onPress={() => setSheet("status")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="check-circle" size={16} color={PRIMARY} />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1" numberOfLines={1}>
                {statusLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSheet("payment")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="credit-card" size={16} color={PRIMARY} />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1" numberOfLines={1}>
                {paymentLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Filter: Date range */}
          <Pressable
            onPress={() => setSheet("date")}
            className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
          >
            <Feather name="calendar" size={16} color={PRIMARY} />
            <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1" numberOfLines={1}>
              {dateLabel}
            </Text>
            <Feather name="chevron-down" size={14} color="#9CA3AF" />
          </Pressable>

          {/* List header */}
          {!listLoading && !listError && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                className="text-lg font-bold text-gray-900 dark:text-white"
                numberOfLines={1}
              >
                {showDeleted ? "Deleted Purchases" : "All Purchases"}
              </Text>
              <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {filtered.length}
                </Text>
              </View>
            </View>
          )}

          {/* List / states */}
          {listLoading ? (
            <PurchasesListSkeleton />
          ) : !listError && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={showDeleted ? "archive" : "shopping-bag"}
                  size={26}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                {showDeleted ? "No deleted purchases found" : "No purchases found"}
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {listSource.length === 0
                  ? showDeleted
                    ? "There are no deleted purchases."
                    : "There are no purchases for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
            </View>
          ) : (
            !listError && (
              <>
                {paged.map((purchase) => (
                  <PurchaseCard key={purchase.id} purchase={purchase} />
                ))}

                {/* Pagination */}
                <View className="mt-1 mb-4">
                  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800">
                    <View className="flex-row items-center justify-between mb-4">
                      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        Items per page
                      </Text>
                      <View className="flex-row gap-1.5">
                        {PER_PAGE_OPTIONS.map((option) => {
                          const isActive = perPage === option;
                          return (
                            <Pressable
                              key={option}
                              onPress={() => setPerPage(option)}
                              className={`px-3 py-1.5 rounded-lg border ${
                                isActive
                                  ? "bg-[#0644C7] border-[#0644C7]"
                                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                              }`}
                            >
                              <Text
                                className={`text-xs font-medium ${
                                  isActive ? "text-white" : "text-gray-600 dark:text-gray-300"
                                }`}
                              >
                                {option}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
                      <Pressable
                        onPress={() => setPage(page - 1)}
                        disabled={page === 1}
                        className={`px-4 py-2 rounded-lg border ${
                          page === 1
                            ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            page === 1
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          Previous
                        </Text>
                      </Pressable>

                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Page {page} of {lastPage}
                      </Text>

                      <Pressable
                        onPress={() => setPage(page + 1)}
                        disabled={page >= lastPage}
                        className={`px-4 py-2 rounded-lg border ${
                          page >= lastPage
                            ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            page >= lastPage
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          Next
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Status filter */}
      <BottomSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Filter by Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setStatusFilter(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Payment method filter */}
      <BottomSheet
        visible={sheet === "payment"}
        onClose={() => setSheet(null)}
        title="Filter by Payment Method"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {PAYMENT_OPTIONS.map((option) => {
            const isSelected = paymentFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setPaymentFilter(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Date range filter */}
      <BottomSheet
        visible={sheet === "date"}
        onClose={() => setSheet(null)}
        title="Filter by Date"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {DATE_OPTIONS.map((option) => {
            const isSelected = dateFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setDateFilter(option.value);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Location filter (company admins) */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: "all" as const, name: "All Locations" }, ...locationOptions].map(
            (option) => {
              const isSelected = locationFilter === option.id;
              return (
                <Pressable
                  key={String(option.id)}
                  onPress={() => {
                    setLocationFilter(option.id);
                    setSheet(null);
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium flex-1 mr-2 ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                    numberOfLines={1}
                  >
                    {option.name}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            },
          )}
        </ScrollView>
      </BottomSheet>

      {/* Floating Action Button — Create Purchase (mirrors the web "New
          Purchase" button). No floating tab bar on this pushed route. */}
      <Pressable
        onPress={() => router.push("/attractions/create-purchase" as never)}
        accessibilityRole="button"
        accessibilityLabel="Create purchase"
        style={{
          position: "absolute",
          right: 20,
          bottom: insets.bottom + 20,
          shadowColor: PRIMARY,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
        }}
        className="h-14 w-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
      >
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
};

export default ManagePurchases;
