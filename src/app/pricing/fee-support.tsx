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
import {
  EMPTY_FEE_SUPPORT_FILTERS,
  FeeSupportFiltersSheet,
  countActiveFeeSupportFilters,
  type FeeSupportFilterValues,
} from "../../components/ui/FeeSupportFiltersSheet";
import { FeeSupportDetailSheet } from "../../components/ui/FeeSupportDetailSheet";
import { FeeSupportTable } from "../../components/ui/FeeSupportTable";
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
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  consumeFeeSupportsStale,
  markFeeSupportsStale,
  useFeeSupports,
} from "../../lib/hooks/useFeeSupports";
import { getToken } from "../../lib/session";
import {
  deleteFeeSupport,
  feeSupportLocationLabel,
  toggleFeeSupportStatus,
  type FeeSupportEntityType,
  type FeeSupportRow,
} from "../../services/feeSupportService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

const PER_PAGE_OPTIONS = [5, 10, 15];

// Icon + label per entity type (mirrors the web "Entity Type" column badge).
const ENTITY_META: Record<
  FeeSupportEntityType,
  { icon: ComponentIconName; label: string }
> = {
  package: { icon: "package", label: "Package" },
  attraction: { icon: "zap", label: "Attraction" },
  event: { icon: "calendar", label: "Event" },
  membership: { icon: "credit-card", label: "Membership" },
};

