import { Image } from "expo-image";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../components/ui/BottomSheet";
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
import {
  MapPin,
  ChevronDown,
  Calendar,
  CheckCircle,
  Bell,
  Settings,
  TrendingUp,
  Users,
  Ticket,
  CalendarDays,
  Clock,
  BarChart3,
} from "lucide-react-native";

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
  guests: number;
  revenue: number;
  utilization: number;
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// How many overview cards to show before "Show All".
const OVERVIEW_PREVIEW = 4;

const UtilizationBar = ({ value }: { value: number }) => {
  // Ensure value is between 0 and 100
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{
            width: `${clampedValue}%`,
            backgroundColor:
              clampedValue > 70
                ? "#0644C7"
                : clampedValue > 40
                  ? "#F59E0B"
                  : "#EF4444",
          }}
        />
      </View>
      <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300 min-w-[32px] text-right">
        {clampedValue}%
      </Text>
    </View>
  );
};

const TopLocationCard = ({
  rank,
  location,
}: {
  rank: number;
  location: LocationRow;
}) => {
  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `${rank}`;
    }
  };

  return (
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
        <View className="flex-row items-center gap-3 flex-1 mr-2">
          <View className="w-10 h-10 rounded-full bg-[#0644C7] items-center justify-center shadow-sm">
            <Text className="text-white font-bold text-sm">
              {getRankEmoji(rank)}
            </Text>
          </View>
          <View className="flex-1">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {location.name}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <View className="flex-row items-center gap-1">
                <Ticket size={10} color="#3B82F6" />
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {location.bookings} bookings
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <CalendarDays size={10} color="#8B5CF6" />
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {location.tickets} tickets
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View className="bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg">
          <Text className="text-sm font-bold text-[#0644C7]">
            {formatMoney(location.revenue)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-4">
        <View className="flex-1">
          <UtilizationBar value={location.utilization} />
        </View>
        <View className="flex-row items-center gap-2">
          <Users size={12} color="#22C55E" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {location.guests} guests
          </Text>
        </View>
      </View>
    </View>
  );
};

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
    <View className="flex-row items-center justify-between mb-4">
      <View className="flex-row items-center gap-2 flex-1">
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
      <View className="bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full">
        <Text className="text-xs font-medium text-green-600 dark:text-green-400">
          Active
        </Text>
      </View>
    </View>

    <View className="flex-row mb-4">
      <View className="flex-1">
        <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
          Bookings
        </Text>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          {location.bookings}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
          Tickets
        </Text>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          {location.tickets}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
          Events
        </Text>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          {location.events}
        </Text>
      </View>
    </View>

    <View className="flex-row items-end justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
      <View>
        <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
          Revenue
        </Text>
        <Text className="text-lg font-bold text-[#0644C7]">
          {formatMoney(location.revenue)}
        </Text>
      </View>
      <View className="flex-1 ml-4">
        <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">
          Utilization
        </Text>
        <UtilizationBar value={location.utilization} />
      </View>
    </View>
  </View>
);

const Location = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all_time");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  // Location comes from the global workspace store so this tab stays in sync
  // with the header selector and every other module.
  const activeLocation = useActiveLocation();
  const selectedLocation = activeLocation.id;
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showAll, setShowAll] = useState(false);

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
      tickets: Number(stats.purchases ?? 0),
      events: Number(stats.eventPurchases ?? 0),
      guests: Number(stats.participants ?? 0),
      revenue: Number(stats.revenue ?? 0),
      utilization: Number(stats.utilization ?? 0),
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

  const topLocations = useMemo(
    () =>
      [...filteredLocations]
        .sort(
          (a, b) =>
            b.revenue - a.revenue ||
            b.guests - a.guests ||
            b.bookings - a.bookings,
        )
        .slice(0, 3),
    [filteredLocations],
  );

  const overviewLocations = showAll
    ? filteredLocations
    : filteredLocations.slice(0, OVERVIEW_PREVIEW);

  const selectedLocationLabel =
    selectedLocation === "all"
      ? "All Locations"
      : (locationOptions.find((loc) => loc.id === selectedLocation)?.name ??
        "All Locations");

  const dateFilterOptions = [
    { label: "All Time", value: "all_time" as DateFilterType, icon: BarChart3 },
    { label: "Today", value: "today" as DateFilterType, icon: Calendar },
    { label: "Last 24 Hours", value: "last_24h" as DateFilterType, icon: Clock },
    { label: "Last 7 Days", value: "last_7d" as DateFilterType, icon: TrendingUp },
    { label: "Last 30 Days", value: "last_30d" as DateFilterType, icon: CalendarDays },
    { label: "Custom Range", value: "custom" as DateFilterType, icon: Calendar },
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
      {/* Header - Same as Home */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable>
            <Image
              source={require("../../../assets/zapzone-assests/Zap-Zone.png")}
              style={{ width: 70, height: 28 }}
              contentFit="contain"
            />
          </Pressable>
          <View className="flex-row items-center gap-3">
            {unreadNotificationsCount > 0 && (
              <Pressable
                onPress={() => router.push("/notification/notification")}
                className="bg-gray-100 dark:bg-neutral-800 rounded-full px-3.5 py-1.5 flex-row items-center gap-2"
              >
                <Bell size={16} color={headerIcon} />
                <Text className="text-gray-900 dark:text-white text-xs font-semibold">
                  {unreadNotificationsCount > 99
                    ? "99+"
                    : unreadNotificationsCount}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push("/settings/settings")}
              className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            >
              <Settings size={20} color={headerIcon} />
            </Pressable>
          </View>
        </View>
      </View>

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
                  Top Performers
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
                <Text className="text-lg font-bold text-gray-900 dark:text-white">
                  All Locations
                </Text>
                <View className="bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {filteredLocations.length}
                  </Text>
                </View>
              </View>

              {loading ? (
                <OverviewCardsSkeleton />
              ) : (
                <>
                  {overviewLocations.map((loc) => (
                    <OverviewCard key={loc.id} location={loc} />
                  ))}

                  {/* Show All / Show Less toggle */}
                  {filteredLocations.length > OVERVIEW_PREVIEW && (
                    <Pressable
                      onPress={() => setShowAll((prev) => !prev)}
                      className="self-center bg-white dark:bg-neutral-900 px-6 py-3 rounded-xl border border-gray-200 dark:border-neutral-800 mt-2 shadow-sm"
                    >
                      <Text className="text-sm font-semibold text-[#0644C7]">
                        {showAll
                          ? "Show Less"
                          : `Show All (${filteredLocations.length})`}
                      </Text>
                    </Pressable>
                  )}
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
            {selectedLocation === "all" && (
              <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                <CheckCircle size={14} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            )}
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
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <CheckCircle size={14} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                )}
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
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <CheckCircle size={14} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Location;