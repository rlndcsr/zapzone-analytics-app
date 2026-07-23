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

import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { PaginationControls } from "../../components/ui/PaginationControls";
import {
  countActivePurchaseFilters,
  EMPTY_PURCHASE_FILTERS,
  PurchaseFiltersSheet,
  type PurchaseDateTarget,
  type PurchaseFilterValues,
} from "../../components/ui/PurchaseFiltersSheet";
import {
  PurchasesBulkBar,
  type PurchaseBulkAction,
} from "../../components/ui/PurchasesBulkBar";
import { PurchasesTable } from "../../components/ui/PurchasesTable";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { PurchasesListSkeleton } from "../../components/ui/skeleton/AttractionPurchasesSkeleton";
import { AttractionsKpiSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  consumeAttractionPurchasesStale,
  useAttractionPurchases,
} from "../../lib/hooks/useAttractionPurchases";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteAttractionPurchase,
  fetchTrashedAttractionPurchases,
  updateAttractionPurchaseStatus,
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

const PER_PAGE_OPTIONS = [5, 10, 15];

// Status options offered by the per-row "Set Status" picker, matching the web
// purchase status dropdown (Confirmed · Pending · Checked In · Cancelled ·
// Refunded).
const STATUS_PICKER_OPTIONS: PurchaseStatus[] = [
  "confirmed",
  "pending",
  "checked-in",
  "cancelled",
  "refunded",
];

