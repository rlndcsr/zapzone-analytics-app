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

import { AttractionActionsSheet } from "../../components/ui/AttractionActionsSheet";
import { AttractionCard } from "../../components/ui/AttractionCard";
import {
  AttractionFiltersSheet,
  EMPTY_ATTRACTION_FILTERS,
  countActiveAttractionFilters,
  type AttractionFilterValues,
} from "../../components/ui/AttractionFiltersSheet";
import {
  AttractionsBulkBar,
  type BulkAction,
} from "../../components/ui/AttractionsBulkBar";
import { AttractionsExportSheet } from "../../components/ui/AttractionsExportSheet";
import { AttractionsImportSheet } from "../../components/ui/AttractionsImportSheet";
import {
  ATTRACTION_COLUMNS,
  AttractionsTable,
  allAttractionColumnKeys,
  defaultAttractionColumnKeys,
} from "../../components/ui/AttractionsTable";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  ALL_CATEGORIES,
  CategoryChips,
  buildCategoryOptions,
} from "../../components/ui/CategoryChips";
import { ColumnsSheet } from "../../components/ui/ColumnsSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  formatMoney,
  type FeatherIconName,
} from "../../lib/attractions/attractionDisplay";
import {
  attractionsCsvFilename,
  buildAttractionsCsv,
} from "../../lib/attractions/attractionsCsv";
import { openPurchasePage } from "../../lib/attractions/purchaseLink";
import { categoryKeyOf } from "../../lib/calendar/categoryFilter";
import {
  consumeAttractionsStale,
  markAttractionsStale,
  useAttractions,
} from "../../lib/hooks/useAttractions";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getToken } from "../../lib/session";
import { normalizeCategory } from "../../lib/venueCategories";
import {
  bulkDeleteAttractions,
  bulkSetAttractionsActive,
  compareAttractionsByDisplayOrder,
  deleteAttraction,
  duplicateAttraction,
  setAttractionActive,
  type AttractionRow,
  type AttractionStatus,
} from "../../services/attractionsService";

const PRIMARY = "#0644C7";

const PER_PAGE_OPTIONS = [5, 10, 15];

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own shadowed tile, which keeps the header calm and easy to scan.
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

/** Square icon button used in the toolbar rows (Columns). */
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

