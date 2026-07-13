import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
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

import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import {
  EMPTY_EVENT_PURCHASE_FILTERS,
  EventPurchaseFiltersSheet,
  countActiveEventPurchaseFilters,
  type EventPurchaseDateTarget,
  type EventPurchaseFilterValues,
} from "../../components/ui/EventPurchaseFiltersSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { AttractionsKpiSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { PurchasesListSkeleton } from "../../components/ui/skeleton/AttractionPurchasesSkeleton";
import {
  consumeEventPurchasesStale,
  useEventPurchases,
} from "../../lib/hooks/useEventPurchases";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchTrashedEventPurchases,
  type EventPaymentStatus,
  type EventPurchaseRow,
  type EventPurchaseStatus,
} from "../../services/eventPurchasesService";

const PRIMARY = "#0644C7";

type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [5, 10, 15];

// Default list ordering — mirrors the web Event Purchases page exactly: sort by
// status priority first, then newest-created first within the same status.
// (Includes refunded/voided for forward-parity even though the mobile status
// union omits them; unknown statuses fall back to 3, like the web.)
const STATUS_PRIORITY: Record<string, number> = {
  confirmed: 0,
  pending: 1,
  completed: 2,
  "checked-in": 3,
  cancelled: 4,
  refunded: 5,
  voided: 6,
};

const STATUS_BADGE: Record<EventPurchaseStatus, string> = {
  confirmed: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "checked-in": "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  completed: "bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400",
  pending: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  cancelled: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
};

