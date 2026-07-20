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
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import {
  FeeSupportKpiSkeleton,
  FeeSupportListSkeleton,
} from "../../components/ui/skeleton/FeeSupportSkeleton";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import {
  consumeFeeSupportsStale,
  markFeeSupportsStale,
  useFeeSupports,
} from "../../lib/hooks/useFeeSupports";
import { getToken } from "../../lib/session";
import {
  deleteFeeSupport,
  toggleFeeSupportStatus,
  type FeeSupportEntityType,
  type FeeSupportRow,
} from "../../services/feeSupportService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

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
        <ActivityIndicator size="small" color={active ? "#16A34A" : "#9CA3AF"} />
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

type CalcFilter = "all" | "fixed" | "percentage";
type AppFilter = "all" | "additive" | "inclusive";
type EntityFilter = "all" | FeeSupportEntityType;
type StatusFilter = "all" | "active" | "inactive";

const CALC_OPTIONS: { label: string; value: CalcFilter }[] = [
  { label: "All", value: "all" },
  { label: "Fixed", value: "fixed" },
  { label: "Percentage", value: "percentage" },
];
const APP_OPTIONS: { label: string; value: AppFilter }[] = [
  { label: "All", value: "all" },
  { label: "Additive", value: "additive" },
  { label: "Inclusive", value: "inclusive" },
];
const ENTITY_OPTIONS: { label: string; value: EntityFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "Packages", value: "package" },
  { label: "Attractions", value: "attraction" },
  { label: "Events", value: "event" },
  { label: "Memberships", value: "membership" },
];
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

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