const STATUS_BADGE: Record<PurchaseStatus, string> = {
  confirmed: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  "checked-in":
    "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  pending:
    "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  cancelled: "bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400",
  refunded:
    "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
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
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
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

const Stat = ({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) => (
  <View>
    <Text className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">
      {label}
    </Text>
    <Text
      className={`text-sm font-bold text-gray-900 dark:text-white ${valueClass}`}
    >
      {value}
    </Text>
  </View>
);

const PurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: PurchaseRow;
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
            <Text
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
              numberOfLines={1}
            >
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
        <Text
          className="text-sm font-medium text-gray-700 dark:text-gray-200"
          numberOfLines={1}
        >
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
            Scheduled:{" "}
            {formatScheduled(purchase.scheduledDate, purchase.scheduledTime)}
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
    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
      {change}
    </Text>
  </View>
);

const ManagePurchases = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const user = getCurrentUser();

  // The global workspace location drives the fetch (server-side), exactly like
  // the web — the purchase's own location_id is unreliable for client filtering.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  const { purchases, loading, error, refetch } = useAttractionPurchases({
    locationId: activeLocationId,
  });

  const [search, setSearch] = useState("");
  // Committed filters (drive the list) + the sheet's draft (committed on Apply).
  const [filters, setFilters] = useState<PurchaseFilterValues>(
    EMPTY_PURCHASE_FILTERS,
  );
  const [draft, setDraft] = useState<PurchaseFilterValues>(
    EMPTY_PURCHASE_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [dateTarget, setDateTarget] = useState<PurchaseDateTarget>("created");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  // Presentation layout for the active list — table by default (card view via
  // toggle). Both render the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Bulk-selection (active list, table view). Single source of truth for which
  // rows are selected; `bulkBusy` marks the in-flight bulk action.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<PurchaseBulkAction | null>(null);
  // Row whose "Set Status" picker sheet is open; `statusBusy` locks it while
  // the status update is in flight.
  const [statusPurchase, setStatusPurchase] = useState<PurchaseRow | null>(
    null,
  );
  const [statusBusy, setStatusBusy] = useState(false);

  // Deleted ("trashed") view — loaded lazily when toggled on.
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedItems, setDeletedItems] = useState<PurchaseRow[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadDeleted = useCallback(async () => {
    const token = getToken();
    if (!token || !user?.id) return;
    setDeletedLoading(true);
    setDeletedError(null);
    try {
      const data = await fetchTrashedAttractionPurchases({
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

  // Search + the full web-admin filter set. Predicates mirror the web
  // `useAdminTable`: select equality, inclusive date ranges on created_at /
  // scheduled_date, and an inclusive amount range (empty = unbounded).
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const amountMin =
      filters.amountMin === "" ? null : parseFloat(filters.amountMin);
    const amountMax =
      filters.amountMax === "" ? null : parseFloat(filters.amountMax);
    const { createdFrom, createdTo, scheduledFrom, scheduledTo } = filters;

    return listSource.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (
        filters.paymentMethod !== "all" &&
        p.paymentMethod !== filters.paymentMethod
      )
        return false;
      if (
        filters.attraction !== "all" &&
        p.attractionName !== filters.attraction
      )
        return false;
      if (createdFrom || createdTo) {
        const d = p.createdAt ? p.createdAt.substring(0, 10) : null;
        if (!d) return false;
        if (createdFrom && d < createdFrom) return false;
        if (createdTo && d > createdTo) return false;
      }
      if (scheduledFrom || scheduledTo) {
        const d = p.scheduledDate ? p.scheduledDate.substring(0, 10) : null;
        if (!d) return false;
        if (scheduledFrom && d < scheduledFrom) return false;
        if (scheduledTo && d > scheduledTo) return false;
      }
      if (
        amountMin != null &&
        !Number.isNaN(amountMin) &&
        p.totalAmount < amountMin
      )
        return false;
      if (
        amountMax != null &&
        !Number.isNaN(amountMax) &&
        p.totalAmount > amountMax
      )
        return false;
      if (term) {
        const haystack =
          `${p.customerName} ${p.email} ${p.attractionName} ${p.phone}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [listSource, search, filters]);

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
  }, [search, filters, activeLocationId, showDeleted, perPage]);

  // Keep the current page valid after the list shrinks (e.g. a bulk delete).
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  // Selection is scoped to the visible active-list page: clear it whenever the
  // visible set changes or we leave the table, so a bulk action never touches
  // off-screen (or deleted) rows.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filters, activeLocationId, perPage, page, viewMode, showDeleted]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Header checkbox — select / deselect every purchase on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const all = paged.length > 0 && paged.every((p) => prev.has(p.id));
      return all ? new Set() : new Set(paged.map((p) => p.id));
    });
  }, [paged]);

  // Bulk status change — mirrors the web bulk bar, which loops updatePurchase
  // per id (there's no bulk-status endpoint). Refetches + clears selection;
  // filters, search and the current page are preserved.
  const runBulkStatus = useCallback(
    async (status: Exclude<PurchaseBulkAction, "delete">) => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const ids = [...selectedIds];
      setBulkBusy(status);
      try {
        await Promise.all(
          ids.map((id) => updateAttractionPurchaseStatus(token, id, status)),
        );
        setSelectedIds(new Set());
        await refetch();
      } catch (err) {
        Alert.alert(
          "Update failed",
          err instanceof Error
            ? err.message
            : "Could not update the selected purchases.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, refetch],
  );

  // Bulk delete — same confirmation + per-id soft-delete the web bulk bar uses.
  const confirmBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      "Delete purchases",
      `Are you sure you want to delete ${count} purchase record(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            const ids = [...selectedIds];
            setBulkBusy("delete");
            try {
              await Promise.all(
                ids.map((id) => deleteAttractionPurchase(token, id)),
              );
              setSelectedIds(new Set());
              await refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the selected purchases.",
              );
            } finally {
              setBulkBusy(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // Per-row delete (table Actions) — same soft-delete endpoint as the bulk bar.
  const handleRowDelete = useCallback(
    (p: PurchaseRow) => {
      Alert.alert(
        "Delete purchase",
        `Are you sure you want to delete the purchase for ${p.customerName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) return;
              try {
                await deleteAttractionPurchase(token, p.id);
                await refetch();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error
                    ? err.message
                    : "Could not delete the purchase.",
                );
              }
            },
          },
        ],
      );
    },
    [refetch],
  );

  // Per-row status — the pill opens a "Set Status" picker sheet (consistent
  // with the Manage Accounts table). Applying calls the same per-id status
  // endpoint the bulk bar loops over.
  const applyPurchaseStatus = useCallback(
    async (status: PurchaseStatus) => {
      const p = statusPurchase;
      if (!p) return;
      if (p.status === status) {
        setStatusPurchase(null);
        return;
      }
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again.");
        return;
      }
      setStatusBusy(true);
      try {
        await updateAttractionPurchaseStatus(token, p.id, status);
        await refetch();
        setStatusPurchase(null);
      } catch (err) {
        Alert.alert(
          "Update failed",
          err instanceof Error
            ? err.message
            : "Could not update the purchase status.",
        );
      } finally {
        setStatusBusy(false);
      }
    },
    [statusPurchase, refetch],
  );

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
        "ID",
        "Customer Name",
        "Email",
        "Phone",
        "Attraction",
        "Quantity",
        "Total Amount",
        "Status",
        "Payment Method",
        "Date",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((p) =>
        [
          p.id,
          p.customerName,
          p.email,
          p.phone,
          p.attractionName,
          p.quantity,
          p.totalAmount,
          p.status,
          p.paymentMethod,
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
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
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

  const activeFilterCount = countActivePurchaseFilters(filters);

  // Attraction options — unique names from the active set (mirrors web).
  const attractionOptions = useMemo(
    () =>
      [
        ...new Set(listSource.map((p) => p.attractionName).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b)),
    [listSource],
  );

  // Open the sheet on a fresh draft seeded from the committed filters.
  const openFilters = useCallback(() => {
    setDraft(filters);
    setShowFilterSheet(true);
  }, [filters]);

  // Date ranges reuse the shared calendar. The sheet is a native Modal, so we
  // fully close it before opening the calendar (two stacked Modals crash Android).
  const openDateRange = useCallback((target: PurchaseDateTarget) => {
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
      setDraft((f) =>
        dateTarget === "created"
          ? { ...f, createdFrom: start, createdTo: end }
          : { ...f, scheduledFrom: start, scheduledTo: end },
      );
      setShowDateSheet(false);
      setTimeout(() => setShowFilterSheet(true), 280);
    },
    [dateTarget],
  );

  // Apply commits the draft; Cancel just closes (draft discarded on next open).
  const applyFilters = useCallback(() => {
    setFilters(draft);
    setShowFilterSheet(false);
  }, [draft]);

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Manage Purchases
          </Text>
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
        <View className="px-5 mt-5">
          {/* Secondary "Export CSV" + primary "New Purchase" on one row (~50/50)
              to save vertical space. Export stays outlined/secondary; New
              Purchase remains the primary filled CTA. */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable
              onPress={exportCsv}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <Feather name="download" size={16} color="#6B7280" />
              )}
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                Export CSV
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/attractions/create-purchase")}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text
                numberOfLines={1}
                className="text-sm font-semibold text-white"
              >
                New Purchase
              </Text>
            </Pressable>
          </View>

          {/* Error state */}
          {!listLoading && listError && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
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

          {/* "Filters" button (→ sheet, badge = active count) + the View Deleted
              toggle, which is a view switch (kept outside the sheet, like web). */}
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={openFilters}
              accessibilityRole="button"
              accessibilityLabel={`Open filters${
                activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""
              }`}
              className="flex-1 flex-row items-center gap-2.5 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 active:opacity-70"
            >
              <Feather name="filter" size={16} color="#6B7280" />
              <Text className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-[11px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setShowDeleted((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={
                showDeleted ? "View active purchases" : "View deleted purchases"
              }
              className={`flex-row items-center gap-2 px-4 py-3.5 rounded-xl border active:opacity-70 ${
                showDeleted
                  ? "bg-blue-50 dark:bg-blue-900/20 border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800"
              }`}
            >
              <Feather
                name={showDeleted ? "rotate-ccw" : "archive"}
                size={16}
                color={showDeleted ? PRIMARY : "#6B7280"}
              />
              <Text
                className={`text-sm font-semibold ${
                  showDeleted
                    ? "text-[#0644C7] dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                {showDeleted ? "Active" : "Deleted"}
              </Text>
            </Pressable>
          </View>

          {/* List header + layout toggle — stays visible during loading; only
              the records below skeletonize. */}
          {!listError && (
            <View className="flex-row items-center gap-2 mb-4 flex-wrap pt-4">
              <Text
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
                numberOfLines={1}
              >
                {showDeleted ? "Deleted Purchases" : "All Purchases"}
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {filtered.length}
                </Text>
              </View>

              {/* Table/Cards toggle — active list only (deleted stays cards). */}
              {!showDeleted && (
                <View className="ml-auto">
                  <ViewToggle mode={viewMode} onChange={setViewMode} />
                </View>
              )}
            </View>
          )}

          {/* Bulk-action toolbar — table view of the active list, shown while a
              selection exists; disappears when selection is cleared. */}
          {!showDeleted && viewMode === "table" && selectedIds.size > 0 && (
            <PurchasesBulkBar
              count={selectedIds.size}
              busy={bulkBusy}
              onStatus={runBulkStatus}
              onDelete={confirmBulkDelete}
              onClear={clearSelection}
            />
          )}

          {/* List / states */}
          {listLoading ? (
            <PurchasesListSkeleton view={showDeleted ? "cards" : viewMode} />
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
                {showDeleted
                  ? "No deleted purchases found"
                  : "No purchases found"}
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
                {/* Table (default) and card layouts render from the same `paged`
                    slice — switching is instant and never refetches. The deleted
                    list keeps cards. Row/card tap both open Purchase Details. */}
                {!showDeleted && viewMode === "table" ? (
                  <PurchasesTable
                    purchases={paged}
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onToggleAll={toggleAllVisible}
                    onRowPress={(purchase) =>
                      router.push({
                        pathname: "/attractions/purchase-details",
                        params: { id: String(purchase.id) },
                      })
                    }
                    onStatusPress={setStatusPurchase}
                    onDelete={handleRowDelete}
                  />
                ) : (
                  paged.map((purchase) => (
                    <PurchaseCard
                      key={purchase.id}
                      purchase={purchase}
                      onPress={() =>
                        router.push({
                          pathname: "/attractions/purchase-details",
                          params: { id: String(purchase.id) },
                        })
                      }
                    />
                  ))
                )}

                {/* Pagination — shared control (same as Attractions/Bookings). */}
                <PaginationControls
                  page={page}
                  lastPage={lastPage}
                  perPage={perPage}
                  perPageOptions={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Web-parity filters: Status · Payment · Attraction · Purchase Date ·
          Scheduled Date · Total Amount. */}
      <PurchaseFiltersSheet
        visible={showFilterSheet}
        values={draft}
        attractions={attractionOptions}
        onChange={setDraft}
        onApply={applyFilters}
        onClear={() => setDraft(EMPTY_PURCHASE_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenDateRange={openDateRange}
      />

      {/* Shared range calendar for Purchase / Scheduled date, opened only after
          the filter sheet closes so two native Modals are never stacked. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={
          (dateTarget === "created"
            ? draft.createdFrom
            : draft.scheduledFrom) || undefined
        }
        initialEnd={
          (dateTarget === "created" ? draft.createdTo : draft.scheduledTo) ||
          undefined
        }
        onClose={closeDateRange}
        onApply={applyDateRange}
      />

      {/* Per-row status picker (table Actions). Same sheet-based pattern as the
          Manage Accounts "Set Status" picker, so the style stays consistent. */}
      <BottomSheet
        visible={statusPurchase !== null}
        onClose={() => (statusBusy ? undefined : setStatusPurchase(null))}
        title="Set Status"
      >
        <View className="px-4 pb-8">
          {statusBusy ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            STATUS_PICKER_OPTIONS.map((option) => {
              const isSelected = statusPurchase?.status === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => applyPurchaseStatus(option)}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-medium ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {prettyStatus(option)}
                  </Text>
                  {isSelected && (
                    <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                      <Feather name="check" size={14} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </BottomSheet>
    </View>
  );
};

export default ManagePurchases;
