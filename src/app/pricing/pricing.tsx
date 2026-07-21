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
import { SpecialPricingTable } from "../../components/ui/SpecialPricingTable";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  SpecialPricingKpiSkeleton,
  SpecialPricingListSkeleton,
} from "../../components/ui/skeleton/SpecialPricingSkeleton";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import {
  consumeSpecialPricingsStale,
  markSpecialPricingsStale,
  useSpecialPricings,
} from "../../lib/hooks/useSpecialPricings";
import { getToken } from "../../lib/session";
import {
  deleteSpecialPricing,
  toggleSpecialPricingStatus,
  type SpecialPricingEntityType,
  type SpecialPricingRow,
} from "../../services/specialPricingService";

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
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* Name + description (left), status (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
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
          {cols.priority && <Meta label="Priority" value={String(row.priority)} />}
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

type EntityFilter = "all" | SpecialPricingEntityType;
type RecurrenceFilter = "all" | "one_time" | "weekly" | "monthly";
type DiscountFilter = "all" | "percentage" | "fixed";
type StatusFilter = "all" | "active" | "inactive";
type StackFilter = "all" | "yes" | "no";

const ENTITY_OPTIONS: { label: string; value: EntityFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "Packages", value: "package" },
  { label: "Attractions", value: "attraction" },
  { label: "Events", value: "event" },
];
const RECURRENCE_OPTIONS: { label: string; value: RecurrenceFilter }[] = [
  { label: "All Recurrences", value: "all" },
  { label: "One-Time", value: "one_time" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];
const DISCOUNT_OPTIONS: { label: string; value: DiscountFilter }[] = [
  { label: "All Discount Types", value: "all" },
  { label: "Percentage", value: "percentage" },
  { label: "Fixed", value: "fixed" },
];
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];
const STACK_OPTIONS: { label: string; value: StackFilter }[] = [
  { label: "All", value: "all" },
  { label: "Stackable", value: "yes" },
  { label: "Not stackable", value: "no" },
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
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`px-3.5 py-2 rounded-lg border ${
                active
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  active ? "text-white" : "text-gray-600 dark:text-gray-300"
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
  const [perPage, setPerPage] = useState(10);
  // Presentation layout only — table by default, card view on toggle. Both
  // layouts read the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Filters / columns
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [cols, setCols] = useState<SpCols>(DEFAULT_SP_COLS);
  const toggleCol = (key: SpColKey) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [recurrenceFilter, setRecurrenceFilter] =
    useState<RecurrenceFilter>("all");
  const [discountFilter, setDiscountFilter] = useState<DiscountFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stackFilter, setStackFilter] = useState<StackFilter>("all");
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
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
      // Non-fatal; location filter just stays empty.
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

  // Search + full filter panel (mirrors the web filters).
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = minAmount.trim() ? Number(minAmount) : null;
    const max = maxAmount.trim() ? Number(maxAmount) : null;
    return specialPricings.filter((p) => {
      if (term && !`${p.name} ${p.description}`.toLowerCase().includes(term))
        return false;
      if (entityFilter !== "all" && p.entityType !== entityFilter) return false;
      if (recurrenceFilter !== "all" && p.recurrenceType !== recurrenceFilter)
        return false;
      if (discountFilter !== "all" && p.discountType !== discountFilter)
        return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (stackFilter === "yes" && !p.isStackable) return false;
      if (stackFilter === "no" && p.isStackable) return false;
      if (locationFilter !== "all" && p.locationId !== locationFilter)
        return false;
      if (min != null && p.discountAmount < min) return false;
      if (max != null && p.discountAmount > max) return false;
      return true;
    });
  }, [
    specialPricings,
    search,
    entityFilter,
    recurrenceFilter,
    discountFilter,
    statusFilter,
    stackFilter,
    locationFilter,
    minAmount,
    maxAmount,
  ]);

  const filtersActive =
    entityFilter !== "all" ||
    recurrenceFilter !== "all" ||
    discountFilter !== "all" ||
    statusFilter !== "all" ||
    stackFilter !== "all" ||
    locationFilter !== "all" ||
    !!minAmount.trim() ||
    !!maxAmount.trim();

  const clearFilters = () => {
    setEntityFilter("all");
    setRecurrenceFilter("all");
    setDiscountFilter("all");
    setStatusFilter("all");
    setStackFilter("all");
    setLocationFilter("all");
    setMinAmount("");
    setMaxAmount("");
  };

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
        "ID", "Name", "Discount", "Type", "Recurrence",
        "Entity", "Location", "Priority", "Stackable", "Status",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((p) =>
        [
          p.id, p.name, p.discountLabel, p.discountType, p.recurrenceDisplay,
          p.entityType, p.locationName, p.priority,
          p.isStackable ? "Yes" : "No", p.status,
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
    entityFilter,
    recurrenceFilter,
    discountFilter,
    statusFilter,
    stackFilter,
    locationFilter,
    minAmount,
    maxAmount,
  ]);

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

  const handleEdit = (row: SpecialPricingRow) => {
    router.push({
      pathname: "/pricing/create-special-pricing",
      params: { id: String(row.id) },
    });
  };

  const handleDelete = (row: SpecialPricingRow) => {
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
            Special Pricing
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
            progressBackgroundColor={
              colorScheme === "dark" ? "#171717" : "#FFFFFF"
            }
          />
        }
      >
        <View className="px-5">

          <Pressable
            onPress={() => router.push("/pricing/fee-support")}
            className="mt-5 mb-5 flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
            style={{
              shadowColor: "#424242",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius: 6,
              elevation: 1,
            }}
          >
            <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
              <Feather name="dollar-sign" size={20} color="#0644C7" />
            </View>
            <Text className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">
              Fee Supports
            </Text>
            <Text className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
              Manage additional fees for packages, attractions, events, and
              memberships
            </Text>
            <View className="flex-row items-center mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
              <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                View All
              </Text>
              <Feather name="chevron-right" size={16} color="#0644C7" />
            </View>
          </Pressable>

           <Pressable
            onPress={() => router.push("/pricing/create-special-pricing")}
            className="flex-row mb-5 items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create Special Pricing
            </Text>
          </Pressable>

          
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
            <SpecialPricingKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="tag"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total Special Pricings"
                  value={String(kpis.total)}
                  change={`${kpis.active} active`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="repeat"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Weekly Recurring"
                  value={String(kpis.weekly)}
                  change="Every week discounts"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="calendar"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="One-Time Events"
                  value={String(kpis.oneTime)}
                  change="Specific date sales"
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
              placeholder="Search special pricings..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Controls — segmented pill (Filters · Export CSV) */}
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
                label="Entity Type"
                options={ENTITY_OPTIONS}
                value={entityFilter}
                onChange={setEntityFilter}
              />
              <ChipRow
                label="Recurrence"
                options={RECURRENCE_OPTIONS}
                value={recurrenceFilter}
                onChange={setRecurrenceFilter}
              />
              <ChipRow
                label="Discount Type"
                options={DISCOUNT_OPTIONS}
                value={discountFilter}
                onChange={setDiscountFilter}
              />
              <ChipRow
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <ChipRow
                label="Stackable"
                options={STACK_OPTIONS}
                value={stackFilter}
                onChange={setStackFilter}
              />

              {/* Location */}
              <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                Location
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
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
                  const active = locationFilter === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      onPress={() => setLocationFilter(loc.id)}
                      className={`px-3.5 py-2 rounded-lg border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          active ? "text-white" : "text-gray-600 dark:text-gray-300"
                        }`}
                        numberOfLines={1}
                      >
                        {loc.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Discount Amount range */}
              <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
                Discount Amount
              </Text>
              <View className="flex-row gap-3">
                <TextInput
                  value={minAmount}
                  onChangeText={setMinAmount}
                  placeholder="Min"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  className="flex-1 bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
                />
                <TextInput
                  value={maxAmount}
                  onChangeText={setMaxAmount}
                  placeholder="Max"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  className="flex-1 bg-gray-50 dark:bg-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
                />
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

          {/* List header + layout toggle (Table default / Cards) */}
          {!loading && !error && (
            <View className="flex-row items-center justify-between gap-2 mb-4 mt-2">
              <View className="flex-row items-center gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-lg font-bold text-gray-900 dark:text-white"
                >
                  All Special Pricings
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

          {/* List / states */}
          {loading ? (
            <SpecialPricingListSkeleton />
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="tag" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No special pricing found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {specialPricings.length === 0
                  ? "Create a special pricing to offer automatic discounts."
                  : "Try adjusting your search."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches. */}
                {viewMode === "table" ? (
                  <SpecialPricingTable
                    rows={paged}
                    cols={cols}
                    busyId={busyId}
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
                    <Feather name="check" size={14} color="#FFFFFF" strokeWidth={3} />
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