/** A row of chip choices used inside the collapsible Filters panel. */
function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`px-3.5 py-2 rounded-lg border ${
                on
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  on ? "text-white" : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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
  const locationLabel =
    row.locationName && row.companyName
      ? `${row.locationName} | ${row.companyName}`
      : row.locationName || row.companyName || "All Locations";
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* Fee name (left), status (right) - improved spacing and font */}
      <View className="flex-row items-center justify-between mb-3">
        <Text
          className="flex-1 mr-3 text-lg font-bold text-gray-900 dark:text-white"
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
          <Field label="Calculation" value={isPercent ? "Percentage" : "Fixed"} />
        )}
        {cols.application && (
          <Field
            label="Application"
            value={row.applicationType === "additive" ? "Additive" : "Inclusive"}
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

type KpiTone = { bg: string; tint: string };

const KpiCard = ({
  icon,
  tone,
  title,
  value,
  change,
}: {
  icon: ComponentIconName;
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
      className="w-10 h-10 rounded-xl items-center justify-center"
      style={{ backgroundColor: tone.bg }}
    >
      <Feather name={icon} size={20} color={tone.tint} />
    </View>
    <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3">
      {title}
    </Text>
    <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
      {value}
    </Text>
    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
      {change}
    </Text>
  </View>
);

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
  const [perPage, setPerPage] = useState(10);

  // Filters / columns
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [calcFilter, setCalcFilter] = useState<CalcFilter>("all");
  const [appFilter, setAppFilter] = useState<AppFilter>("all");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  const [cols, setCols] = useState<Cols>(DEFAULT_COLS);
  const [exporting, setExporting] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const loadLocations = useCallback(async () => {
    const token = getToken();
    if (!token || locations.length > 0) return;
    setLocationsLoading(true);
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // Non-fatal.
    } finally {
      setLocationsLoading(false);
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

  // Search + filter panel.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return feeSupports.filter((f) => {
      if (term && !f.feeName.toLowerCase().includes(term)) return false;
      if (calcFilter !== "all" && f.calculationType !== calcFilter) return false;
      if (appFilter !== "all" && f.applicationType !== appFilter) return false;
      if (entityFilter !== "all" && f.entityType !== entityFilter) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (locationFilter !== "all" && f.locationId !== locationFilter)
        return false;
      return true;
    });
  }, [
    feeSupports,
    search,
    calcFilter,
    appFilter,
    entityFilter,
    statusFilter,
    locationFilter,
  ]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [
    search,
    perPage,
    calcFilter,
    appFilter,
    entityFilter,
    statusFilter,
    locationFilter,
  ]);

  const filtersActive =
    calcFilter !== "all" ||
    appFilter !== "all" ||
    entityFilter !== "all" ||
    statusFilter !== "all" ||
    locationFilter !== "all";

  const clearFilters = () => {
    setCalcFilter("all");
    setAppFilter("all");
    setEntityFilter("all");
    setStatusFilter("all");
    setLocationFilter("all");
  };

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
        "ID", "Fee Name", "Amount", "Calculation", "Application",
        "Entity Type", "Entities", "Location", "Status",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((f) =>
        [
          f.id, f.feeName, f.amountLabel, f.calculationType, f.applicationType,
          f.entityType, f.entityCount, f.locationName, f.status,
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

  const handleEdit = (row: FeeSupportRow) => {
    router.push({
      pathname: "/pricing/create-fee-support",
      params: { id: String(row.id) },
    });
  };

  const handleDelete = (row: FeeSupportRow) => {
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
            Fee Supports
          </Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor={colorScheme === "dark" ? "#171717" : "#FFFFFF"}
          />
        }
      >
        <View className="px-5">

          <Pressable
            onPress={() => router.push("/pricing/create-fee-support")}
            className="flex-row mt-5 mb-3 items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Fee Support
            </Text>
          </Pressable>

          {/* Controls — segmented pill (Filters · Columns · Export CSV) */}
          <FilterPill>
            <PillSegment
              label="Filters"
              active={showFilters || filtersActive}
              onPress={() => setShowFilters((v) => !v)}
              renderIcon={(c) => <Feather name="filter" size={15} color={c} />}
            />
            <PillSegment
              label="Columns"
              active={showColumns}
              onPress={() => setShowColumns(true)}
              renderIcon={(c) => <Feather name="columns" size={15} color={c} />}
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

          {/* Filters panel */}
          {showFilters && (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <ChipRow
                label="Calculation"
                options={CALC_OPTIONS}
                value={calcFilter}
                onChange={setCalcFilter}
              />
              <ChipRow
                label="Application"
                options={APP_OPTIONS}
                value={appFilter}
                onChange={setAppFilter}
              />
              <ChipRow
                label="Entity Type"
                options={ENTITY_OPTIONS}
                value={entityFilter}
                onChange={setEntityFilter}
              />
              <ChipRow
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                Location
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => setLocationFilter("all")}
                  className={`px-3.5 py-2 rounded-lg border ${
                    locationFilter === "all"
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      locationFilter === "all"
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    All Locations
                  </Text>
                </Pressable>
                {locationsLoading && locations.length === 0 && (
                  <ActivityIndicator color={PRIMARY} />
                )}
                {locations.map((loc) => {
                  const on = locationFilter === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      onPress={() => setLocationFilter(loc.id)}
                      className={`px-3.5 py-2 rounded-lg border ${
                        on
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          on ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                        numberOfLines={1}
                      >
                        {loc.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {filtersActive && (
                <Pressable onPress={clearFilters} className="self-end mt-3">
                  <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Clear Filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}

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
            <FeeSupportKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="dollar-sign"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total Fee Supports"
                  value={String(kpis.total)}
                  change={`${kpis.active} active`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="package"
                  tone={{ bg: "#3B82F620", tint: "#3B82F6" }}
                  title="Package Fees"
                  value={String(kpis.packages)}
                  change="Applied to packages"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="zap"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Attraction Fees"
                  value={String(kpis.attractions)}
                  change="Applied to attractions"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="calendar"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="Event Fees"
                  value={String(kpis.events)}
                  change="Applied to events"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="credit-card"
                  tone={{ bg: "#EC489920", tint: "#EC4899" }}
                  title="Membership Fees"
                  value={String(kpis.memberships)}
                  change="Applied to memberships"
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
              placeholder="Search fee supports..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4 mt-2">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                All Fee Supports
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {filtered.length}
                </Text>
              </View>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <FeeSupportListSkeleton />
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="dollar-sign" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No fee supports found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {feeSupports.length === 0
                  ? "Create a fee support to add fees to your entities."
                  : "Try adjusting your search."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {paged.map((row) => (
                  <FeeSupportCard
                    key={row.id}
                    row={row}
                    busy={busyId === row.id}
                    cols={cols}
                    onToggle={() => handleToggle(row)}
                    onEdit={() => handleEdit(row)}
                    onDelete={() => handleDelete(row)}
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
                                  isActive
                                    ? "text-white"
                                    : "text-gray-600 dark:text-gray-300"
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
                    <Feather name="check" size={14} color="#FFFFFF" strokeWidth={3} />
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