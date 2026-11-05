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
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import {
  AppliedFiltersHint,
  FiltersButton,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
  ToolbarIconButton,
} from "../../components/ui/SummaryPanel";
import {
  EMPTY_SPECIAL_PRICING_FILTERS,
  SpecialPricingFiltersSheet,
  countActiveSpecialPricingFilters,
  type SpecialPricingDateTarget,
  type SpecialPricingFilterValues,
} from "../../components/ui/SpecialPricingFiltersSheet";
import { SpecialPricingDetailSheet } from "../../components/ui/SpecialPricingDetailSheet";
import { SpecialPricingTable } from "../../components/ui/SpecialPricingTable";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  consumeSpecialPricingsStale,
  markSpecialPricingsStale,
  useSpecialPricings,
} from "../../lib/hooks/useSpecialPricings";
import { getToken } from "../../lib/session";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import {
  deleteSpecialPricing,
  toggleSpecialPricingStatus,
  type SpecialPricingEntityType,
  type SpecialPricingRow,
} from "../../services/specialPricingService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

const PER_PAGE_OPTIONS = [5, 10, 15];

// Icon + label per entity type (mirrors the web "Entity Type" column badge).
const ENTITY_META: Record<
  SpecialPricingEntityType,
  { icon: ComponentIconName; label: string }
> = {
  attraction: { icon: "zap", label: "Attraction" },
  package: { icon: "package", label: "Package" },
  event: { icon: "calendar", label: "Event" },
  all: { icon: "grid", label: "All Entities" },
};

