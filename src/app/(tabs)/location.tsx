import {
  BarChart3,
  Calendar,
  CalendarDays,
  ChevronDown,
  Clock,
  MapPin,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DashboardHeader } from "../../components/ui/DashboardHeader";
import { Pagination } from "../../components/ui/Pagination";
import {
  OverviewCardsSkeleton,
  TopCardsSkeleton,
} from "../../components/ui/skeleton/LocationSkeleton";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { useNotifications } from "../../lib/hooks/useNotifications";
import {
  setActiveLocation,
  useActiveLocation,
} from "../../lib/location/activeLocationStore";

type DateFilterType =
  | "today"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "all_time"
  | "custom";

/** Flattened per-location row used by every card on this screen. */
type LocationRow = {
  id: number;
  name: string;
  bookings: number;
  tickets: number;
  events: number;
  waivers: number;
  waiversSigned: number;
  revenue: number;
  utilization: number;
  bookingRevenue: number;
  purchaseRevenue: number;
  eventPurchaseRevenue: number;
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Utilization track + percentage. Web renders one brand blue for every
 *  location, so the fill is not thresholded here either. */
const UtilizationBar = ({ value }: { value: number }) => {
  // Ensure value is between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 h-2 rounded-full bg-blue-200 dark:bg-blue-900/40 overflow-hidden">
        <View
          className="h-full rounded-full bg-[#0644C7]"
          style={{ width: `${clampedValue}%` }}
        />
      </View>
      <Text className="text-xs font-semibold text-[#0644C7] min-w-[34px] text-right">
        {clampedValue}%
      </Text>
    </View>
  );
};

/** Label above a headline figure — the layout every stat on this screen uses.
 *  `sub` is the optional caption web renders under a figure (Waivers signed). */
const StatCell = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) => (
  <View className="flex-1 pr-2">
    <Text className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
      {label}
    </Text>
    <Text
      className="text-lg font-bold text-[#0644C7]"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {value}
    </Text>
    {sub ? (
      <Text
        className="text-[10px] text-gray-400 dark:text-gray-500"
        numberOfLines={1}
      >
        {sub}
      </Text>
    ) : null}
  </View>
);

/** Smaller label/value pair for the per-source revenue breakdown row. */
const RevenueCell = ({ label, value }: { label: string; value: number }) => (
  <View className="flex-1 pr-2">
    <Text className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">
      {label}
    </Text>
    <Text
      className="text-xs font-semibold text-gray-700 dark:text-gray-300"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {formatMoney(value)}
    </Text>
  </View>
);

const TopLocationCard = ({
  rank,
  location,
}: {
  rank: number;
  location: LocationRow;
}) => (
  <View
    className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 mb-3 shadow-sm border-2 border-[#0644C7]"
    style={{
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    }}
  >
    {/* Rank + name, with total revenue on the right */}
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center gap-3 flex-1 mr-3">
        <View className="w-10 h-10 rounded-full bg-[#0644C7] items-center justify-center shadow-sm">
          <Text className="text-white font-bold text-lg">{rank}</Text>
        </View>
        <Text
          className="flex-1 text-lg font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {location.name}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
          Revenue
        </Text>
        <Text className="text-lg font-bold text-[#0644C7]">
          {formatMoney(location.revenue)}
        </Text>
      </View>
    </View>

    {/* Bookings • Tickets • Events • Waivers — web's "bkgs · tix · events ·
        waivers" line, in the same order. */}
    <View className="flex-row mb-3">
      <StatCell label="Bookings" value={location.bookings} />
      <StatCell label="Tickets" value={location.tickets} />
      <StatCell label="Events" value={location.events} />
      <StatCell label="Waivers" value={location.waivers} />
    </View>

    <View className="mb-3">
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Utilization
      </Text>
      <UtilizationBar value={location.utilization} />
    </View>

    {/* Revenue split by source */}
    <View className="flex-row pt-3 border-t border-[#0644C7]/20">
      <RevenueCell label="Bookings Rev." value={location.bookingRevenue} />
      <RevenueCell label="Tickets Rev." value={location.purchaseRevenue} />
      <RevenueCell label="Events Rev." value={location.eventPurchaseRevenue} />
    </View>
  </View>
);

const OverviewCard = ({ location }: { location: LocationRow }) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-3 shadow-sm border border-gray-100 dark:border-neutral-800"
    style={{
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    }}
  >
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center gap-2 flex-1 mr-2">
        <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
          <MapPin size={16} color="#0644C7" />
        </View>
        <Text
          className="text-base font-semibold text-gray-900 dark:text-white flex-1"
          numberOfLines={1}
        >
          {location.name}
        </Text>
      </View>
      {/* Web shows a utilization dot here (tooltip only); the % itself is
          rendered in the Utilization column below. */}
      <View className="w-3 h-3 rounded-full bg-[#0644C7]" />
    </View>

    {/* Web's four-column grid: Bkgs / Tix / Events / Waivers, with the
        signed count captioned under the waiver total. */}
    <View className="flex-row mb-3">
      <StatCell label="Bookings" value={location.bookings} />
      <StatCell label="Tickets" value={location.tickets} />
      <StatCell label="Events" value={location.events} />
      <StatCell
        label="Waivers"
        value={location.waivers}
        sub={`${location.waiversSigned} signed`}
      />
    </View>

    <View className="flex-row mb-3">
      <StatCell label="Revenue" value={formatMoney(location.revenue)} />
      <View className="flex-1">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Utilization
        </Text>
        <View className="h-7 justify-center">
          <UtilizationBar value={location.utilization} />
        </View>
      </View>
    </View>

    <View className="flex-row pt-3 border-t border-gray-100 dark:border-neutral-800">
      <RevenueCell label="Bookings Rev." value={location.bookingRevenue} />
      <RevenueCell label="Tickets Rev." value={location.purchaseRevenue} />
      <RevenueCell label="Events Rev." value={location.eventPurchaseRevenue} />
    </View>
  </View>
);

