import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
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
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { AttractionsKpiSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { EventsListSkeleton } from "../../components/ui/skeleton/EventsSkeleton";
import { consumeEventsStale, useEvents } from "../../lib/hooks/useEvents";
import { getCurrentUser } from "../../lib/session";
import type {
  EventDateType,
  EventRow,
  EventStatus,
} from "../../services/eventsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

type StatusFilter = "all" | EventStatus;
type DateTypeFilter = "all" | EventDateType;

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Status", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const DATE_TYPE_OPTIONS: { label: string; value: DateTypeFilter }[] = [
  { label: "All Types", value: "all" },
  { label: "One Time", value: "one_time" },
  { label: "Date Range", value: "date_range" },
];

const PER_PAGE_OPTIONS = [5, 10, 15];

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    if (!t) return "";
    const [hStr, mStr] = t.split(":");
    let hour = Number(hStr);
    const meridian = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${mStr ?? "00"} ${meridian}`;
  };
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return "";
  return `${s} – ${e}`;
}

function dateLabel(event: EventRow): string {
  if (event.dateType === "date_range") {
    return `${formatDate(event.startDate)} – ${event.endDate ? formatDate(event.endDate) : "…"}`;
  }
  return formatDate(event.startDate);
}

const StatusBadge = ({ status }: { status: EventStatus }) => {
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

const EventCard = ({ event }: { event: EventRow }) => {
  const timeRange = formatTimeRange(event.timeStart, event.timeEnd);
  const capacityLabel =
    event.maxBookingsPerSlot == null
      ? "Unlimited/slot"
      : `${event.maxBookingsPerSlot}/slot`;

  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* Header: name + date (left), status (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {event.name}
          </Text>
          <View className="flex-row items-center gap-1 mt-0.5">
            <Feather name="calendar" size={11} color="#9CA3AF" />
            <Text
              className="text-xs text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
              {dateLabel(event)}
            </Text>
          </View>
          {!!event.locationName && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Feather name="map-pin" size={11} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {event.locationName}
              </Text>
            </View>
          )}
        </View>
        <StatusBadge status={event.status} />
      </View>

      {/* Description */}
      {!!event.description && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 leading-5"
          numberOfLines={2}
        >
          {event.description}
        </Text>
      )}

      {/* Date type + price */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
          <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
            {event.dateType === "date_range" ? "Date Range" : "One Time"}
          </Text>
        </View>
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {formatMoney(event.price)}
          <Text className="text-xs font-normal text-gray-400"> /ticket</Text>
        </Text>
      </View>

      {/* Time / interval / capacity */}
      <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1 mt-2">
        {!!timeRange && <Stat icon="clock" label={timeRange} />}
        <Stat icon="repeat" label={`${event.intervalMinutes} min`} />
        <Stat icon="users" label={capacityLabel} />
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

const Events = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { events, loading, error, refetch } = useEvents();

  // Company admins can switch locations; location managers are already scoped to
  // their own location by the backend, so the selector is hidden for them
  // (mirrors the web Events page and the mobile Bookings screen).
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateTypeFilter, setDateTypeFilter] = useState<DateTypeFilter>("all");
  const [locationFilter, setLocationFilter] = useState<number | "all">("all");
  const [sheet, setSheet] = useState<null | "status" | "dateType" | "location">(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [exporting, setExporting] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // After creating an event, refetch on return so the new item + KPIs show
  // without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (consumeEventsStale()) refetch();
    }, [refetch]),
  );

  // Events scoped to the selected location. Drives the KPI cards and is the
  // base for the searchable list — mirrors the web location selector.
  const locationScoped = useMemo(
    () =>
      locationFilter === "all"
        ? events
        : events.filter((e) => e.locationId === locationFilter),
    [events, locationFilter],
  );

  // Location options derived from the loaded events — avoids the heavy
  // /api/locations endpoint (which OOM-crashes the app).
  const locations = useMemo(() => {
    const byId = new Map<number, string>();
    for (const e of events) {
      if (e.locationId != null && !byId.has(e.locationId)) {
        byId.set(e.locationId, e.locationName || `Location ${e.locationId}`);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [events]);

  // KPI values, computed over the location-scoped set so the cards react to
  // the location filter.
  const kpis = useMemo(() => {
    const total = locationScoped.length;
    const active = locationScoped.filter((e) => e.status === "active").length;
    const inactive = total - active;
    const avgPrice =
      total > 0 ? locationScoped.reduce((s, e) => s + e.price, 0) / total : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = locationScoped.filter((e) => {
      const end =
        e.dateType === "date_range" && e.endDate ? e.endDate : e.startDate;
      const d = new Date(`${(end || "").substring(0, 10)}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).length;
    return { total, active, inactive, avgPrice, upcoming };
  }, [locationScoped]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return locationScoped.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (dateTypeFilter !== "all" && e.dateType !== dateTypeFilter)
        return false;
      if (term) {
        const haystack =
          `${e.name} ${e.description} ${e.locationName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [locationScoped, search, statusFilter, dateTypeFilter]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateTypeFilter, locationFilter, perPage]);

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert("Nothing to export", "There are no events to export.");
      return;
    }
    setExporting(true);
    try {
      // Loaded lazily so these native modules never run at app startup (Expo
      // Router evaluates route modules eagerly on boot).
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "ID", "Name", "Category", "Location", "Price",
        "Status", "Date Type", "Start Date", "End Date", "Created",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((e) =>
        [
          e.id, e.name, e.dateType, e.locationName, e.price,
          e.status, e.dateType, e.startDate, e.endDate ?? "",
          e.createdAt ? new Date(e.createdAt).toLocaleString() : "",
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}events-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Events",
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

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Status";
  const dateTypeLabel =
    DATE_TYPE_OPTIONS.find((o) => o.value === dateTypeFilter)?.label ??
    "All Types";
  const locationLabel =
    locationFilter === "all"
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ??
        "All Locations");
  const hasResults = filtered.length > 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
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
            Events
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
          <View className="flex-row items-center justify-between gap-3">
            {/* Event Purchases Card */}
            <Pressable
              onPress={() => router.push("/events/purchases")}
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
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">
                Event Purchases
              </Text>
              <Text className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                View all customer purchases
              </Text>
              <View className="flex-row items-center mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  View All
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>

            {/* Onsite Purchase Card */}
            <Pressable
              onPress={() => router.push("/events/create-purchase")}
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
                <Feather name="plus-circle" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">
                Onsite Purchase
              </Text>
              <Text className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                Create walk-in ticket purchase
              </Text>
              <View className="flex-row items-center mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  View All
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>
          </View>

          {/* Header controls — full-width segmented pill (Location · Export
              CSV). The location selector is company-admin only; managers are
              scoped to their own location by the backend. */}
          <View className="mt-5">
            <FilterPill>
              {isCompanyAdmin && (
                <PillSegment
                  label={locationLabel}
                  active={sheet === "location"}
                  onPress={() => setSheet("location")}
                  renderIcon={(c) => <Feather name="map-pin" size={15} color={c} />}
                />
              )}
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
          </View>

          <Pressable
            onPress={() => router.push("/events/create-event")}
            className="flex-row mb-5 items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Create New Event
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
            <AttractionsKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="calendar"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total Events"
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
                  change="Per ticket"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="clock"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="Upcoming"
                  value={String(kpis.upcoming)}
                  change="Not yet ended"
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
              placeholder="Search events..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters — full-width segmented pill (Status · Date Type) */}
          <FilterPill>
            <PillSegment
              label={statusLabel}
              active={sheet === "status"}
              onPress={() => setSheet("status")}
              renderIcon={(c) => <Feather name="check-circle" size={15} color={c} />}
            />
            <PillSegment
              label={dateTypeLabel}
              active={sheet === "dateType"}
              onPress={() => setSheet("dateType")}
              renderIcon={(c) => <Feather name="calendar" size={15} color={c} />}
            />
          </FilterPill>

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                All Events
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
            <EventsListSkeleton />
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="calendar" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No events found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {events.length === 0
                  ? "There are no events for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {paged.map((event) => (
                  <EventCard key={event.id} event={event} />
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

      {/* Status filter */}
      <BottomSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Filter by Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setStatusFilter(option.value);
                  setSheet(null);
                }}
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
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Date type filter */}
      <BottomSheet
        visible={sheet === "dateType"}
        onClose={() => setSheet(null)}
        title="Filter by Date Type"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {DATE_TYPE_OPTIONS.map((option) => {
            const isSelected = dateTypeFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setDateTypeFilter(option.value);
                  setSheet(null);
                }}
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
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Location filter */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
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
                    setSheet(null);
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
    </View>
  );
};

export default Events;