const StatusBadge = ({
  status,
  busy,
  onPress,
}: {
  status: SpecialPricingRow["status"];
  busy: boolean;
  onPress: () => void;
}) => {
  const active = status === "active";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={active ? "Deactivate" : "Activate"}
      className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${
        active
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={active ? "#16A34A" : "#9CA3AF"}
        />
      ) : (
        <Feather
          name="power"
          size={11}
          color={active ? "#16A34A" : "#9CA3AF"}
        />
      )}
      <Text
        className={`text-xs font-semibold ${
          active
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </Text>
    </Pressable>
  );
};

const Chip = ({
  icon,
  label,
  tint = "#0644C7",
}: {
  icon: ComponentIconName;
  label: string;
  tint?: string;
}) => (
  <View className="flex-row items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
    <Feather name={icon} size={11} color={tint} />
    <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
      {label}
    </Text>
  </View>
);

const Meta = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-center gap-1">
    <Text className="text-xs text-gray-400 dark:text-gray-500">{label}</Text>
    <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
      {value}
    </Text>
  </View>
);

type SpColKey =
  | "discount"
  | "recurrence"
  | "entity"
  | "priority"
  | "stackable"
  | "status";
type SpCols = Record<SpColKey, boolean>;
const DEFAULT_SP_COLS: SpCols = {
  discount: true,
  recurrence: true,
  entity: true,
  priority: true,
  stackable: true,
  status: true,
};
const SP_COLUMN_META: { key: SpColKey; label: string }[] = [
  { key: "discount", label: "Discount" },
  { key: "recurrence", label: "Recurrence" },
  { key: "entity", label: "Entity Type" },
  { key: "priority", label: "Priority" },
  { key: "stackable", label: "Stackable" },
  { key: "status", label: "Status" },
];

const SpecialPricingCard = ({
  row,
  busy,
  cols,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: SpecialPricingRow;
  busy: boolean;
  cols: SpCols;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const entity = ENTITY_META[row.entityType];
  const isPercent = row.discountType === "percentage";
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-200 dark:border-neutral-800">
      {/* Name + description (left), status (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-semibold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {row.name}
          </Text>
          {!!row.description && (
            <Text
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
              numberOfLines={2}
            >
              {row.description}
            </Text>
          )}
        </View>
        {cols.status && (
          <StatusBadge status={row.status} busy={busy} onPress={onToggle} />
        )}
      </View>

      {/* Discount + recurrence + entity chips */}
      <View className="flex-row items-center flex-wrap gap-2 mt-1">
        {cols.discount && (
          <Chip
            icon={isPercent ? "percent" : "dollar-sign"}
            label={row.discountLabel}
          />
        )}
        {cols.recurrence && !!row.recurrenceDisplay && (
          <Chip icon="repeat" label={row.recurrenceDisplay} tint={PRIMARY} />
        )}
        {cols.entity && <Chip icon={entity.icon} label={entity.label} />}
      </View>

      {/* Priority / stackable + actions */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-4">
          {cols.priority && (
            <Meta label="Priority" value={String(row.priority)} />
          )}
          {cols.stackable && (
            <Meta label="Stackable" value={row.isStackable ? "Yes" : "No"} />
          )}
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={onEdit}
            className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Edit special pricing"
          >
            <Feather name="edit-2" size={15} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={onDelete}
            className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/30 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Delete special pricing"
          >
            <Feather name="trash-2" size={15} color="#EF4444" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const Pricing = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { specialPricings, loading, error, refetch, applyStatus, remove } =
    useSpecialPricings();

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  // Presentation layout only — table by default, card view on toggle. Both
  // layouts read the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Filters / columns
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showDateSheet, setShowDateSheet] = useState(false);
  const [dateTarget, setDateTarget] =
    useState<SpecialPricingDateTarget>("effective");
  const [showColumns, setShowColumns] = useState(false);
  const [cols, setCols] = useState<SpCols>(DEFAULT_SP_COLS);
  // The rule whose detail sheet is open (null = closed).
  const [detailRow, setDetailRow] = useState<SpecialPricingRow | null>(null);
  const toggleCol = (key: SpColKey) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));
  const [filters, setFilters] = useState<SpecialPricingFilterValues>(
    EMPTY_SPECIAL_PRICING_FILTERS,
  );
  const [exporting, setExporting] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  const loadLocations = useCallback(async () => {
    const token = getToken();
    if (!token || locations.length > 0) return;
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal; the Location dropdown just shows no locations.
    }
  }, [locations.length]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // After creating / editing a special pricing, refetch on return so the list
  // + KPIs update without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (consumeSpecialPricingsStale()) refetch();
    }, [refetch]),
  );

  // KPI values — mirror the web Special Pricing summary cards.
  const kpis = useMemo(() => {
    const total = specialPricings.length;
    const active = specialPricings.filter((p) => p.status === "active").length;
    const weekly = specialPricings.filter(
      (p) => p.recurrenceType === "weekly",
    ).length;
    const monthly = specialPricings.filter(
      (p) => p.recurrenceType === "monthly",
    ).length;
    const oneTime = specialPricings.filter(
      (p) => p.recurrenceType === "one_time",
    ).length;
    return { total, active, weekly, monthly, oneTime };
  }, [specialPricings]);

  // Search + every filter from the sheet. Same rules as the web page.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = filters.amountMin.trim() ? Number(filters.amountMin) : null;
    const max = filters.amountMax.trim() ? Number(filters.amountMax) : null;

    return specialPricings.filter((p) => {
      if (term && !`${p.name} ${p.description}`.toLowerCase().includes(term))
        return false;
      // A rule set to "all entities" counts for every entity type, like the web.
      if (
        filters.entityType !== "all" &&
        p.entityType !== filters.entityType &&
        p.entityType !== "all"
      )
        return false;
      if (
        filters.recurrence !== "all" &&
        p.recurrenceType !== filters.recurrence
      )
        return false;
      if (
        filters.discountType !== "all" &&
        p.discountType !== filters.discountType
      )
        return false;
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.stackable === "yes" && !p.isStackable) return false;
      if (filters.stackable === "no" && p.isStackable) return false;
      // Picking a location also keeps company-wide rules, like the web.
      if (filters.location === "company") {
        if (p.locationId !== null) return false;
      } else if (filters.location !== "all") {
        if (p.locationId !== Number(filters.location) && p.locationId !== null)
          return false;
      }
      if (min != null && p.discountAmount < min) return false;
      if (max != null && p.discountAmount > max) return false;

      if (filters.effectiveStart || filters.effectiveEnd) {
        // One-time rules run on their own date; repeating ones on the start date.
        const d =
          p.recurrenceType === "one_time" ? p.specificDate : p.startDate;
        if (!d) return false;
        if (filters.effectiveStart && d < filters.effectiveStart) return false;
        if (filters.effectiveEnd && d > filters.effectiveEnd) return false;
      }
      if (filters.createdStart || filters.createdEnd) {
        const d = p.createdAt ? p.createdAt.substring(0, 10) : null;
        if (!d) return false;
        if (filters.createdStart && d < filters.createdStart) return false;
        if (filters.createdEnd && d > filters.createdEnd) return false;
      }
      return true;
    });
  }, [specialPricings, search, filters]);

  const activeFilterCount = countActiveSpecialPricingFilters(filters);

  // Date ranges reuse the shared calendar. Both are native sheets, so close one
  // fully before opening the other (two stacked sheets crash Android).
  const openDateRange = useCallback((target: SpecialPricingDateTarget) => {
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
        dateTarget === "effective"
          ? { ...f, effectiveStart: start, effectiveEnd: end }
          : { ...f, createdStart: start, createdEnd: end },
      );
      setShowDateSheet(false);
      setTimeout(() => setShowFilterSheet(true), 280);
    },
    [dateTarget],
  );

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no rules to export.");
      return;
    }
    setExporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const header = [
        "ID",
        "Name",
        "Discount",
        "Type",
        "Recurrence",
        "Entity",
        "Location",
        "Priority",
        "Stackable",
        "Status",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((p) =>
        [
          p.id,
          p.name,
          p.discountLabel,
          p.discountType,
          p.recurrenceDisplay,
          p.entityType,
          p.locationName,
          p.priority,
          p.isStackable ? "Yes" : "No",
          p.status,
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}special-pricing-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Special Pricing",
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

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );
  // Deleting the last page's only row would otherwise leave an empty page.
  useEffect(() => {
    const last = Math.max(1, Math.ceil(filtered.length / perPage));
    if (page > last) setPage(last);
  }, [page, filtered.length, perPage]);

  useEffect(() => {
    setPage(1);
  }, [search, perPage, filters]);

  const hasResults = filtered.length > 0;

  // Toggle active state via PATCH /toggle-status, optimistic + reconcile.
  const handleToggle = async (row: SpecialPricingRow) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to update pricing.");
      return;
    }
    const next = row.status !== "active";
    applyStatus(row.id, next);
    setBusyId(row.id);
    try {
      const confirmed = await toggleSpecialPricingStatus(token, row.id);
      applyStatus(row.id, confirmed);
      markSpecialPricingsStale();
    } catch (err) {
      applyStatus(row.id, !next); // revert on failure
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update status.",
      );
    } finally {
      setBusyId(null);
    }
  };

  // Edit is a full-screen form, so any open detail sheet is dismissed first.
  const handleEdit = (row: SpecialPricingRow) => {
    setDetailRow(null);
    router.push({
      pathname: "/pricing/create-special-pricing",
      params: { id: String(row.id) },
    });
  };

  // `afterDelete` lets the detail sheet close itself once its rule is gone,
  // instead of lingering over a row that no longer exists.
  const handleDelete = (
    row: SpecialPricingRow,
    afterDelete?: () => void,
  ) => {
    Alert.alert(
      "Delete special pricing",
      `Delete "${row.name}"? This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert(
                "Not signed in",
                "Please sign in again to delete pricing.",
              );
              return;
            }
            setBusyId(row.id);
            try {
              await deleteSpecialPricing(token, row.id);
              remove(row.id);
              markSpecialPricingsStale();
              afterDelete?.();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete special pricing.",
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  // The page's secondary actions as module-hub shortcuts; Create is the
  // header's New action.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: exporting ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
    { label: "Fee Supports", icon: "dollar-sign", route: "/pricing/fee-support" },
    { label: "Manage Packages", icon: "package", route: "/packages/packages" },
    { label: "Attractions", icon: "star", route: "/attractions/attractions" },
  ];

  const showInitialLoader = loading && specialPricings.length === 0;
  const showError = !loading && !!error && specialPricings.length === 0;

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
            Special Pricing
          </Text>
          <Pressable
            onPress={() => router.push("/pricing/create-special-pricing")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Create special pricing"
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
            progressBackgroundColor={
              colorScheme === "dark" ? "#171717" : "#FFFFFF"
            }
          />
        }
      >
        <View className="px-4 mt-4">
          {/* Error state (nothing cached to show) */}
          {showError && (
            <ListErrorBanner
              title="Could not load special pricing"
              message={error ?? ""}
              onRetry={onRefresh}
            />
          )}

          {/* Summary — one panel, four figures, divided by hairlines. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            !showError && (
              <SummaryPanel
                figures={[
                  {
                    icon: "tag",
                    title: "Total Rules",
                    value: String(kpis.total),
                    hint: `${kpis.active} active`,
                  },
                  {
                    icon: "repeat",
                    title: "Weekly",
                    value: String(kpis.weekly),
                    hint: "Every week discounts",
                  },
                  {
                    icon: "calendar",
                    title: "Monthly",
                    value: String(kpis.monthly),
                    hint: "Every month discounts",
                  },
                  {
                    icon: "star",
                    title: "One-Time",
                    value: String(kpis.oneTime),
                    hint: "Specific date sales",
                  },
                ]}
              />
            )
          )}

          {/* More — the page's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search special pricing"
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
                className="flex-1 text-sm text-gray-900 dark:text-white"
                style={{ paddingVertical: 0 }}
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
            <FiltersButton
              count={activeFilterCount}
              onPress={() => setShowFilterSheet(true)}
            />
          </View>

          {/* Applied-filters hint with a one-tap reset. */}
          <AppliedFiltersHint
            count={activeFilterCount}
            onClear={() => setFilters(EMPTY_SPECIAL_PRICING_FILTERS)}
          />

          {/* List header — title + count, Columns, layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Special Pricing" count={filtered.length}>
              <View className="flex-row items-center gap-2">
                <ToolbarIconButton
                  icon="columns"
                  label="Toggle columns"
                  active={showColumns}
                  onPress={() => setShowColumns(true)}
                />
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </View>
            </ListHeader>
          )}

          {/* List / states */}
          {showInitialLoader ? (
            viewMode === "table" ? (
              <AttractionsTableSkeleton />
            ) : (
              <AttractionsListSkeleton />
            )
          ) : showError ? null : !hasResults ? (
            specialPricings.length === 0 ? (
              <ListEmptyState
                icon="tag"
                title="No special pricing yet"
                message="Create a special pricing to offer automatic discounts."
                actionLabel="New Special Pricing"
                actionIcon="plus"
                primary
                onAction={() => router.push("/pricing/create-special-pricing")}
              />
            ) : (
              <ListEmptyState
                icon="search"
                title="No special pricing found"
                message="Try adjusting your search or filters."
                actionLabel="Clear search & filters"
                onAction={() => {
                  setSearch("");
                  setFilters(EMPTY_SPECIAL_PRICING_FILTERS);
                }}
              />
            )
          ) : (
            <>
              {/* Table (default) and card layouts render from the same
                  `paged` slice — switching is instant and never refetches. */}
              {viewMode === "table" ? (
                <SpecialPricingTable
                  rows={paged}
                  cols={cols}
                  busyId={busyId}
                  onView={setDetailRow}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ) : (
                paged.map((row) => (
                  <SpecialPricingCard
                    key={row.id}
                    row={row}
                    busy={busyId === row.id}
                    cols={cols}
                    onToggle={() => handleToggle(row)}
                    onEdit={() => handleEdit(row)}
                    onDelete={() => handleDelete(row)}
                  />
                ))
              )}

              <Pagination
                page={page}
                perPage={perPage}
                total={filtered.length}
                options={PER_PAGE_OPTIONS}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* Per-rule details, opened by tapping a table row. Edit / Delete reuse
          the same handlers as the row's inline action buttons. */}
      <SpecialPricingDetailSheet
        visible={detailRow !== null}
        row={detailRow}
        busy={detailRow != null && busyId === detailRow.id}
        onClose={() => setDetailRow(null)}
        onEdit={handleEdit}
        onDelete={(row) => handleDelete(row, () => setDetailRow(null))}
      />

      {/* All filters in one sheet, same as the other list screens. */}
      <SpecialPricingFiltersSheet
        visible={showFilterSheet}
        values={filters}
        locations={locations}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_SPECIAL_PRICING_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenDateRange={openDateRange}
      />

      {/* Shared calendar for the two date ranges, opened once the filter sheet
          is closed so two sheets are never stacked. */}
      <DateRangeSheet
        visible={showDateSheet}
        initialStart={
          (dateTarget === "effective"
            ? filters.effectiveStart
            : filters.createdStart) || undefined
        }
        initialEnd={
          (dateTarget === "effective"
            ? filters.effectiveEnd
            : filters.createdEnd) || undefined
        }
        onClose={closeDateRange}
        onApply={applyDateRange}
      />

      {/* Toggle Columns */}
      <BottomSheet
        visible={showColumns}
        onClose={() => setShowColumns(false)}
        title="Toggle Columns"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {SP_COLUMN_META.map((col) => {
            const on = cols[col.key];
            return (
              <Pressable
                key={col.key}
                onPress={() => toggleCol(col.key)}
                className="flex-row items-center gap-3 px-2 py-3.5"
              >
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center border ${
                    on
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "border-gray-300 dark:border-neutral-600"
                  }`}
                >
                  {on && (
                    <Feather
                      name="check"
                      size={14}
                      color="#FFFFFF"
                      strokeWidth={3}
                    />
                  )}
                </View>
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                  {col.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setCols(DEFAULT_SP_COLS)}
            className="mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800 px-2"
          >
            <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Show All
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Pricing;
