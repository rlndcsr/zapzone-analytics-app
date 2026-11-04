import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  ALL_CATEGORIES,
  buildCategoryOptions,
  CategoryChips,
} from "../../components/ui/CategoryChips";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
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
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  PurchaseStatusBadge,
  formatMoney,
  formatPurchaseDateTime,
  formatScheduled,
  paymentLabel,
  prettyStatus,
  purchaseStatusTone,
} from "../../lib/attractions/purchaseDisplay";
import { categoryKeyOf } from "../../lib/calendar/categoryFilter";
import {
  consumeAttractionPurchasesStale,
  useAttractionPurchases,
} from "../../lib/hooks/useAttractionPurchases";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { countTransactions } from "../../lib/purchaseMetrics";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteAttractionPurchase,
  fetchTrashedAttractionPurchases,
  updateAttractionPurchaseStatus,
  type PurchaseRow,
  type PurchaseStatus,
} from "../../services/attractionPurchasesService";

const PRIMARY = "#0644C7";

const PER_PAGE_OPTIONS = [5, 10, 15];

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

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

/** One labelled cell in the card's Qty / Total / Paid strip. */
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
 * Card layout for a single purchase, matching the Manage Attractions card:
 * name + status, a contact line, the attraction, a Qty / Total / Paid strip
 * and a quiet footer. Tapping anywhere opens Purchase Details.
 */
const PurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: PurchaseRow;
  onPress: () => void;
}) => {
  const paidInFull = purchase.amountPaid >= purchase.totalAmount;
  const contact = [purchase.email, purchase.phone].filter(Boolean).join("  ·  ");
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`View purchase for ${purchase.customerName}`}
    >
      {/* Customer + status */}
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
        <PurchaseStatusBadge status={purchase.status} />
      </View>

      {/* Email · phone */}
      {!!contact && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-1"
          numberOfLines={1}
        >
          {contact}
        </Text>
      )}

      {/* Attraction */}
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="zap" size={13} color="#9CA3AF" />
        <Text
          className="shrink text-[13px] font-medium text-gray-700 dark:text-gray-200"
          numberOfLines={1}
        >
          {purchase.attractionName}
        </Text>
      </View>

      {/* Qty / Total / Paid */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <Spec label="Qty" value={String(purchase.quantity)} />
        <Spec
          divider
          label="Total"
          value={formatMoney(purchase.totalAmount)}
        />
        <Spec
          divider
          label="Paid"
          value={formatMoney(purchase.amountPaid)}
          valueClass={
            paidInFull
              ? "text-green-700 dark:text-green-400"
              : "text-amber-700 dark:text-amber-400"
          }
        />
      </View>

      {/* Scheduled */}
      {!!purchase.scheduledDate && (
        <View className="flex-row items-center gap-1.5 mt-3">
          <Feather name="calendar" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Scheduled{" "}
            {formatScheduled(purchase.scheduledDate, purchase.scheduledTime)}
          </Text>
        </View>
      )}

      {/* Deleted timestamp (trashed view) */}
      {!!purchase.deletedAt && (
        <View className="flex-row items-center gap-1.5 mt-2">
          <Feather name="trash-2" size={12} color="#DC2626" />
          <Text className="text-xs text-red-600 dark:text-red-400">
            Deleted {formatPurchaseDateTime(purchase.deletedAt)}
          </Text>
        </View>
      )}

      {/* Payment · purchased date + affordance */}
      <View className="flex-row items-center justify-between gap-3 mt-3">
        <Text
          numberOfLines={1}
          className="shrink text-xs text-gray-400 dark:text-gray-500"
        >
          {paymentLabel(purchase.paymentMethod)}
          {purchase.createdAt
            ? `  ·  ${formatPurchaseDateTime(purchase.createdAt)}`
            : ""}
        </Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Details
          </Text>
          <Feather name="chevron-right" size={14} color="#9CA3AF" />
        </View>
      </View>
    </Pressable>
  );
};

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
  const [perPage, setPerPage] = useState(5);
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
    const lines = purchases.length;
    const total = countTransactions(purchases);
    const confirmed = purchases.filter((p) => p.status === "confirmed").length;
    const revenue = purchases.reduce((sum, p) => sum + p.amountPaid, 0);
    const avg = total > 0 ? revenue / total : 0;
    // Matches the web exactly: `new Set(purchases.map(p => p.email)).size` — no
    // falsy filter, so guest rows with a blank email collapse into one bucket
    // (dropping them would drift the count off the web's value by one).
    const customers = new Set(purchases.map((p) => p.email)).size;
    return { total, lines, confirmed, revenue, avg, customers };
  }, [purchases]);

  // The list uses the active or deleted set (both already location-scoped by
  // the fetch), then narrowed by search/status/payment/date — like the web.
  const listSource = showDeleted ? deletedItems : purchases;
  const listLoading = showDeleted ? deletedLoading : loading;
  const listError = showDeleted ? deletedError : error;

  // Chip counts come from the same location-scoped set the list draws from, so
  // a category never appears for a location the workspace is not showing.
  const categoryOptions = useMemo(
    () => buildCategoryOptions(listSource.map((p) => p.category)),
    [listSource],
  );

  // Drop a selection the visible set no longer holds (switching location or the
  // deleted view), so the list can never be filtered down to nothing by a key
  // that has no chip to clear it — the same rule the calendar tabs follow.
  useEffect(() => {
    if (
      filters.category !== ALL_CATEGORIES &&
      !categoryOptions.some((o) => o.value === filters.category)
    ) {
      setFilters((prev) => ({ ...prev, category: ALL_CATEGORIES }));
    }
  }, [categoryOptions, filters.category]);

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
        filters.category !== ALL_CATEGORIES &&
        categoryKeyOf(p.category) !== filters.category
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
          p.createdAt ? formatPurchaseDateTime(p.createdAt) : "",
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

  const openPurchaseDetails = useCallback((purchase: PurchaseRow) => {
    router.push({
      pathname: "/attractions/purchase-details",
      params: { id: String(purchase.id) },
    });
  }, []);

  // The page's secondary actions as module-hub shortcuts, like the Manage
  // Attractions "More" row. Deleted Purchases flips the list to the trashed
  // view (and back); Export CSV shares the filtered rows.
  const moreShortcuts: HubQuickLink[] = [
    { label: "Bulk Orders", icon: "layers", route: "/attractions/orders" },
    { label: "Check-In", icon: "check-square", route: "/check-in" },
    {
      label: showDeleted ? "Active Purchases" : "Deleted Purchases",
      icon: showDeleted ? "rotate-ccw" : "archive",
      onPress: () => setShowDeleted((v) => !v),
    },
    {
      label: "Export CSV",
      icon: "file-text",
      onPress: () => {
        if (!exporting) exportCsv();
      },
    },
  ];

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
            Manage Purchases
          </Text>
          <Pressable
            onPress={() => router.push("/attractions/create-purchase")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New purchase"
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
          {!listLoading && listError && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {showDeleted
                    ? "Could not load deleted purchases"
                    : "Could not load purchases"}
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {listError}
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
          {loading ? (
            <AttractionsSummarySkeleton />
          ) : (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="flex-row">
                <SummaryCell
                  icon="shopping-bag"
                  title="Total Purchases"
                  value={String(kpis.total)}
                  hint={`${kpis.lines} lines · ${kpis.confirmed} confirmed`}
                />
                <SummaryCell
                  divideLeft
                  icon="dollar-sign"
                  title="Total Revenue"
                  value={formatMoney(kpis.revenue)}
                  hint="All time revenue"
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="trending-up"
                  title="Avg. Purchase"
                  value={formatMoney(kpis.avg)}
                  hint="Per transaction"
                />
                <SummaryCell
                  divideTop
                  divideLeft
                  icon="users"
                  title="Unique Customers"
                  value={String(kpis.customers)}
                  hint="Total customers"
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
                placeholder="Search purchases"
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
              onPress={openFilters}
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
                onPress={() => setFilters(EMPTY_PURCHASE_FILTERS)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* Deleted-view hint — the More shortcut switched the list to the
              trashed purchases; this is the one-tap way back. */}
          {showDeleted && (
            <View className="flex-row items-center gap-2 mb-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="archive" size={14} color="#6B7280" />
              <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
                Showing deleted purchases
              </Text>
              <Pressable
                onPress={() => setShowDeleted(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to active purchases"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Back to active
                </Text>
              </Pressable>
            </View>
          )}

          {/* Category chips — active list only, matching the web (the trashed
              view has no chip row). Backed by the same `category` filter the
              sheet writes, so the two stay in step. */}
          {!showDeleted && (
            <CategoryChips
              options={categoryOptions}
              value={filters.category}
              onChange={(next) =>
                setFilters((prev) => ({ ...prev, category: next }))
              }
              totalCount={listSource.length}
              allLabel="All Categories"
            />
          )}

          {/* List header — title + count, layout toggle (active list only;
              the deleted list stays cards). Stays visible during loading;
              only the records below skeletonize. */}
          {!listError && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  {showDeleted ? "Deleted Purchases" : "All Purchases"}
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              </View>
              {!showDeleted && (
                <ViewToggle mode={viewMode} onChange={setViewMode} />
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
            <PurchasesListSkeleton
              flat
              view={showDeleted ? "cards" : viewMode}
            />
          ) : !listError && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={
                    listSource.length > 0
                      ? "search"
                      : showDeleted
                        ? "archive"
                        : "shopping-bag"
                  }
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {showDeleted
                  ? "No deleted purchases found"
                  : listSource.length === 0
                    ? "No purchases yet"
                    : "No purchases found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {listSource.length === 0
                  ? showDeleted
                    ? "There are no deleted purchases."
                    : "There are no purchases for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
              {listSource.length > 0 ? (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setFilters(EMPTY_PURCHASE_FILTERS);
                  }}
                  className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Clear search & filters
                  </Text>
                </Pressable>
              ) : (
                !showDeleted && (
                  <Pressable
                    onPress={() => router.push("/attractions/create-purchase")}
                    className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={15} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      New Purchase
                    </Text>
                  </Pressable>
                )
              )}
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
                    onView={openPurchaseDetails}
                    onEdit={(purchase) =>
                      router.push({
                        pathname: "/attractions/edit-purchase",
                        params: { id: String(purchase.id), from: "purchases" },
                      })
                    }
                    onStatusPress={setStatusPurchase}
                    onDelete={handleRowDelete}
                    onOpenOrder={(purchase) =>
                      router.push({
                        pathname: "/attractions/order-details",
                        params: { id: String(purchase.ticketOrderId) },
                      })
                    }
                  />
                ) : (
                  paged.map((purchase) => (
                    <PurchaseCard
                      key={purchase.id}
                      purchase={purchase}
                      onPress={() => openPurchaseDetails(purchase)}
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
        categories={categoryOptions}
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
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className={`w-2 h-2 rounded-full ${
                        purchaseStatusTone(option).dot
                      }`}
                    />
                    <Text
                      className={`text-base font-medium ${
                        isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {prettyStatus(option)}
                    </Text>
                  </View>
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
