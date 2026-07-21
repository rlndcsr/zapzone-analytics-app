import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
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

import { AttractionActionsSheet } from "../../components/ui/AttractionActionsSheet";
import { AttractionCard } from "../../components/ui/AttractionCard";
import {
  AttractionsBulkBar,
  type BulkAction,
} from "../../components/ui/AttractionsBulkBar";
import { AttractionsExportSheet } from "../../components/ui/AttractionsExportSheet";
import { AttractionsImportSheet } from "../../components/ui/AttractionsImportSheet";
import { AttractionsTable } from "../../components/ui/AttractionsTable";
import {
  AttractionFiltersSheet,
  EMPTY_ATTRACTION_FILTERS,
  countActiveAttractionFilters,
  type AttractionFilterValues,
} from "../../components/ui/AttractionFiltersSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsKpiSkeleton,
  AttractionsListSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  consumeAttractionsStale,
  markAttractionsStale,
  useAttractions,
} from "../../lib/hooks/useAttractions";
import {
  CARD_SHADOW,
  formatMoney,
  type FeatherIconName,
} from "../../lib/attractions/attractionDisplay";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getToken } from "../../lib/session";
import {
  bulkDeleteAttractions,
  bulkSetAttractionsActive,
  type AttractionRow,
} from "../../services/attractionsService";

const PRIMARY = "#0644C7";

const PER_PAGE_OPTIONS = [5, 10, 15];

type KpiTone = { bg: string; tint: string };

