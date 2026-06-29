import { Image } from "expo-image";
import { router } from "expo-router";
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

const UtilizationBar = ({ value }: { value: number }) => (
  <View className="flex-row items-center gap-2">
    <View className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-neutral-800 overflow-hidden">
      <View
        className="h-full rounded-full bg-[#0644C7]"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </View>
    <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
      {value}%
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
  <View className="border border-blue-200 dark:border-blue-900 bg-blue-50/40 rounded-2xl p-4 mb-3">
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center gap-3 flex-1 mr-2">
        <View className="w-9 h-9 rounded-full bg-[#0644C7] items-center justify-center">
          <Text className="text-white font-bold text-sm">{rank}</Text>
        </View>
        <View className="flex-1">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {location.name}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {location.bookings} bookings • {location.tickets} tickets •{" "}
            {location.events} events • {location.guests} guests
          </Text>
        </View>
      </View>
      <Text className="text-lg font-bold text-[#0644C7]">
        {formatMoney(location.revenue)}
      </Text>
    </View>
    <UtilizationBar value={location.utilization} />
  </View>
);

const OverviewCard = ({ location }: { location: LocationRow }) => (
  <View className="border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3">
    <View className="flex-row items-center justify-between mb-4">
      <Text
        className="text-base font-semibold text-gray-900 dark:text-white flex-1 mr-2"
        numberOfLines={1}
      >
        {location.name}
      </Text>
      <View className="w-2.5 h-2.5 rounded-full bg-[#0644C7]" />
    </View>

    <View className="flex-row mb-4">
      <View className="flex-1">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Bookings
        </Text>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          {location.bookings}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Tickets
        </Text>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          {location.tickets}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Events
        </Text>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">
          {location.events}
        </Text>
      </View>
    </View>

    <View className="flex-row items-end justify-between">
      <View>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Revenue
        </Text>
        <Text className="text-lg font-bold text-[#0644C7]">
          {formatMoney(location.revenue)}
        </Text>
      </View>
      <View className="flex-1 ml-6">
        <Text className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Utilization
        </Text>
        <UtilizationBar value={location.utilization} />
      </View>
    </View>
  </View>
);