const ManageAttractions = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const { attractions, loading, error, refetch } = useAttractions({
    locationId: activeLocationId,
  });

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<AttractionFilterValues>(
    EMPTY_ATTRACTION_FILTERS,
  );
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showColumnsSheet, setShowColumnsSheet] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    defaultAttractionColumnKeys,
  );
  const [showCreatedDateSheet, setShowCreatedDateSheet] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [actionsAttraction, setActionsAttraction] =
    useState<AttractionRow | null>(null);
  const [statusAttraction, setStatusAttraction] =
    useState<AttractionRow | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      if (consumeAttractionsStale()) refetch();
    }, [refetch]),
  );

  const locationScoped = attractions;

  const categories = useMemo(
    () => buildCategoryOptions(locationScoped.map((a) => a.category)),
    [locationScoped],
  );

  useEffect(() => {
    if (
      filters.category !== ALL_CATEGORIES &&
      !categories.some((c) => c.value === filters.category)
    ) {
      setFilters((prev) => ({ ...prev, category: ALL_CATEGORIES }));
    }
  }, [categories, filters.category]);

  const kpis = useMemo(() => {
    const total = locationScoped.length;
    const active = locationScoped.filter((a) => a.status === "active").length;
    const inactive = total - active;
    const avgPrice =
      total > 0
        ? locationScoped.reduce((sum, a) => sum + a.price, 0) / total
        : 0;
    const capacity = locationScoped.reduce((sum, a) => sum + a.maxCapacity, 0);
    return { total, active, inactive, avgPrice, capacity };
  }, [locationScoped]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const priceMin =
      filters.priceMin === "" ? null : parseFloat(filters.priceMin);
    const priceMax =
      filters.priceMax === "" ? null : parseFloat(filters.priceMax);
    const capMin =
      filters.capacityMin === "" ? null : parseFloat(filters.capacityMin);
    const capMax =
      filters.capacityMax === "" ? null : parseFloat(filters.capacityMax);
    const { createdStart, createdEnd } = filters;

    return locationScoped
      .filter((a) => {
        if (filters.status !== "all" && a.status !== filters.status)
          return false;
        if (
          filters.category !== ALL_CATEGORIES &&
          categoryKeyOf(a.category) !== filters.category
        )
          return false;
        if (
          filters.pricingType !== "all" &&
          a.pricingType !== filters.pricingType
        )
          return false;
        if (filters.durationType !== "all") {
          const unlimited = !a.duration;
          if (filters.durationType === "unlimited" && !unlimited) return false;
          if (filters.durationType === "timed" && unlimited) return false;
        }
        if (filters.capacityVisibility !== "all") {
          const shown = a.displayCapacityToCustomers !== false;
          if (filters.capacityVisibility === "shown" && !shown) return false;
          if (filters.capacityVisibility === "hidden" && shown) return false;
        }
        if (priceMin != null && !Number.isNaN(priceMin) && a.price < priceMin)
          return false;
        if (priceMax != null && !Number.isNaN(priceMax) && a.price > priceMax)
          return false;
        if (capMin != null && !Number.isNaN(capMin) && a.maxCapacity < capMin)
          return false;
        if (capMax != null && !Number.isNaN(capMax) && a.maxCapacity > capMax)
          return false;
        if (createdStart || createdEnd) {
          const date = a.createdAt ? a.createdAt.split("T")[0] : null;
          if (!date) return false;
          if (createdStart && date < createdStart) return false;
          if (createdEnd && date > createdEnd) return false;
        }
        if (term) {
          const category = normalizeCategory(a.category);
          const haystack =
            `${a.name} ${a.description} ${a.locationName} ${category}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort(compareAttractionsByDisplayOrder);
  }, [locationScoped, search, filters]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, filters, activeLocationId, perPage]);

  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  // Selection is scoped to what's visible: clear it whenever the visible set
  // changes (search / filters / location / page size / page) or the layout
  // toggles away, so a bulk action never touches off-screen rows.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, filters, activeLocationId, perPage, page, viewMode]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Header checkbox — select / deselect every row on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected =
        paged.length > 0 && paged.every((a) => prev.has(a.id));
      return allSelected ? new Set() : new Set(paged.map((a) => a.id));
    });
  }, [paged]);

  // Bulk activate / deactivate — fans out per-id PATCH calls (no bulk status
  // endpoint exists), then refetches and clears the selection. Filters, search
  // and the current page are all preserved.
  const runBulkStatus = useCallback(
    async (isActive: boolean) => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const ids = [...selectedIds];
      setBulkBusy(isActive ? "activate" : "deactivate");
      try {
        await bulkSetAttractionsActive(token, ids, isActive);
        setSelectedIds(new Set());
        await refetch();
      } catch (err) {
        Alert.alert(
          isActive ? "Activate failed" : "Deactivate failed",
          err instanceof Error
            ? err.message
            : "Could not update the selected attractions.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, refetch],
  );

  // Bulk delete — same confirmation copy as the web admin, then the dedicated
  // bulk-delete endpoint (one round-trip). Refetches and clears selection; the
  // page-clamp effect keeps the user on a valid page.
  const confirmBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      "Delete attractions",
      `Are you sure you want to delete ${count} attraction(s)? This action cannot be undone.`,
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
              await bulkDeleteAttractions(token, ids);
              setSelectedIds(new Set());
              await refetch();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the selected attractions.",
              );
            } finally {
              setBulkBusy(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // Per-row Actions (table view). Edit opens the full-screen edit page; the list
  // refetches on focus via the stale flag the edit screen sets on save.
  const handleRowEdit = useCallback((a: AttractionRow) => {
    router.push(`/attractions/edit-attraction?id=${a.id}`);
  }, []);

  // Duplicate one row — same flow as the Details sheet (create an inactive
  // "(Copy)"), then refetch so the copy appears. Awaited so the row's Duplicate
  // icon can show a spinner until it resolves.
  const handleRowDuplicate = useCallback(
    async (a: AttractionRow) => {
      const token = getToken();
      if (!token) return Alert.alert("Not signed in", "Please sign in again.");
      try {
        await duplicateAttraction(token, a.id);
        await refetch();
      } catch (err) {
        Alert.alert(
          "Duplicate failed",
          err instanceof Error
            ? err.message
            : "Could not duplicate attraction.",
        );
      }
    },
    [refetch],
  );

  // Delete one row — same confirmation copy as the Details sheet / web admin.
  const handleRowDelete = useCallback(
    (a: AttractionRow) => {
      Alert.alert(
        "Delete attraction",
        "Are you sure you want to delete this attraction? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) {
                Alert.alert("Not signed in", "Please sign in again.");
                return;
              }
              try {
                await deleteAttraction(token, a.id);
                await refetch();
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error
                    ? err.message
                    : "Could not delete attraction.",
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
  // with the Manage Accounts table). Applying calls the same per-id
  // activate/deactivate endpoint the bulk bar uses.
  const applyRowStatus = useCallback(
    async (status: AttractionStatus) => {
      const a = statusAttraction;
      if (!a) return;
      if (a.status === status) {
        setStatusAttraction(null);
        return;
      }
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again.");
        return;
      }
      setStatusBusy(true);
      try {
        await setAttractionActive(token, a.id, status === "active");
        await refetch();
        setStatusAttraction(null);
      } catch (err) {
        Alert.alert(
          "Update failed",
          err instanceof Error
            ? err.message
            : "Could not update the attraction status.",
        );
      } finally {
        setStatusBusy(false);
      }
    },
    [statusAttraction, refetch],
  );

  const activeFilterCount = countActiveAttractionFilters(filters);

  // Created Date reuses the shared range calendar. The filter sheet is a native
  // Modal, so we fully close it before opening the calendar (and reopen it
  // after) — two stacked native Modals crash Android's new architecture.
  const openCreatedDate = useCallback(() => {
    setShowFilterSheet(false);
    setTimeout(() => setShowCreatedDateSheet(true), 280);
  }, []);
  const closeCreatedDate = useCallback(() => {
    setShowCreatedDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);
  const applyCreatedDate = useCallback((start: string, end: string) => {
    setFilters((f) => ({ ...f, createdStart: start, createdEnd: end }));
    setShowCreatedDateSheet(false);
    setTimeout(() => setShowFilterSheet(true), 280);
  }, []);

  const hasResults = filtered.length > 0;

  /**
   * "Export CSV" — the web action exports every filtered row straight to a file
   * with no selection step, so this does the same: build the CSV, write it to
   * the cache directory, and hand it to the OS share sheet (the same mechanism
   * the JSON export sheet uses).
   */
  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert(
        "Nothing to export",
        "No attractions match the current filters.",
      );
      return;
    }
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const uri = `${FileSystem.cacheDirectory}${attractionsCsvFilename()}`;
      await FileSystem.writeAsStringAsync(uri, buildAttractionsCsv(filtered), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Export CSV",
        UTI: "public.comma-separated-values-text",
      });
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export the CSV.",
      );
    }
  }, [filtered]);

  // The web "More" action menu, laid out as module-hub shortcuts. Fee Supports
  // / Special Pricing link to their management screens; Import / Export open
  // their dedicated sheets, and Export CSV downloads the filtered rows directly.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: "Fee Supports",
      icon: "dollar-sign",
      route: "/pricing/fee-support",
    },
    { label: "Special Pricing", icon: "percent", route: "/pricing/pricing" },
    {
      label: "Import Attractions",
      icon: "upload",
      onPress: () => setShowImportSheet(true),
    },
    {
      label: "Export Attractions",
      icon: "download",
      onPress: () => setShowExportSheet(true),
    },
    { label: "Export CSV", icon: "file-text", onPress: exportCsv },
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
            Manage Attractions
          </Text>
          <Pressable
            onPress={() => router.push("/attractions/create-attraction")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New attraction"
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
          {!loading && error && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Could not load attractions
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
          {loading ? (
            <AttractionsSummarySkeleton />
          ) : (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="flex-row">
                <SummaryCell
                  icon="star"
                  title="Total Attractions"
                  value={String(kpis.total)}
                  hint={`${kpis.active} active`}
                />
                <SummaryCell
                  divideLeft
                  icon="zap"
                  title="Active"
                  value={String(kpis.active)}
                  hint={`${kpis.inactive} inactive`}
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="dollar-sign"
                  title="Avg. Price"
                  value={formatMoney(kpis.avgPrice)}
                  hint="Per attraction"
                />
                <SummaryCell
                  divideTop
                  divideLeft
                  icon="users"
                  title="Total Capacity"
                  value={String(kpis.capacity)}
                  hint="Across all attractions"
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
                placeholder="Search attractions"
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
              onPress={() => setShowFilterSheet(true)}
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
                onPress={() => setFilters(EMPTY_ATTRACTION_FILTERS)}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* Category chips — a visible surface over the sheet's Category
              filter, not a second one: both write the same `filters.category`. */}
          <CategoryChips
            options={categories}
            value={filters.category}
            onChange={(next) =>
              setFilters((prev) => ({ ...prev, category: next }))
            }
            totalCount={locationScoped.length}
            allLabel="All Categories"
          />

          {/* List header — title + count, Columns (table only), layout toggle. */}
          {!loading && !error && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  All Attractions
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {viewMode === "table" && (
                  <ToolbarIconButton
                    icon="columns"
                    label="Toggle columns"
                    active={showColumnsSheet}
                    onPress={() => setShowColumnsSheet(true)}
                  />
                )}
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </View>
            </View>
          )}

          {/* Bulk-action toolbar — table view only, shown while a selection
              exists; unmounts (disappears) the moment selection is cleared. */}
          {viewMode === "table" && selectedIds.size > 0 && (
            <AttractionsBulkBar
              count={selectedIds.size}
              busy={bulkBusy}
              onActivate={() => runBulkStatus(true)}
              onDeactivate={() => runBulkStatus(false)}
              onDelete={confirmBulkDelete}
              onClear={clearSelection}
            />
          )}

          {/* List / states */}
          {loading ? (
            viewMode === "table" ? (
              <AttractionsTableSkeleton />
            ) : (
              <AttractionsListSkeleton />
            )
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={attractions.length === 0 ? "zap" : "search"}
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {attractions.length === 0
                  ? "No attractions yet"
                  : "No attractions found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {attractions.length === 0
                  ? "There are no attractions for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
              {attractions.length === 0 ? (
                <Pressable
                  onPress={() => router.push("/attractions/create-attraction")}
                  className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={15} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    New Attraction
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    setSearch("");
                    setFilters(EMPTY_ATTRACTION_FILTERS);
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
            !error && (
              <>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches. */}
                {viewMode === "table" ? (
                  <AttractionsTable
                    attractions={paged}
                    onView={(attraction) => setActionsAttraction(attraction)}
                    onViewPurchase={openPurchasePage}
                    onEdit={handleRowEdit}
                    onDuplicate={handleRowDuplicate}
                    onDelete={handleRowDelete}
                    onStatusPress={setStatusAttraction}
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onToggleAll={toggleAllVisible}
                    visibleColumns={visibleColumns}
                  />
                ) : (
                  paged.map((attraction) => (
                    <AttractionCard
                      key={attraction.id}
                      attraction={attraction}
                      onOpenDetails={() => setActionsAttraction(attraction)}
                    />
                  ))
                )}

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

      {/* Full filter panel — every web-admin filter in one sheet. */}
      <AttractionFiltersSheet
        visible={showFilterSheet}
        values={filters}
        categories={categories}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_ATTRACTION_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenCreatedDate={openCreatedDate}
      />

      {/* Toggle Columns — mirrors the web table toolbar's Columns dropdown. */}
      <ColumnsSheet
        visible={showColumnsSheet}
        columns={ATTRACTION_COLUMNS}
        visibleKeys={visibleColumns}
        onToggle={(key) =>
          setVisibleColumns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onShowAll={() => setVisibleColumns(allAttractionColumnKeys())}
        onReset={() => setVisibleColumns(defaultAttractionColumnKeys())}
        onClose={() => setShowColumnsSheet(false)}
      />

      {/* Created-date range calendar (shared component), opened after the filter
          sheet closes so two native Modals are never mounted at once. */}
      <DateRangeSheet
        visible={showCreatedDateSheet}
        initialStart={filters.createdStart || undefined}
        initialEnd={filters.createdEnd || undefined}
        onClose={closeCreatedDate}
        onApply={applyCreatedDate}
      />

      {/* Bulk import (JSON) — same endpoint as the web ManageAttractions import. */}
      <AttractionsImportSheet
        visible={showImportSheet}
        onClose={() => setShowImportSheet(false)}
        locationId={activeLocationId ?? null}
        onImported={() => {
          markAttractionsStale();
          refetch();
        }}
      />

      {/* Export — select from the filtered list, share as JSON. */}
      <AttractionsExportSheet
        visible={showExportSheet}
        onClose={() => setShowExportSheet(false)}
        attractions={filtered}
      />

      {/* Tapping a card opens the Attraction Details, which now hosts every
          action (Copy Link / View purchase / Edit / Duplicate / Delete). */}
      <AttractionActionsSheet
        visible={actionsAttraction !== null}
        attraction={actionsAttraction}
        onClose={() => setActionsAttraction(null)}
        onChanged={refetch}
      />

      {/* Per-row status picker (table Actions). Same sheet-based pattern as the
          Manage Accounts "Set Status" picker, so the style stays consistent. */}
      <BottomSheet
        visible={statusAttraction !== null}
        onClose={() => (statusBusy ? undefined : setStatusAttraction(null))}
        title="Set Status"
      >
        <View className="px-4 pb-8">
          {statusBusy ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : (
            (["active", "inactive"] as AttractionStatus[]).map((option) => {
              const isSelected = statusAttraction?.status === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => applyRowStatus(option)}
                  className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                    isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className={`w-2 h-2 rounded-full ${
                        option === "active" ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    <Text
                      className={`text-base font-medium capitalize ${
                        isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {option}
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

export default ManageAttractions;
