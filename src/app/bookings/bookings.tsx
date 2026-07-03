import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { AttractionsKpiSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { BookingsListSkeleton } from "../../components/ui/skeleton/BookingsSkeleton";
import { consumeBookingsStale, useBookings } from "../../lib/hooks/useBookings";
import { getCurrentUser } from "../../lib/session";
import type { BookingStatus, CalendarBooking } from "../../services/bookingsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

type StatusFilter = "all" | BookingStatus;
type DateFilter = "all" | "upcoming" | "today" | "past";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: "All Dates", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Today", value: "today" },
  { label: "Past", value: "past" },
];

const PER_PAGE_OPTIONS = [5, 10, 15];

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Local calendar date as YYYY-MM-DD (lexically comparable to booking.date). */
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

function formatTime(time: string | null): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

const Stat = ({
  icon,
  label,
}: {
  icon: ComponentIconName;
  label: string;
}) => (
  <View className="flex-row items-center gap-1.5">
    <Feather name={icon} size={12} color="#9CA3AF" />
    <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const BookingCard = ({
  booking,
  showLocation,
  onPress,
}: {
  booking: CalendarBooking;
  showLocation: boolean;
  onPress: () => void;
}) => {
  const dateTime = [formatDate(booking.date), formatTime(booking.time)]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`View booking for ${booking.customerName}`}
    >
      {/* Header: customer + ref (left), status (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {booking.customerName}
          </Text>
          {!!booking.referenceNumber && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              #{booking.referenceNumber}
            </Text>
          )}
        </View>
        <StatusBadge status={booking.status} />
      </View>

      {/* Package */}
      <View className="flex-row items-center gap-1.5">
        <Feather name="package" size={12} color="#9CA3AF" />
        <Text
          className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {booking.packageName}
        </Text>
      </View>

      {/* Date / time */}
      <View className="flex-row items-center gap-1.5 mt-1">
        <Feather name="calendar" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
          {dateTime}
        </Text>
      </View>

      {/* Location */}
      {showLocation && !!booking.locationName && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Feather name="map-pin" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {booking.locationName}
          </Text>
        </View>
      )}

      {/* Footer: guests + total */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Stat icon="users" label={`${booking.participants} guests`} />
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {formatMoney(booking.totalAmount)}
        </Text>
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

const Bookings = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";

  const { bookings, loading, error, refetch } = useBookings();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sheet, setSheet] = useState<null | "status" | "date" | "location">(null);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Refetch on return after a mutation (e.g. a status/payment change from the
  // detail sheet) so the list + KPIs reflect it without a manual pull.
  useFocusEffect(
    useCallback(() => {
      if (consumeBookingsStale()) refetch();
    }, [refetch]),
  );

  // Location options derived from the loaded bookings — avoids the heavy
  // /api/locations endpoint (which OOM-crashes the app). Company admins load
  // every location's bookings; managers are scoped to their own by the backend.
  const locations = useMemo(() => {
    const names = new Set<string>();
    for (const b of bookings) {
      if (b.locationName) names.add(b.locationName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [bookings]);

  // Bookings scoped to the selected location. Drives the KPI cards and is the
  // base for the searchable list — mirrors the web location selector.
  const locationScoped = useMemo(
    () =>
      locationFilter === "all"
        ? bookings
        : bookings.filter((b) => b.locationName === locationFilter),
    [bookings, locationFilter],
  );

  // KPI values, computed client-side over the location-scoped set — mirroring
  // the web's `metrics` array exactly (Bookings.tsx:409-445). The web has no
  // stats endpoint; it derives all five cards from the loaded bookings array
  // (which is location-scoped when a location is selected). We do the same off
  // the same `/api/bookings` list feed, so there are no extra requests.
  const kpis = useMemo(() => {
    const active = locationScoped.filter((b) => b.status !== "cancelled");
    return {
      // Total Bookings — bookings.length
      total: locationScoped.length,
      // Package Bookings — same count as total (all bookings are packages);
      // the subtitle surfaces the confirmed count.
      confirmed: locationScoped.filter((b) => b.status === "confirmed").length,
      cancelled: locationScoped.length - active.length,
      // Participants — sum of participants
      participants: locationScoped.reduce((s, b) => s + b.participants, 0),
      // Revenue — sum of amountPaid, excluding cancelled
      revenue: active.reduce((s, b) => s + b.amountPaid, 0),
      // Possible Revenue — sum of totalAmount, excluding cancelled
      possibleRevenue: active.reduce((s, b) => s + b.totalAmount, 0),
    };
  }, [locationScoped]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = todayKey();
    return locationScoped.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (dateFilter === "upcoming" && b.date < today) return false;
      if (dateFilter === "today" && b.date !== today) return false;
      if (dateFilter === "past" && b.date >= today) return false;
      if (term) {
        const haystack =
          `${b.customerName} ${b.packageName} ${b.referenceNumber ?? ""} ${b.locationName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [locationScoped, search, statusFilter, dateFilter]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFilter, locationFilter, perPage]);

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "All Statuses";
  const dateLabel = DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "All Dates";
  const locationLabel = locationFilter === "all" ? "All Locations" : locationFilter;
  const hasResults = filtered.length > 0;

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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Bookings</Text>
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
          {/* Overview intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Manage Bookings
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View and manage all package bookings
            </Text>
          </View>

          {/* Location filter (company admins only — mirrors the web header
              control; managers are scoped to their own location). */}
          {isCompanyAdmin && (
            <Pressable
              onPress={() => setSheet("location")}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800 mb-5"
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

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
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
                  title="Total Bookings"
                  value={String(kpis.total)}
                  change={`${kpis.total} total bookings`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="package"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Package Bookings"
                  value={String(kpis.total)}
                  change={`${kpis.confirmed} confirmed`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="users"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Participants"
                  value={String(kpis.participants)}
                  change={`${kpis.total} bookings`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="dollar-sign"
                  tone={{ bg: "#10B98120", tint: "#10B981" }}
                  title="Revenue"
                  value={formatMoney(kpis.revenue)}
                  change={`Excludes ${kpis.cancelled} cancelled`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="dollar-sign"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="Possible Revenue"
                  value={formatMoney(kpis.possibleRevenue)}
                  change="Total if all bookings fully paid"
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
              placeholder="Search bookings..."
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
                All Bookings
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
            <BookingsListSkeleton />
          ) : !error && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="calendar" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No bookings found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {bookings.length === 0
                  ? "There are no bookings for this account yet."
                  : "Try adjusting your search or filters."}
              </Text>
            </View>
          ) : (
            !error && (
              <>
                {paged.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    showLocation={isCompanyAdmin}
                    onPress={() => setSelectedBookingId(booking.id)}
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

      {/* Location filter */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {["all", ...locations].map((name) => {
            const isSelected = locationFilter === name;
            return (
              <Pressable
                key={name}
                onPress={() => {
                  setLocationFilter(name);
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
                  {name === "all" ? "All Locations" : name}
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

      {/* Full booking detail (view / edit / status / payment) */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default Bookings;