const KpiCard = ({
  icon,
  tone,
  title,
  value,
  change,
}: {
  icon: FeatherIconName;
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
    <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
      {value}
    </Text>
    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
      {change}
    </Text>
  </View>
);

const Attractions = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  // Scope to the global workspace location (company_admin); managers stay
  // backend-scoped. Reactive so switching location refetches server-side.
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
  const [showCreatedDateSheet, setShowCreatedDateSheet] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [actionsAttraction, setActionsAttraction] =
    useState<AttractionRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  // Presentation layout only — table by default, card view on toggle. Kept in
  // component state so it survives filter/search/page changes while mounted and
  // never triggers a refetch (both layouts read the same `paged` collection).
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Bulk-selection (table view only). Single source of truth for which rows are
  // selected; `bulkBusy` marks the in-flight bulk action so the toolbar locks.
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

  // After creating an attraction, refetch on return so the new item + KPIs show
  // without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (consumeAttractionsStale()) refetch();
    }, [refetch]),
  );

  // The global workspace location already scopes the fetch server-side, so the
  // loaded list is the location-scoped set for the KPIs and the list.
  const locationScoped = attractions;

  // Category options derived from the (location-scoped) data — no extra call.
  const categories = useMemo(() => {
    const set = new Set(locationScoped.map((a) => a.category).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [locationScoped]);

  // KPI values — identical math to the web /attractions metrics, computed over
  // the location-scoped set so the cards react to the location filter.
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

  // Search + the full web-admin filter set over the location-scoped data,
  // sorted by display order. Predicate semantics mirror the web `useAdminTable`
  // exactly (select equality, inclusive numeric ranges with empty = unbounded,
  // inclusive YYYY-MM-DD created-date range). All client-side, like the web.
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
        if (filters.category !== "all" && a.category !== filters.category)
          return false;
        if (
          filters.pricingType !== "all" &&
          a.pricingType !== filters.pricingType
        )
          return false;
        if (filters.durationType !== "all") {
          // 0/null duration = "Unlimited" (matches web isUnlimitedDuration).
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
          const haystack =
            `${a.name} ${a.description} ${a.locationName} ${a.category}`.toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [locationScoped, search, filters]);

  // Client-side pagination over the filtered list (matches the notifications
  // pagination: 5 / 10 / 15 per page with Previous / Next).
  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  // Reset to the first page whenever the filters or page size change so we
  // never land on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [search, filters, activeLocationId, perPage]);

  // Keep the current page valid after the list shrinks (e.g. a bulk delete):
  // clamp down so the user stays on the nearest still-populated page.
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

  // Mirrors the web "More" action menu. Fee Supports / Special Pricing link to
  // their management screens; Import / Export open their dedicated sheets.
  const moreActions: {
    label: string;
    icon: FeatherIconName;
    hint: string;
    onPress: () => void;
  }[] = [
    {
      label: "Fee Supports",
      icon: "dollar-sign",
      hint: "Manage additional fees",
      onPress: () => {
        setShowMoreSheet(false);
        router.push("/pricing/fee-support");
      },
    },
    {
      label: "Special Pricing",
      icon: "percent",
      hint: "Manage automatic discounts",
      onPress: () => {
        setShowMoreSheet(false);
        router.push("/pricing/pricing");
      },
    },
    {
      label: "Import Attractions",
      icon: "upload",
      hint: "Bulk-create from a JSON file",
      onPress: () => {
        setShowMoreSheet(false);
        setShowImportSheet(true);
      },
    },
    {
      label: "Export Attractions",
      icon: "download",
      hint: `Select from ${filtered.length} to export as JSON`,
      onPress: () => {
        setShowMoreSheet(false);
        setShowExportSheet(true);
      },
    },
  ];

  return (
    <View className="flex-1 bg-white dark:bg-black">
      {/* Gradient header */}
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
            Attractions
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
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-5">
            <LocationWorkspaceSelector />
          </View>

          {/* Overview intro */}
          <View className="flex-row items-stretch gap-3 mb-5">
            {/* Space Schedule Card */}
            <Pressable
              onPress={() => router.push("/attractions/purchases")}
              className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
              style={{
                shadowColor: "#424242",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
                <Feather name="shopping-bag" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Manage Purchases
              </Text>
              <Text
                numberOfLines={2}
                style={{ minHeight: 28 }}
                className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
              >
                View customers attraction
              </Text>
              <View className="flex-row items-center mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  View All
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>

            {/* Onsite Purchase Card */}
            <Pressable
              onPress={() => router.push("/attractions/check-in")}
              className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
              style={{
                shadowColor: "#424242",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
                <Feather name="camera" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Check-in
              </Text>
              <Text
                numberOfLines={2}
                style={{ minHeight: 28 }}
                className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
              >
                Checking in customers
              </Text>
              <View className="flex-row items-center mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Scan QR Code
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>
          </View>

          {/* Secondary "More" + primary "New Attraction" on one row. "More"
              stays subordinate (outlined, ~38% width); "New Attraction" is the
              primary filled CTA taking the remaining width. */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable
              onPress={() => setShowMoreSheet(true)}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
            >
              <Feather name="more-horizontal" size={16} color="#6B7280" />
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                More
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/attractions/create-attraction")}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">
                New Attraction
              </Text>
            </Pressable>
          </View>

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards */}
          {loading ? (
            <AttractionsKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="star"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total Attractions"
                  value={String(kpis.total)}
                  change={`${kpis.active} active`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="zap"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Active"
                  value={String(kpis.active)}
                  change={`${kpis.inactive} inactive`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="dollar-sign"
                  tone={{ bg: "#10B98120", tint: "#10B981" }}
                  title="Avg. Price"
                  value={formatMoney(kpis.avgPrice)}
                  change="Per attraction"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="users"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="Total Capacity"
                  value={String(kpis.capacity)}
                  change="Across all attractions"
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
              placeholder="Search attractions..."
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

          {/* List header + layout toggle (Table default / Cards) */}
          {!loading && !error && (
            <View className="flex-row items-center justify-between gap-2 mb-4">
              <View className="flex-row items-center gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-lg font-bold text-gray-900 dark:text-white"
                >
                  All Attractions
                </Text>
                <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {filtered.length}
                  </Text>
                </View>
              </View>
              <ViewToggle mode={viewMode} onChange={setViewMode} />
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
            <AttractionsListSkeleton />
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="zap" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No attractions found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {attractions.length === 0
                  ? "There are no attractions for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches. */}
                {viewMode === "table" ? (
                  <AttractionsTable
                    attractions={paged}
                    onRowPress={(attraction) =>
                      setActionsAttraction(attraction)
                    }
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onToggleAll={toggleAllVisible}
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

                {/* Pagination (bottom) — same state as the top control */}
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

      {/* Created-date range calendar (shared component), opened after the filter
          sheet closes so two native Modals are never mounted at once. */}
      <DateRangeSheet
        visible={showCreatedDateSheet}
        initialStart={filters.createdStart || undefined}
        initialEnd={filters.createdEnd || undefined}
        onClose={closeCreatedDate}
        onApply={applyCreatedDate}
      />

      {/* More actions — mirrors the web action menu (Fee Supports / Special
          Pricing links + Import / Export). */}
      <BottomSheet
        visible={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        title="More"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {moreActions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
              className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1"
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100 dark:bg-neutral-800">
                <Feather name={action.icon} size={18} color="#374151" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100">
                  {action.label}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {action.hint}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>

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
    </View>
  );
};

export default Attractions;