const Location = () => {
  const insets = useSafeAreaInsets();
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all_time");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  // Location comes from the global workspace store so this tab stays in sync
  // with the header selector and every other module.
  const activeLocation = useActiveLocation();
  const selectedLocation = activeLocation.id;
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // locationStats is computed for every location regardless of location_id, so
  // the location filter is applied client-side; only the timeframe hits the API.
  const { data, loading, error, refetch } = useDashboardMetrics({
    timeframe: dateFilter,
    locationId: "all",
  });
  const {
    totalCount: unreadNotificationsCount,
    refresh: refreshNotifications,
  } = useNotifications("unread");

  // Native pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refreshNotifications()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refreshNotifications]);

  // Flatten locationStats into typed rows once per response.
  const allLocations: LocationRow[] = useMemo(() => {
    if (!data?.locationStats) return [];
    return Object.entries(data.locationStats).map(([id, stats]) => ({
      id: Number(id),
      name: stats.name,
      bookings: Number(stats.bookings ?? 0),
      // Web reads `attractionTickets ?? purchases` for the Tickets figure.
      tickets: Number(stats.attractionTickets ?? stats.purchases ?? 0),
      events: Number(stats.eventPurchases ?? 0),
      waivers: Number(stats.waivers ?? 0),
      waiversSigned: Number(stats.waiversSigned ?? 0),
      revenue: Number(stats.revenue ?? 0),
      utilization: Number(stats.utilization ?? 0),
      bookingRevenue: Number(stats.bookingRevenue ?? 0),
      purchaseRevenue: Number(stats.purchaseRevenue ?? 0),
      eventPurchaseRevenue: Number(stats.eventPurchaseRevenue ?? 0),
    }));
  }, [data]);

  const locationOptions = useMemo(
    () => allLocations.map((loc) => ({ id: loc.id, name: loc.name })),
    [allLocations],
  );

  // Apply the location filter, then derive the two sections from it.
  const filteredLocations = useMemo(
    () =>
      selectedLocation === "all"
        ? allLocations
        : allLocations.filter((loc) => loc.id === selectedLocation),
    [allLocations, selectedLocation],
  );

  // Web sorts both sections by revenue descending, with no tiebreaker — the
  // sort is stable, so equal-revenue locations keep their API order.
  const sortedLocations = useMemo(
    () => [...filteredLocations].sort((a, b) => b.revenue - a.revenue),
    [filteredLocations],
  );

  const topLocations = useMemo(
    () => sortedLocations.slice(0, 3),
    [sortedLocations],
  );

  // Client-side pagination over the sorted list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const paged = useMemo(
    () => sortedLocations.slice((page - 1) * perPage, page * perPage),
    [sortedLocations, page, perPage],
  );

  // Reset to the first page whenever the result set changes / filters move.
  useEffect(() => {
    setPage(1);
  }, [selectedLocation, perPage]);

  const selectedLocationLabel =
    selectedLocation === "all"
      ? "All Locations"
      : (locationOptions.find((loc) => loc.id === selectedLocation)?.name ??
        "All Locations");

  const dateFilterOptions = [
    { label: "All Time", value: "all_time" as DateFilterType, icon: BarChart3 },
    { label: "Today", value: "today" as DateFilterType, icon: Calendar },
    {
      label: "Last 24 Hours",
      value: "last_24h" as DateFilterType,
      icon: Clock,
    },
    {
      label: "Last 7 Days",
      value: "last_7d" as DateFilterType,
      icon: TrendingUp,
    },
    {
      label: "Last 30 Days",
      value: "last_30d" as DateFilterType,
      icon: CalendarDays,
    },
    {
      label: "Custom Range",
      value: "custom" as DateFilterType,
      icon: Calendar,
    },
  ];

  const currentDateLabel =
    dateFilterOptions.find((opt) => opt.value === dateFilter)?.label || "Today";

  const handleSelectLocation = (id: number | "all") => {
    const name =
      id === "all"
        ? "All Locations"
        : (locationOptions.find((loc) => loc.id === id)?.name ??
          "All Locations");
    setActiveLocation({ id, name });
    setShowLocationDropdown(false);
  };

  const handleSelectDate = (value: DateFilterType) => {
    setDateFilter(value);
    setShowDateDropdown(false);
  };

  const hasLocations = filteredLocations.length > 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — shared DashboardHeader (same as Home) */}
      <DashboardHeader unreadCount={unreadNotificationsCount} />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 96,
          paddingTop: 0,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0644C7"
            colors={["#0644C7"]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5 pt-0">
          {/* Welcome Section */}
          <View className="bg-white dark:bg-neutral-900 font-montserrat rounded-2xl p-5 mt-6 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Location Overview
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Multi-location booking performance at a glance
            </Text>
          </View>

          {/* Filters Row */}
          <View className="flex-row gap-3 mb-5">
            <Pressable
              onPress={() => setShowLocationDropdown(true)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <MapPin size={16} color="#0644C7" />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                {selectedLocationLabel}
              </Text>
              <ChevronDown size={12} color="#9CA3AF" />
            </Pressable>

            <Pressable
              onPress={() => setShowDateDropdown(true)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Calendar size={16} color="#0644C7" />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1">
                {currentDateLabel}
              </Text>
              <ChevronDown size={12} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Error State */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* Empty State */}
          {!loading && !error && !hasLocations && (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm border border-gray-100 dark:border-neutral-800">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <MapPin size={28} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No location data
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                There is no location performance data for this selection.
              </Text>
            </View>
          )}

          {!error && (loading || hasLocations) && (
            <>
              {/* Top Performing Locations */}
              <View className="flex-row items-center gap-2 mb-4">
                <TrendingUp size={20} color="#0644C7" />
                <Text className="text-lg font-bold text-gray-900 dark:text-white">
                  Top Performing Locations
                </Text>
              </View>

              {loading ? (
                <TopCardsSkeleton />
              ) : (
                topLocations.map((loc, index) => (
                  <TopLocationCard
                    key={loc.id}
                    rank={index + 1}
                    location={loc}
                  />
                ))
              )}

              {/* All Locations Overview */}
              <View className="flex-row items-center gap-2 mt-6 mb-4">
                <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
                  <MapPin size={18} color="#0644C7" />
                </View>
                <Text
                  numberOfLines={1}
                  className="shrink-0 text-lg font-bold text-gray-900 dark:text-white"
                >
                  All Locations
                </Text>
                <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {filteredLocations.length}
                  </Text>
                </View>
              </View>

              {loading ? (
                <OverviewCardsSkeleton />
              ) : (
                <>
                  {paged.map((loc) => (
                    <OverviewCard key={loc.id} location={loc} />
                  ))}
                  <Pagination
                    page={page}
                    perPage={perPage}
                    total={filteredLocations.length}
                    onPageChange={setPage}
                    onPerPageChange={setPerPage}
                  />
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Location Picker */}
      <BottomSheet
        visible={showLocationDropdown}
        onClose={() => setShowLocationDropdown(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => handleSelectLocation("all")}
            className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
              selectedLocation === "all" ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
          >
            <Text
              className={`text-base font-medium ${
                selectedLocation === "all"
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              All Locations
            </Text>
          </Pressable>

          {locationOptions.map((loc) => {
            const isSelected = selectedLocation === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => handleSelectLocation(loc.id)}
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
                  {loc.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Timeframe Picker */}
      <BottomSheet
        visible={showDateDropdown}
        onClose={() => setShowDateDropdown(false)}
        title="Select Timeframe"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {dateFilterOptions.map((option) => {
            const isSelected = dateFilter === option.value;
            const IconComponent = option.icon;
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelectDate(option.value)}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <IconComponent
                    size={18}
                    color={isSelected ? "#0644C7" : "#6b7280"}
                  />
                  <Text
                    className={`text-base font-medium ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Location;
