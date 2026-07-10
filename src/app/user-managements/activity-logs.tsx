import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { KpiCard } from "../../components/ui/KpiCard";
import { Pagination } from "../../components/ui/Pagination";
import { useActivityLogs, useActivityStats } from "../../lib/hooks/useActivityLogs";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser } from "../../lib/session";
import {
  CATEGORY_OPTIONS,
  CATEGORY_TONE,
  type ActivityCategory,
  type ActivityFilters,
  type ActivityLogEntry,
} from "../../services/activityLogsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PER_PAGE_OPTIONS = [15, 25, 50];

// Category badge → Tailwind classes (mirrors CATEGORY_TONE slugs).
const TONE_CLASS: Record<string, string> = {
  emerald: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  rose: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
  indigo: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400",
  amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  gray: "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300",
};

function toneClass(category: string): string {
  return TONE_CLASS[CATEGORY_TONE[category] ?? "gray"] ?? TONE_CLASS.gray;
}

function timeAgo(value: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fullTimestamp(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CategoryBadge = ({ category }: { category: string }) => {
  const cls = toneClass(category);
  return (
    <View className={`px-2 py-1 rounded-full ${cls}`}>
      <Text className={`text-[10px] font-semibold capitalize ${cls}`}>{category}</Text>
    </View>
  );
};

const LogCard = ({
  log,
  showLocation,
  onPress,
}: {
  log: ActivityLogEntry;
  showLocation: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
    style={CARD_SHADOW}
    accessibilityRole="button"
    accessibilityLabel={`Activity: ${log.action}`}
  >
    <View className="flex-row items-start justify-between mb-1.5">
      <View className="flex-1 mr-3">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {log.actor.name}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {log.actor.roleLabel}
        </Text>
      </View>
      <CategoryBadge category={log.category} />
    </View>

    <Text className="text-sm text-gray-700 dark:text-gray-200" numberOfLines={2}>
      {log.description || log.action}
    </Text>

    {showLocation && !!log.locationName && (
      <View className="flex-row items-center gap-1.5 mt-2">
        <Feather name="map-pin" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {log.locationName}
        </Text>
      </View>
    )}

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="clock" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {timeAgo(log.createdAt)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {!!log.ipAddress && (
          <Text className="text-[10px] text-gray-400 dark:text-gray-500">
            IP {log.ipAddress}
          </Text>
        )}
        <Text className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
          View details
        </Text>
      </View>
    </View>
  </Pressable>
);

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-start justify-between py-2 border-b border-gray-100 dark:border-neutral-800">
    <Text className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
      {label}
    </Text>
    <Text
      className="text-sm text-gray-800 dark:text-gray-100 flex-1 text-right ml-4"
      selectable
    >
      {value}
    </Text>
  </View>
);

const ActivityLogs = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";

  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "all">("all");
  const [locationFilter, setLocationFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "category" | "location">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selected, setSelected] = useState<ActivityLogEntry | null>(null);

  const { locations } = useLocationOptions();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, locationFilter, debouncedSearch, perPage]);

  const activeLocationId =
    isCompanyAdmin && locationFilter != null ? locationFilter : undefined;

  const filters = useMemo<ActivityFilters>(
    () => ({
      search: debouncedSearch || undefined,
      category: categoryFilter === "all" ? undefined : categoryFilter,
      locationId: activeLocationId,
    }),
    [debouncedSearch, categoryFilter, activeLocationId],
  );

  const { logs, total, loading, error, refetch } = useActivityLogs({
    filters,
    page,
    perPage,
  });
  const { stats } = useActivityStats(activeLocationId, statsNonce);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setStatsNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const categoryLabel =
    categoryFilter === "all"
      ? "All Actions"
      : (CATEGORY_OPTIONS.find((o) => o.value === categoryFilter)?.label ?? "All Actions");
  const locationLabel =
    locationFilter == null
      ? "All Locations"
      : (locations.find((l) => l.id === locationFilter)?.name ?? "Location");

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
            Activity Log
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
        <View className="px-5">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Activity Log
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track activities across managers and attendants
            </Text>
          </View>

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards */}
          <View className="flex-row flex-wrap -mx-1.5 mb-3">
            <View className="w-1/2">
              <KpiCard
                icon="activity"
                tone={{ bg: "#0644C720", tint: PRIMARY }}
                title="Total Activities"
                value={String(stats.total)}
                hint="All time"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="zap"
                tone={{ bg: "#10B98120", tint: "#10B981" }}
                title="Today"
                value={String(stats.today)}
                hint="Last 24 hours"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="shield"
                tone={{ bg: "#3B82F620", tint: "#3B82F6" }}
                title="Manager Actions"
                value={String(stats.managerActions)}
                hint="Today"
              />
            </View>
            <View className="w-1/2">
              <KpiCard
                icon="user"
                tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                title="Attendant Actions"
                value={String(stats.attendantActions)}
                hint="Today"
              />
            </View>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search activities..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => setSheet("category")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="filter" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {categoryLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            {isCompanyAdmin && (
              <Pressable
                onPress={() => setSheet("location")}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
              >
                <Feather name="map-pin" size={16} color={PRIMARY} />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  {locationLabel}
                </Text>
                <Feather name="chevron-down" size={14} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Activities
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {total}
                </Text>
              </View>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-10 items-center shadow-sm">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !error && logs.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="activity" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No activity found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                Try a different action type, location, or search term.
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {logs.map((log) => (
                  <LogCard
                    key={log.id}
                    log={log}
                    showLocation={isCompanyAdmin}
                    onPress={() => setSelected(log)}
                  />
                ))}

                <Pagination
                  page={page}
                  perPage={perPage}
                  total={total}
                  options={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
          )}
        </View>
      </ScrollView>

      {/* Category filter */}
      <BottomSheet
        visible={sheet === "category"}
        onClose={() => setSheet(null)}
        title="Filter by Action"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ label: "All Actions", value: "all" as const }, ...CATEGORY_OPTIONS].map(
            (option) => {
              const isSelected = categoryFilter === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setCategoryFilter(option.value);
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
            },
          )}
        </ScrollView>
      </BottomSheet>

      {/* Location filter (company admin) */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Filter by Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {[{ id: null as number | null, name: "All Locations" }, ...locations].map(
            (option) => {
              const isSelected = locationFilter === option.id;
              return (
                <Pressable
                  key={String(option.id ?? "all")}
                  onPress={() => {
                    setLocationFilter(option.id);
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

      {/* Activity detail */}
      <BottomSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.action ?? "Activity"}
      >
        <ScrollView className="px-5 pb-8" showsVerticalScrollIndicator={false}>
          {selected && (
            <>
              <View className="flex-row items-center gap-2 mb-3">
                <CategoryBadge category={selected.category} />
                <Text className="text-xs text-gray-400 dark:text-gray-500 flex-1 text-right">
                  {timeAgo(selected.createdAt)}
                </Text>
              </View>
              <Text className="text-sm text-gray-700 dark:text-gray-200 mb-4">
                {selected.description || selected.action}
              </Text>

              <DetailRow label="User" value={selected.actor.name} />
              <DetailRow label="Role" value={selected.actor.roleLabel} />
              {!!selected.actor.email && (
                <DetailRow label="Email" value={selected.actor.email} />
              )}
              {!!selected.locationName && (
                <DetailRow label="Location" value={selected.locationName} />
              )}
              {!!selected.entityType && (
                <DetailRow
                  label="Entity"
                  value={`${selected.entityType}${
                    selected.entityId != null ? ` #${selected.entityId}` : ""
                  }`}
                />
              )}
              {!!selected.ipAddress && (
                <DetailRow label="IP Address" value={selected.ipAddress} />
              )}
              <DetailRow label="When" value={fullTimestamp(selected.createdAt)} />
              {!!selected.userAgent && (
                <DetailRow label="Device" value={selected.userAgent} />
              )}
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default ActivityLogs;
