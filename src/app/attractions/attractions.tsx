import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ComponentProps,
} from "react";
import {
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
import {
  AttractionFiltersSheet,
  EMPTY_ATTRACTION_FILTERS,
  countActiveAttractionFilters,
  type AttractionFilterValues,
} from "../../components/ui/AttractionFiltersSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import {
  AttractionsKpiSkeleton,
  AttractionsListSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  consumeAttractionsStale,
  useAttractions,
} from "../../lib/hooks/useAttractions";
import { getCurrentUser } from "../../lib/session";
import type {
  AttractionRow,
  AttractionStatus,
} from "../../services/attractionsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [5, 10, 15];

// Only these pricing types carry a unit suffix on the web page.
const PRICING_SUFFIX: Record<string, string> = {
  per_person: "/person",
  per_group: "/group",
  per_hour: "/hour",
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatCreatedAt(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function durationLabel(row: AttractionRow): string {
  if (!row.duration) return "Unlimited";
  return `${row.duration} ${row.durationUnit}`;
}

const StatusBadge = ({ status }: { status: AttractionStatus }) => {
  const active = status === "active";
  return (
    <View
      className={`px-2.5 py-1 rounded-full ${
        active
          ? "bg-green-50 dark:bg-green-900/30"
          : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      <Text
        className={`text-xs font-semibold capitalize ${
          active
            ? "text-green-600 dark:text-green-400"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {status}
      </Text>
    </View>
  );
};

const Stat = ({ icon, label }: { icon: ComponentIconName; label: string }) => (
  <View className="flex-row items-center gap-1.5">
    <Feather name={icon} size={12} color="#9CA3AF" />
    <Text className="text-xs text-gray-500 dark:text-gray-400">{label}</Text>
  </View>
);

type ComponentIconName = ComponentProps<typeof Feather>["name"];

const AttractionCard = ({
  attraction,
  onActions,
}: {
  attraction: AttractionRow;
  onActions: () => void;
}) => {
  const isCopy = attraction.name.includes("(Copy)");
  const suffix = PRICING_SUFFIX[attraction.pricingType] ?? "";
  const created = formatCreatedAt(attraction.createdAt);

  return (
    <Pressable
      onPress={onActions}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`Actions for ${attraction.name}`}
    >
      {/* Header: name + location (left), status + actions (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center gap-2 flex-wrap">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {attraction.name}
            </Text>
            {isCopy && (
              <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40">
                <Feather name="copy" size={9} color="#B45309" />
                <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  Copy
                </Text>
              </View>
            )}
          </View>
          {!!attraction.locationName && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Feather name="map-pin" size={11} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {attraction.locationName}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <StatusBadge status={attraction.status} />
          <Pressable
            onPress={onActions}
            hitSlop={6}
            className="w-8 h-8 rounded-lg items-center justify-center bg-gray-100 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${attraction.name}`}
          >
            <Feather name="more-vertical" size={16} color="#6B7280" />
          </Pressable>
        </View>
      </View>

      {/* Description */}
      {!!attraction.description && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 leading-5"
          numberOfLines={2}
        >
          {attraction.description}
        </Text>
      )}

      {/* Category + price */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
          <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
            {attraction.category}
          </Text>
        </View>
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {formatMoney(attraction.price)}
          {!!suffix && (
            <Text className="text-xs font-normal text-gray-400"> {suffix}</Text>
          )}
        </Text>
      </View>

      {/* Capacity / duration / created */}
      <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1 mt-2">
        <Stat
          icon="users"
          label={`${attraction.maxCapacity} people${
            attraction.displayCapacityToCustomers ? "" : " (hidden)"
          }`}
        />
        <Stat icon="clock" label={durationLabel(attraction)} />
        {!!created && <Stat icon="calendar" label={created} />}
      </View>
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

const Attractions = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { attractions, loading, error, refetch } = useAttractions();

  // Company admins can switch locations; location managers are already scoped to
  // their own location by the backend, so the selector is hidden for them
  // (mirrors the web ManageAttractions page and the mobile Bookings screen).
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<AttractionFilterValues>(
    EMPTY_ATTRACTION_FILTERS,
  );
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showCreatedDateSheet, setShowCreatedDateSheet] = useState(false);
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [actionsAttraction, setActionsAttraction] =
    useState<AttractionRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

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

  // Attractions scoped to the selected location. This drives the KPI cards and
  // is the base for the searchable list — mirroring the web, where the location
  // selector re-scopes the whole dataset while status/category/search only
  // filter the list below it.
  const locationScoped = useMemo(
    () =>
      locationFilter === "all"
        ? attractions
        : attractions.filter((a) => a.locationId === locationFilter),
    [attractions, locationFilter],
  );

  // Category options derived from the (location-scoped) data — no extra call.
  const categories = useMemo(() => {
    const set = new Set(locationScoped.map((a) => a.category).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [locationScoped]);

  // Location options derived from the loaded attractions — avoids the heavy
  // /api/locations endpoint (which OOM-crashes the app).
  const locations = useMemo(() => {
    const byId = new Map<number, string>();
    for (const a of attractions) {
      if (a.locationId != null && !byId.has(a.locationId)) {
        byId.set(a.locationId, a.locationName || `Location ${a.locationId}`);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [attractions]);

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
    const priceMin = filters.priceMin === "" ? null : parseFloat(filters.priceMin);
    const priceMax = filters.priceMax === "" ? null : parseFloat(filters.priceMax);
    const capMin =
      filters.capacityMin === "" ? null : parseFloat(filters.capacityMin);
    const capMax =
      filters.capacityMax === "" ? null : parseFloat(filters.capacityMax);
    const { createdStart, createdEnd } = filters;

    return locationScoped
      .filter((a) => {
        if (filters.status !== "all" && a.status !== filters.status) return false;
        if (filters.category !== "all" && a.category !== filters.category)
          return false;
        if (filters.pricingType !== "all" && a.pricingType !== filters.pricingType)
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
  }, [search, filters, locationFilter, perPage]);

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

  const locationLabel =
    locationFilter === "all"
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ??
        "All Locations");
  const hasResults = filtered.length > 0;

  // Mirrors the web "More" action menu; these management actions arrive in a
  // future release, so they're shown but not yet actionable.
  const moreActions: { label: string; icon: ComponentIconName }[] = [
    { label: "Fee Supports", icon: "dollar-sign" },
    { label: "Special Pricing", icon: "percent" },
    { label: "Import Attractions", icon: "upload" },
    { label: "Export Attractions", icon: "download" },
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

         
          {/* Location selector — company-admin only; managers are scoped to
              their own location by the backend. */}
          {isCompanyAdmin && (
            <FilterPill>
              <PillSegment
                label={locationLabel}
                active={showLocationSheet}
                onPress={() => setShowLocationSheet(true)}
                renderIcon={(c) => (
                  <Feather name="map-pin" size={15} color={c} />
                )}
              />
            </FilterPill>
          )}

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

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
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
                {paged.map((attraction) => (
                  <AttractionCard
                    key={attraction.id}
                    attraction={attraction}
                    onActions={() => setActionsAttraction(attraction)}
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

      {/* Location filter */}
      <BottomSheet
        visible={showLocationSheet}
        onClose={() => setShowLocationSheet(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: "all" as const, name: "All Locations" }, ...locations].map(
            (option) => {
              const isSelected = locationFilter === option.id;
              return (
                <Pressable
                  key={String(option.id)}
                  onPress={() => {
                    setLocationFilter(option.id);
                    setShowLocationSheet(false);
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

      {/* More actions (matches the web action menu; wired in a future release) */}
      <BottomSheet
        visible={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        title="More"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {moreActions.map((action) => (
            <View
              key={action.label}
              className="flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 opacity-60"
            >
              <View className="flex-row items-center gap-3 flex-1 mr-2">
                <Feather name={action.icon} size={18} color="#6B7280" />
                <Text className="text-base font-medium text-gray-700 dark:text-gray-200">
                  {action.label}
                </Text>
              </View>
              <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Soon
                </Text>
              </View>
            </View>
          ))}
          <Text className="text-xs text-gray-400 dark:text-gray-500 px-4 mt-2">
            Management actions arrive in a future update.
          </Text>
        </ScrollView>
      </BottomSheet>

      {/* Per-card actions: Copy Link / Open Link / View / Edit / Duplicate / Delete */}
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