const Location = () => {
  const insets = useSafeAreaInsets();
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all_time");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<number | "all">(
    "all",
  );
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
    { label: "All Time", value: "all_time" as DateFilterType },
    { label: "Today", value: "today" as DateFilterType },
    { label: "Last 24 Hours", value: "last_24h" as DateFilterType },
    { label: "Last 7 Days", value: "last_7d" as DateFilterType },
    { label: "Last 30 Days", value: "last_30d" as DateFilterType },
    { label: "Custom Range", value: "custom" as DateFilterType },
  ];

  const currentDateLabel =
    dateFilterOptions.find((opt) => opt.value === dateFilter)?.label || "Today";

  const handleSelectLocation = (id: number | "all") => {
    setSelectedLocation(id);
    setShowLocationDropdown(false);
  };

  const handleSelectDate = (value: DateFilterType) => {
    setDateFilter(value);
    setShowDateDropdown(false);
  };

  const hasLocations = filteredLocations.length > 0;

  return (
    <View className="flex-1 bg-background dark:bg-black">
      {/* Blue Header Bar */}
      <View className="bg-[#0644C7] h-[37px] w-full mb-2" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0644C7"
            colors={["#0644C7"]}
          />
        }
      >
        <View className="px-5">
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <Pressable className="mt-2">
              <Image
                source={require("../../../assets/zapzone-assests/Zap-Zone.png")}
                style={{ width: 60, height: 24 }}
                contentFit="contain"
              />
            </Pressable>

            <View className="flex-row items-center gap-3">
              {unreadNotificationsCount > 0 && (
                <Pressable
                  onPress={() => router.push("/notification/notification")}
                  className="bg-gray-200 dark:bg-neutral-800 rounded-full px-4 py-2 flex-row items-center gap-2"
                >
                  <Image
                    source={require("../../../assets/zapzone-assests/icon/notification-bell.png")}
                    style={{ width: 15, height: 15 }}
                    contentFit="contain"
                  />
                  <Text className="text-gray-800 dark:text-gray-100 text-md ">
                    {unreadNotificationsCount > 99
                      ? "99"
                      : unreadNotificationsCount}
                  </Text>
                </Pressable>
              )}

              <Pressable onPress={() => router.push("/settings/settings")}>
                <Image
                  source={require("../../../assets/zapzone-assests/icon/settings.png")}
                  style={{ width: 24, height: 24 }}
                  contentFit="contain"
                />
              </Pressable>
            </View>
          </View>

          {/* Title Section */}
          <View className="mb-6">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              Locations
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Multi-location booking overview and management
            </Text>
          </View>

          {/* Location Filter */}
          <Pressable
            onPress={() => setShowLocationDropdown(true)}
            className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-lg border border-gray-200 dark:border-neutral-700 mb-3"
          >
            <Image
              source={require("../../../assets/zapzone-assests/icon/pin.png")}
              style={{ width: 18, height: 18 }}
              contentFit="contain"
            />
            <Text
              className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1"
              numberOfLines={1}
            >
              {selectedLocationLabel}
            </Text>
            <Image
              source={require("../../../assets/zapzone-assests/icon/arrow-down.png")}
              style={{ width: 8, height: 12 }}
              contentFit="contain"
            />
          </Pressable>

          {/* Timeframe Filter */}
          <View className="mb-6">
            <Pressable
              onPress={() => setShowDateDropdown(true)}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-lg border border-gray-200 dark:border-neutral-700"
            >
              <Image
                source={require("../../../assets/zapzone-assests/icon/calendar.png")}
                style={{ width: 18, height: 18 }}
                contentFit="contain"
              />
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
                {currentDateLabel}
              </Text>
              <Image
                source={require("../../../assets/zapzone-assests/icon/arrow-down.png")}
                style={{ width: 8, height: 12 }}
                contentFit="contain"
              />
            </Pressable>
          </View>

          {/* Error State */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <Text className="text-red-700 font-semibold">Error</Text>
              <Text className="text-red-600 text-sm">{error}</Text>
            </View>
          )}

          {/* Empty State (e.g. role without company-wide location stats) */}
          {!loading && !error && !hasLocations && (
            <View className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl p-8 items-center">
              <Image
                source={require("../../../assets/zapzone-assests/icon/pin.png")}
                style={{ width: 28, height: 28 }}
                contentFit="contain"
              />
              <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                No location data
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-1">
                There is no location performance data for this selection.
              </Text>
            </View>
          )}

          {!error && (loading || hasLocations) && (
            <>
              {/* Location Performance header */}
              <View className="flex-row items-center gap-2 mb-4">
                <View className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
                  <Image
                    source={require("../../../assets/zapzone-assests/icon/pin.png")}
                    style={{ width: 18, height: 18, tintColor: "#0644C7" }}
                    contentFit="contain"
                  />
                </View>
                <Text className="text-lg font-bold text-gray-900 dark:text-white">
                  Location Performance
                </Text>
              </View>

              {/* Top Performing Locations */}
              <Text className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Top Performing Locations
              </Text>
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
              <Text className="text-base font-semibold text-gray-800 dark:text-gray-100 mt-4 mb-3">
                All Locations Overview
              </Text>
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
                      className="self-center bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg px-5 py-2.5 mt-1"
                    >
                      <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
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

      {/* Location Picker — same pattern as Home */}
      <BottomSheet
        visible={showLocationDropdown}
        onClose={() => setShowLocationDropdown(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6">
          <Pressable
            onPress={() => handleSelectLocation("all")}
            className={`flex-row items-center justify-between px-3 py-3 rounded-lg ${
              selectedLocation === "all" ? "bg-blue-50 dark:bg-blue-900/30" : ""
            }`}
          >
            <Text
              className={`text-base font-medium ${
                selectedLocation === "all"
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-gray-800 dark:text-gray-100"
              }`}
            >
              All Locations
            </Text>
            {selectedLocation === "all" && (
              <Image
                source={require("../../../assets/zapzone-assests/icon/checked.png")}
                style={{ width: 18, height: 18 }}
                contentFit="contain"
              />
            )}
          </Pressable>

          {locationOptions.map((loc) => {
            const isSelected = selectedLocation === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => handleSelectLocation(loc.id)}
                className={`flex-row items-center justify-between px-3 py-3 rounded-lg ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-gray-800 dark:text-gray-100"
                  }`}
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
                {isSelected && (
                  <Image
                    source={require("../../../assets/zapzone-assests/icon/checked.png")}
                    style={{ width: 18, height: 18 }}
                    contentFit="contain"
                  />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Timeframe Picker — same pattern as Home */}
      <BottomSheet
        visible={showDateDropdown}
        onClose={() => setShowDateDropdown(false)}
        title="Select Timeframe"
      >
        <ScrollView className="px-4 pb-6">
          {dateFilterOptions.map((option) => {
            const isSelected = dateFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelectDate(option.value)}
                className={`flex-row items-center justify-between px-3 py-3 rounded-lg ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-700 dark:text-blue-300"
                      : "text-gray-800 dark:text-gray-100"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <Image
                    source={require("../../../assets/zapzone-assests/icon/checked.png")}
                    style={{ width: 18, height: 18 }}
                    contentFit="contain"
                  />
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