const StatusBadge = ({
  status,
  busy,
  onPress,
}: {
  status: FeeSupportRow["status"];
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

/** A labeled field cell — a column label above its value, half-width so two
 *  sit side by side (mirrors the web table columns). */
const Field = ({
  label,
  value,
  icon,
  valueClassName = "text-gray-800 dark:text-gray-100",
}: {
  label: string;
  value: string;
  icon?: ComponentIconName;
  valueClassName?: string;
}) => (
  <View className="w-1/2 px-1 mb-2.5">
    <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
      {label}
    </Text>
    <View className="flex-row items-center gap-1.5 mt-1">
      {icon && <Feather name={icon} size={13} color="#9CA3AF" />}
      <Text
        className={`text-sm font-semibold ${valueClassName}`}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  </View>
);

/** Toggleable card fields (mirrors the web "Columns" menu). */
type ColKey =
  | "amount"
  | "calculation"
  | "application"
  | "entityType"
  | "entities"
  | "location"
  | "status";
type Cols = Record<ColKey, boolean>;
const DEFAULT_COLS: Cols = {
  amount: true,
  calculation: true,
  application: true,
  entityType: true,
  entities: true,
  location: true,
  status: true,
};
const COLUMN_META: { key: ColKey; label: string }[] = [
  { key: "amount", label: "Amount" },
  { key: "calculation", label: "Calculation" },
  { key: "application", label: "Application" },
  { key: "entityType", label: "Entity Type" },
  { key: "entities", label: "Entities" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
];

const FeeSupportCard = ({
  row,
  busy,
  cols,
  onToggle,
  onEdit,
  onDelete,
}: {
  row: FeeSupportRow;
  busy: boolean;
  cols: Cols;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const entity = ENTITY_META[row.entityType];
  const isPercent = row.calculationType === "percentage";
  const locationLabel = feeSupportLocationLabel(row);
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-200 dark:border-neutral-800">
      {/* Fee name (left), status (right) */}
      <View className="flex-row items-center justify-between mb-3">
        <Text
          className="flex-1 mr-3 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={2}
        >
          {row.feeName}
        </Text>
        {cols.status && (
          <StatusBadge status={row.status} busy={busy} onPress={onToggle} />
        )}
      </View>

      {/* Labeled field grid - improved layout and text clarity */}
      <View className="flex-row flex-wrap -mx-1 mb-1">
        {cols.amount && (
          <Field
            label={isPercent ? "Amount %" : "Amount $"}
            value={row.amountLabel}
            valueClassName="text-[#0644C7] dark:text-blue-300 font-bold"
          />
        )}
        {cols.calculation && (
          <Field
            label="Calculation"
            value={isPercent ? "Percentage" : "Fixed"}
          />
        )}
        {cols.application && (
          <Field
            label="Application"
            value={
              row.applicationType === "additive" ? "Additive" : "Inclusive"
            }
          />
        )}
        {cols.entityType && (
          <Field label="Entity Type" value={entity.label} icon={entity.icon} />
        )}
        {cols.entities && (
          <Field
            label="Entities"
            value={`${row.entityCount} item${row.entityCount === 1 ? "" : "s"}`}
          />
        )}
        {cols.location && (
          <Field
            label="Location"
            value={locationLabel}
            icon="map-pin"
            valueClassName="text-gray-700 dark:text-gray-200 font-normal"
          />
        )}
      </View>

      {/* Actions - improved button styling */}
      <View className="flex-row items-center justify-end gap-2 mt-2 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Pressable
          onPress={onEdit}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-neutral-800 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Edit fee support"
        >
          <Feather name="edit-2" size={14} color="#6B7280" />
          <Text className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Edit
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Delete fee support"
        >
          <Feather name="trash-2" size={14} color="#EF4444" />
          <Text className="text-sm font-medium text-red-500">Delete</Text>
        </Pressable>
      </View>
    </View>
  );
};

const FeeSupport = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { feeSupports, loading, error, refetch, applyStatus, remove } =
    useFeeSupports();

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
  const [showCreatedDateSheet, setShowCreatedDateSheet] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [filters, setFilters] = useState<FeeSupportFilterValues>(
    EMPTY_FEE_SUPPORT_FILTERS,
  );
  const [cols, setCols] = useState<Cols>(DEFAULT_COLS);
  // The fee whose detail sheet is open (null = closed).
  const [detailRow, setDetailRow] = useState<FeeSupportRow | null>(null);
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

  // After creating / editing a fee support, refetch on return so the list +
  // KPIs update without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (consumeFeeSupportsStale()) refetch();
    }, [refetch]),
  );

  // KPI values — mirror the web Fee Supports summary cards.
  const kpis = useMemo(() => {
    const total = feeSupports.length;
    const active = feeSupports.filter((f) => f.status === "active").length;
    const byType = (t: FeeSupportEntityType) =>
      feeSupports.filter((f) => f.entityType === t).length;
    return {
      total,
      active,
      packages: byType("package"),
      attractions: byType("attraction"),
      events: byType("event"),
      memberships: byType("membership"),
    };
  }, [feeSupports]);

  // Search + every filter from the sheet. Same rules as the web page.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = filters.amountMin.trim() ? Number(filters.amountMin) : null;
    const max = filters.amountMax.trim() ? Number(filters.amountMax) : null;

    return feeSupports.filter((f) => {
      if (term && !f.feeName.toLowerCase().includes(term)) return false;
      if (filters.entityType !== "all" && f.entityType !== filters.entityType)
        return false;
      if (
        filters.calculation !== "all" &&
        f.calculationType !== filters.calculation
      )
        return false;
      if (
        filters.application !== "all" &&
        f.applicationType !== filters.application
      )
        return false;
      if (filters.status !== "all" && f.status !== filters.status) return false;
      // "Company-wide" means the fee has no location of its own.
      if (filters.location === "company-wide") {
        if (f.locationId !== null) return false;
      } else if (filters.location !== "all") {
        if (String(f.locationId) !== filters.location) return false;
      }
      if (min != null && f.feeAmount < min) return false;
      if (max != null && f.feeAmount > max) return false;
      if (filters.createdStart || filters.createdEnd) {
        const d = f.createdAt ? f.createdAt.substring(0, 10) : null;
        if (!d) return false;
        if (filters.createdStart && d < filters.createdStart) return false;
        if (filters.createdEnd && d > filters.createdEnd) return false;
      }
      return true;
    });
  }, [feeSupports, search, filters]);

  const activeFilterCount = countActiveFeeSupportFilters(filters);

  // The calendar is a native sheet too, so close the filters first (two stacked
  // sheets crash Android).
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

  const toggleCol = (key: ColKey) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no fees to export.");
      return;
    }
    setExporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const header = [
        "ID",
        "Fee Name",
        "Amount",
        "Calculation",
        "Application",
        "Entity Type",
        "Entities",
        "Location",
        "Status",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((f) =>
        [
          f.id,
          f.feeName,
          f.amountLabel,
          f.calculationType,
          f.applicationType,
          f.entityType,
          f.entityCount,
          feeSupportLocationLabel(f),
          f.status,
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}fee-supports-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Fee Supports",
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

  const hasResults = filtered.length > 0;

  // Toggle active state via PATCH /toggle-status, optimistic + reconcile.
  const handleToggle = async (row: FeeSupportRow) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to update fees.");
      return;
    }
    const next = row.status !== "active";
    applyStatus(row.id, next);
    setBusyId(row.id);
    try {
      const confirmed = await toggleFeeSupportStatus(token, row.id);
      applyStatus(row.id, confirmed);
      markFeeSupportsStale();
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
  const handleEdit = (row: FeeSupportRow) => {
    setDetailRow(null);
    router.push({
      pathname: "/pricing/create-fee-support",
      params: { id: String(row.id) },
    });
  };

  // `afterDelete` lets the detail sheet close itself once its fee is gone,
  // instead of lingering over a row that no longer exists.
  const handleDelete = (row: FeeSupportRow, afterDelete?: () => void) => {
    Alert.alert(
      "Delete fee support",
      `Delete "${row.feeName}"? This can't be undone.`,
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
                "Please sign in again to delete fees.",
              );
              return;
            }
            setBusyId(row.id);
            try {
              await deleteFeeSupport(token, row.id);
              remove(row.id);
              markFeeSupportsStale();
              afterDelete?.();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete fee support.",
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
    { label: "Special Pricing", icon: "percent", route: "/pricing/pricing" },
    { label: "Manage Packages", icon: "package", route: "/packages/packages" },
    { label: "Attractions", icon: "star", route: "/attractions/attractions" },
  ];

  const showInitialLoader = loading && feeSupports.length === 0;
  const showError = !loading && !!error && feeSupports.length === 0;

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
            Fee Supports
          </Text>
          <Pressable
            onPress={() => router.push("/pricing/create-fee-support")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="Create fee support"
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
              title="Could not load fee supports"
              message={error ?? ""}
              onRetry={onRefresh}
            />
          )}

          {/* Summary — one panel, divided by hairlines. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            !showError && (
              <SummaryPanel
                figures={[
                  {
                    icon: "dollar-sign",
                    title: "Total Fee Supports",
                    value: String(kpis.total),
                    hint: `${kpis.active} active`,
                  },
                  {
                    icon: "package",
                    title: "Package Fees",
                    value: String(kpis.packages),
                    hint: "Applied to packages",
                  },
                  {
                    icon: "zap",
                    title: "Attraction Fees",
                    value: String(kpis.attractions),
                    hint: "Applied to attractions",
                  },
                  {
                    icon: "calendar",
                    title: "Event Fees",
                    value: String(kpis.events),
                    hint: "Applied to events",
                  },
                  {
                    icon: "credit-card",
                    title: "Membership Fees",
                    value: String(kpis.memberships),
                    hint: "Applied to memberships",
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
                placeholder="Search fee supports"
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
            onClear={() => setFilters(EMPTY_FEE_SUPPORT_FILTERS)}
          />

          {/* List header — title + count, Columns, layout toggle. */}
          {!showInitialLoader && !showError && (
            <ListHeader title="All Fee Supports" count={filtered.length}>
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
            feeSupports.length === 0 ? (
              <ListEmptyState
                icon="dollar-sign"
                title="No fee supports yet"
                message="Create a fee support to add fees to your entities."
                actionLabel="New Fee Support"
                actionIcon="plus"
                primary
                onAction={() => router.push("/pricing/create-fee-support")}
              />
            ) : (
              <ListEmptyState
                icon="search"
                title="No fee supports found"
                message="Try adjusting your search or filters."
                actionLabel="Clear search & filters"
                onAction={() => {
                  setSearch("");
                  setFilters(EMPTY_FEE_SUPPORT_FILTERS);
                }}
              />
            )
          ) : (
            <>
              {/* Table (default) and card layouts render from the same
                  `paged` slice — switching is instant and never refetches. */}
              {viewMode === "table" ? (
                <FeeSupportTable
                  onView={setDetailRow}
                  rows={paged}
                  cols={cols}
                  busyId={busyId}
                  onToggle={handleToggle}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ) : (
                paged.map((row) => (
                  <FeeSupportCard
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

      {/* Per-fee details, opened by tapping a table row. Edit / Delete reuse
          the same handlers as the row's inline action buttons. */}
      <FeeSupportDetailSheet
        visible={detailRow !== null}
        row={detailRow}
        busy={detailRow != null && busyId === detailRow.id}
        onClose={() => setDetailRow(null)}
        onEdit={handleEdit}
        onDelete={(row) => handleDelete(row, () => setDetailRow(null))}
      />

      {/* All filters in one sheet, same as the other list screens. */}
      <FeeSupportFiltersSheet
        visible={showFilterSheet}
        values={filters}
        locations={locations}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_FEE_SUPPORT_FILTERS)}
        onClose={() => setShowFilterSheet(false)}
        onOpenCreatedDate={openCreatedDate}
      />

      {/* Shared calendar for Created Date, opened once the filter sheet is
          closed so two sheets are never stacked. */}
      <DateRangeSheet
        visible={showCreatedDateSheet}
        initialStart={filters.createdStart || undefined}
        initialEnd={filters.createdEnd || undefined}
        onClose={closeCreatedDate}
        onApply={applyCreatedDate}
      />

      {/* Toggle Columns */}
      <BottomSheet
        visible={showColumns}
        onClose={() => setShowColumns(false)}
        title="Toggle Columns"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {COLUMN_META.map((col) => {
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
          <View className="flex-row gap-4 mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800 px-2">
            <Pressable onPress={() => setCols(DEFAULT_COLS)}>
              <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Show All
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default FeeSupport;
