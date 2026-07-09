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
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { WaiverDetailSheet } from "../../components/ui/WaiverDetailSheet";
import {
  WaiversKpiSkeleton,
  WaiversListSkeleton,
} from "../../components/ui/skeleton/WaiversSkeleton";
import {
  consumeWaiversStale,
  useWaivers,
  useWaiverStats,
} from "../../lib/hooks/useWaivers";
import { useWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { getCurrentUser } from "../../lib/session";
import {
  SOURCE_LABELS,
  type Waiver,
  type WaiverSearchFilters,
  type WaiverStatus,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

// Statuses the backend supports on the Records filter (mirrors the web select;
// there is no "all statuses" fetch, so one status is always active).
const STATUS_OPTIONS: { label: string; value: WaiverStatus }[] = [
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Expired", value: "expired" },
  { label: "Replaced", value: "replaced" },
];

type DateFilter = "all" | "today";
const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: "All Dates", value: "all" },
  { label: "Today", value: "today" },
];

const PER_PAGE_OPTIONS = [10, 25, 50];

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">{change}</Text>
  </View>
);

const WaiverCard = ({
  waiver,
  showLocation,
  onPress,
}: {
  waiver: Waiver;
  showLocation: boolean;
  onPress: () => void;
}) => {
  const linkedTo = waiver.bookingReference
    ? `#${waiver.bookingReference}`
    : waiver.eventName
      ? waiver.eventName
      : waiver.attractionPurchaseId
        ? `AP-${waiver.attractionPurchaseId}`
        : null;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`View waiver for ${waiver.adultName}`}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {waiver.adultName}
          </Text>
          {!!waiver.adultEmail && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              {waiver.adultEmail}
            </Text>
          )}
        </View>
        <StatusBadge status={waiver.status} />
      </View>

      <View className="flex-row items-center gap-1.5">
        <Feather name="file-text" size={12} color="#9CA3AF" />
        <Text
          className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {waiver.templateTitle ?? "—"}
        </Text>
      </View>

      <View className="flex-row items-center gap-1.5 mt-1">
        <Feather name="calendar" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {formatDate(waiver.selectedDate)} · {SOURCE_LABELS[waiver.source] ?? waiver.source}
        </Text>
      </View>

      {showLocation && !!waiver.locationName && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Feather name="map-pin" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {waiver.locationName}
          </Text>
        </View>
      )}

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-1.5">
          <Feather name="users" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {waiver.minorsCount} minor{waiver.minorsCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {waiver.marketingConsentStatus === "opted_in" && (
            <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                Opted in
              </Text>
            </View>
          )}
          {!!linkedTo && (
            <View className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-medium text-blue-700 dark:text-blue-400" numberOfLines={1}>
                {linkedTo}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const Waivers = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  // assign is admin/manager only (attendant is read-only) — matches the backend
  // guardManager on POST /waivers/assign.
  const canAssign = isCompanyAdmin || role === "location_manager";
  // Sub-module links: attendants only get Waiver Records on the web sidebar.
  const canManageSubModules = canAssign;

  const { settings } = useWaiverSettings();
  // Admin-only delete, honoring the company's admin_delete_enabled UI hint.
  const canDelete = isCompanyAdmin && (settings?.adminDeleteEnabled ?? true);

  const [statusFilter, setStatusFilter] = useState<WaiverStatus>("completed");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "status" | "date" | "manage">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFilter, debouncedSearch, perPage]);

  const filters = useMemo<WaiverSearchFilters>(
    () => ({
      status: statusFilter,
      all: dateFilter === "all",
      date: dateFilter === "today" ? todayKey() : undefined,
      adultName: debouncedSearch || undefined,
    }),
    [statusFilter, dateFilter, debouncedSearch],
  );

  const { waivers, total, lastPage, loading, error, refetch } = useWaivers({
    filters,
    page,
    perPage,
  });
  const { stats } = useWaiverStats(statsNonce);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setStatsNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Refetch on return after a mutation (assign / delete).
  useFocusEffect(
    useCallback(() => {
      if (consumeWaiversStale()) {
        refetch();
        setStatsNonce((n) => n + 1);
      }
    }, [refetch]),
  );

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "Completed";
  const dateLabel =
    DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "All Dates";

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Waivers</Text>
          {canManageSubModules ? (
            <Pressable
              onPress={() => setSheet("manage")}
              className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
              accessibilityRole="button"
              accessibilityLabel="Manage waivers"
            >
              <Feather name="more-horizontal" size={20} color={headerIcon} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
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
              Waiver Records
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Search and review signed and pending waivers
            </Text>
          </View>

          {/* Sub-navigation (managers + admins) */}
          {canManageSubModules && (
            <View className="flex-row gap-3 mb-5">
              <Pressable
                onPress={() => router.push("/waivers/templates" as never)}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
              >
                <Feather name="layout" size={16} color={PRIMARY} />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  Templates
                </Text>
                <Feather name="chevron-right" size={14} color="#9CA3AF" />
              </Pressable>

              <Pressable
                onPress={() => router.push("/waivers/group-invites" as never)}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
              >
                <Feather name="users" size={16} color={PRIMARY} />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  Group Invites
                </Text>
                <Feather name="chevron-right" size={14} color="#9CA3AF" />
              </Pressable>
            </View>
          )}

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards (derived from per-status count requests) */}
          {loading && waivers.length === 0 ? (
            <WaiversKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="check-circle"
                  tone={{ bg: "#10B98120", tint: "#10B981" }}
                  title="Completed"
                  value={String(stats.completed)}
                  change="Signed waivers"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="clock"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Pending"
                  value={String(stats.pending)}
                  change="Awaiting signature"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="alert-triangle"
                  tone={{ bg: "#F43F5E20", tint: "#F43F5E" }}
                  title="Expired"
                  value={String(stats.expired)}
                  change="No longer valid"
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="file-text"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total"
                  value={String(stats.total)}
                  change="Across all dates"
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
              placeholder="Search by guardian name..."
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
              onPress={() => setSheet("status")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="check-circle" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {statusLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setSheet("date")}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {dateLabel}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                Waivers
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
            <WaiversListSkeleton />
          ) : !error && waivers.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="file-text" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No waivers found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                Try a different status, date, or search term.
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {waivers.map((w) => (
                  <WaiverCard
                    key={w.id}
                    waiver={w}
                    showLocation={isCompanyAdmin}
                    onPress={() => setSelectedId(w.id)}
                  />
                ))}

                {/* Pagination (server-side) */}
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
                                  isActive ? "text-white" : "text-gray-600 dark:text-gray-300"
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

      {/* Date filter */}
      <BottomSheet
        visible={sheet === "date"}
        onClose={() => setSheet(null)}
        title="Filter by Date"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {DATE_OPTIONS.map((option) => {
            const isSelected = dateFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setDateFilter(option.value);
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

      {/* Manage (sub-module navigation) */}
      <BottomSheet
        visible={sheet === "manage"}
        onClose={() => setSheet(null)}
        title="Manage Waivers"
      >
        <View className="px-4 pb-8">
          <Pressable
            onPress={() => {
              setSheet(null);
              router.push("/waivers/templates" as never);
            }}
            className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
          >
            <Feather name="layout" size={18} color={PRIMARY} />
            <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
              Waiver Templates
            </Text>
            <Feather name="chevron-right" size={16} color="#9CA3AF" />
          </Pressable>
          <Pressable
            onPress={() => {
              setSheet(null);
              router.push("/waivers/group-invites" as never);
            }}
            className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
          >
            <Feather name="users" size={18} color={PRIMARY} />
            <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
              Group Invites
            </Text>
            <Feather name="chevron-right" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      </BottomSheet>

      {/* Waiver detail */}
      <WaiverDetailSheet
        waiverId={selectedId}
        visible={selectedId !== null}
        onClose={() => setSelectedId(null)}
        canDelete={canDelete}
        onChanged={() => {
          refetch();
          setStatsNonce((n) => n + 1);
        }}
      />

      {/* FAB — Assign Waiver (admins + managers only) */}
      {canAssign && (
        <Pressable
          onPress={() => router.push("/waivers/create-waiver" as never)}
          accessibilityRole="button"
          accessibilityLabel="Assign waiver"
          style={{
            position: "absolute",
            right: 20,
            bottom: insets.bottom + 20,
            shadowColor: PRIMARY,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          }}
          className="h-14 w-14 items-center justify-center rounded-full bg-[#0644C7] active:opacity-90"
        >
          <Feather name="plus" size={26} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  );
};

export default Waivers;