const PAYMENT_STATUS_BADGE: Record<EventPaymentStatus, string> = {
  paid: "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  partial: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  pending: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
  refunded: "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  voided: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

// Payment-method labels matching the web ("Authorize Net", "In-Store", …).
const METHOD_LABELS: Record<string, string> = {
  "authorize.net": "Authorize Net",
  "in-store": "In-Store",
  paylater: "Pay Later",
  card: "Card",
  cash: "Cash",
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function prettyStatus(status: EventPurchaseStatus): string {
  return status === "checked-in"
    ? "Checked In"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function prettyPaymentStatus(status: EventPaymentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function prettyMethod(method: string): string {
  if (!method) return "—";
  return (
    METHOD_LABELS[method] ??
    (() => {
      const spaced = method.replace(/_/g, " ");
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    })()
  );
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

const StatusBadge = ({ status }: { status: EventPurchaseStatus }) => {
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

const PaymentBadge = ({ status }: { status: EventPaymentStatus }) => {
  const cls = PAYMENT_STATUS_BADGE[status] ?? PAYMENT_STATUS_BADGE.pending;
  const [bg1, bg2, fg1, fg2] = cls.split(" ");
  return (
    <View className={`px-2.5 py-1 rounded-full ${bg1} ${bg2}`}>
      <Text className={`text-xs font-semibold ${fg1} ${fg2}`}>
        {prettyPaymentStatus(status)}
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

const PurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: EventPurchaseRow;
  onPress: () => void;
}) => {
  const paidInFull = purchase.amountPaid >= purchase.totalAmount;
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`View purchase for ${purchase.customerName}`}
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
          {!!purchase.referenceNumber && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {purchase.referenceNumber}
            </Text>
          )}
        </View>
        <StatusBadge status={purchase.status} />
      </View>

      {/* Event */}
      <View className="flex-row items-center gap-1.5">
        <Feather name="calendar" size={13} color="#9CA3AF" />
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200" numberOfLines={1}>
          {purchase.eventName}
        </Text>
      </View>

      {/* Stats */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Stat label="Tickets" value={String(purchase.quantity)} />
        <Stat label="Total" value={formatMoney(purchase.totalAmount)} />
        <Stat
          label="Paid"
          value={formatMoney(purchase.amountPaid)}
          valueClass={paidInFull ? "text-green-600" : "text-amber-600"}
        />
      </View>

      {/* Footer: payment method + payment status + created date */}
      <View className="flex-row items-center justify-between mt-3">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-1 rounded-lg">
            <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {prettyMethod(purchase.paymentMethod)}
            </Text>
          </View>
          <PaymentBadge status={purchase.paymentStatus} />
        </View>
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {formatDateTime(purchase.createdAt)}
        </Text>
      </View>

      {/* Scheduled */}
      {!!purchase.purchaseDate && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="clock" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Event: {formatScheduled(purchase.purchaseDate, purchase.purchaseTime)}
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
    </Pressable>
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

const EventPurchases = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();

  // The global workspace location drives the fetch (server-side), exactly like
  // the web — the purchase's own location_id is unreliable for client filtering.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  const { purchases, loading, error, refetch } = useEventPurchases({
    locationId: activeLocationId,
  });

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EventPurchaseFilterValues>(
    EMPTY_EVENT_PURCHASE_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [dateTarget, setDateTarget] = useState<EventPurchaseDateTarget>("created");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Deleted ("trashed") view — loaded lazily when toggled on.
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedItems, setDeletedItems] = useState<EventPurchaseRow[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadDeleted = useCallback(async () => {
    const token = getToken();
    if (!token || !user?.id) return;
    setDeletedLoading(true);
    setDeletedError(null);
    try {
      const data = await fetchTrashedEventPurchases({
        token,
        userId: user.id,
        locationId: activeLocationId,
      });
      setDeletedItems(data);
    } catch (err) {
      setDeletedError(
        err instanceof Error ? err.message : "Failed to load deleted purchases",
      );
    } finally {
      setDeletedLoading(false);
    }
  }, [user?.id, activeLocationId]);

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
      if (consumeEventPurchasesStale()) refetch();
    }, [refetch]),
  );

  // KPI values — computed over the active set (already location-scoped by the
  // fetch), like the web metrics.
  // KPI math mirrors the web EventPurchases metrics exactly: revenue is the
  // sum of total_amount (not amount paid), and Avg. Purchase = revenue / count.
  const kpis = useMemo(() => {
    const total = purchases.length;
    const confirmed = purchases.filter((p) => p.status === "confirmed").length;
    const revenue = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
    const avg = total > 0 ? revenue / total : 0;
    const customers = new Set(purchases.map((p) => p.email)).size;
    return { total, confirmed, revenue, avg, customers };
  }, [purchases]);

  // The list uses the active or deleted set (both already location-scoped by
  // the fetch), then narrowed by search/status/payment/date — like the web.
  const listSource = showDeleted ? deletedItems : purchases;
  const listLoading = showDeleted ? deletedLoading : loading;
  const listError = showDeleted ? deletedError : error;

  // Search + the full web-admin filter set over the active/deleted set (already
  // location-scoped by the fetch). Predicate semantics mirror the web
  // `useAdminTable` exactly (select equality, guest/balance derivations,
  // inclusive date ranges on created_at + purchase_date, inclusive amount range
  // with empty = unbounded). All client-side, like the web.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const amountMin = filters.amountMin === "" ? null : parseFloat(filters.amountMin);
    const amountMax = filters.amountMax === "" ? null : parseFloat(filters.amountMax);
    const { createdFrom, createdTo, scheduledFrom, scheduledTo } = filters;

    return listSource
      .filter((p) => {
        if (filters.status !== "all" && p.status !== filters.status) return false;
        if (filters.event !== "all" && p.eventName !== filters.event) return false;
        if (
          filters.paymentMethod !== "all" &&
          p.paymentMethod !== filters.paymentMethod
        )
          return false;
        if (
          filters.paymentStatus !== "all" &&
          p.paymentStatus !== filters.paymentStatus
        )
          return false;
        if (filters.customerType !== "all") {
          if (filters.customerType === "guest" && !p.isGuest) return false;
          if (filters.customerType === "registered" && p.isGuest) return false;
        }
        if (filters.balance !== "all") {
          const due = p.amountPaid < p.totalAmount;
          if (filters.balance === "due" && !due) return false;
          if (filters.balance === "paid" && due) return false;
        }
        if (createdFrom || createdTo) {
          const d = p.createdAt ? p.createdAt.substring(0, 10) : null;
          if (!d) return false;
          if (createdFrom && d < createdFrom) return false;
          if (createdTo && d > createdTo) return false;
        }
        if (scheduledFrom || scheduledTo) {
          const d = p.purchaseDate ? p.purchaseDate.substring(0, 10) : null;
          if (!d) return false;
          if (scheduledFrom && d < scheduledFrom) return false;
          if (scheduledTo && d > scheduledTo) return false;
        }
        if (amountMin != null && !Number.isNaN(amountMin) && p.totalAmount < amountMin)
          return false;
        if (amountMax != null && !Number.isNaN(amountMax) && p.totalAmount > amountMax)
          return false;
        if (term) {
          const haystack =
            `${p.customerName} ${p.email} ${p.eventName} ${p.phone} ${p.referenceNumber}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      // Default ordering identical to the web: status priority, then newest first.
      .sort((a, b) => {
        const priorityDiff =
          (STATUS_PRIORITY[a.status] ?? 3) - (STATUS_PRIORITY[b.status] ?? 3);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [listSource, search, filters]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, filters, activeLocationId, showDeleted, perPage]);

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
        "ID", "Reference", "Customer Name", "Email", "Phone", "Event",
        "Tickets", "Total Amount", "Status", "Payment Method", "Date",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((p) =>
        [
          p.id, p.referenceNumber, p.customerName, p.email, p.phone, p.eventName,
          p.quantity, p.totalAmount, p.status, p.paymentMethod,
          p.createdAt ? new Date(p.createdAt).toLocaleString() : "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}event-purchases-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Event Purchases",
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

  const activeFilterCount = countActiveEventPurchaseFilters(filters);

  // Event options for the Event filter — unique event names from the active set
  // (mirrors the web `eventOptions`).
  const eventOptions = useMemo(
    () =>
      [...new Set(listSource.map((p) => p.eventName).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [listSource],
  );

  // Date ranges reuse the shared range calendar. The filter sheet is a native
  // Modal, so we fully close it before opening the calendar (and reopen after)
  // — two stacked native Modals crash Android's new architecture.
  const openDateRange = useCallback((target: EventPurchaseDateTarget) => {
    setDateTarget(target);
    setShowFilterSheet(false);
    setTimeout(() => setShowDateSheet(true), 280);
  }, []);
  const closeDateRange = useCallback(() => {
    setShowDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);
  const applyDateRange = useCallback(
    (start: string, end: string) => {
      setFilters((f) =>
        dateTarget === "created"
          ? { ...f, createdFrom: start, createdTo: end }
          : { ...f, scheduledFrom: start, scheduledTo: end },
      );
      setShowDateSheet(false);
      setTimeout(() => setShowFilterSheet(true), 280);
    },
    [dateTarget],
  );

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Event Purchases</Text>
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
              All customer event ticket purchases at a glance
            </Text>
          </View>

          {/* Header controls — full-width segmented pill (Location · View
              Deleted · Export CSV), mirrors the web header controls. */}
          <FilterPill>
            <PillSegment
              label={showDeleted ? "View Active" : "View Deleted"}
              active={showDeleted}
              onPress={toggleDeleted}
              renderIcon={(c) => (
                <Feather
                  name={showDeleted ? "rotate-ccw" : "archive"}
                  size={15}
                  color={c}
                />
              )}
            />
            <PillSegment
              label="Export CSV"
              onPress={exportCsv}
              renderIcon={(c) =>
                exporting ? (
                  <ActivityIndicator size="small" color={c} />
                ) : (
                  <Feather name="download" size={15} color={c} />
                )
              }
            />
          </FilterPill>

          <Pressable
            onPress={() => router.push("/events/create-purchase")}
            className="flex-row mb-5 items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Event Purchase
            </Text>
          </Pressable>

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
                  icon="dollar-sign"
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

          {/* Filters — opens the full filter panel (all web-admin filters). */}
          <FilterPill>
            <PillSegment
              label={
                activeFilterCount > 0
                  ? `Filters (${activeFilterCount})`
                  : "Filters"
              }
              active={showFilterSheet || activeFilterCount > 0}
              onPress={() => setShowFilterSheet(true)}
              renderIcon={(c) => <Feather name="sliders" size={15} color={c} />}
            />
          </FilterPill>

          

          {/* List header */}
          {!listLoading && !listError && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
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
                    : "There are no event purchases for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
            </View>
          ) : (
            !listError && (
              <>
                {paged.map((purchase) => (
                  <PurchaseCard
                    key={purchase.id}
                    purchase={purchase}
                    onPress={() =>
                      router.push({
                        pathname: "/events/purchase-details",
                        params: { id: String(purchase.id) },
                      })
                    }
                  />
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

      {/* Full filter panel — every web-admin filter in one sheet. */}
      <EventPurchaseFiltersSheet
        visible={showFilterSheet}
        values={filters}
        events={eventOptions}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_EVENT_PURCHASE_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenDateRange={openDateRange}
      />

      {/* Shared range calendar for Created / Scheduled date, opened after the
          filter sheet closes so two native Modals are never mounted at once. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={
          (dateTarget === "created"
            ? filters.createdFrom
            : filters.scheduledFrom) || undefined
        }
        initialEnd={
          (dateTarget === "created" ? filters.createdTo : filters.scheduledTo) ||
          undefined
        }
        onClose={closeDateRange}
        onApply={applyDateRange}
      />

    </View>
  );
};

export default EventPurchases;
