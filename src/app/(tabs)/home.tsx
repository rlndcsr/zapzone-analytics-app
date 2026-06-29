import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { MetricCardsSkeleton } from "../../components/ui/skeleton/MetricCardsSkeleton";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { useNotifications } from "../../lib/hooks/useNotifications";
import type {
  BreakdownKey,
  DashboardData,
  DashboardTotals,
} from "../../services/metricsService";

type DateFilterType =
  | "today"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "all_time"
  | "custom";

type MetricDefinition = {
  id: number;
  label: string;
  title: string;
  breakdownKey: BreakdownKey;
  /** Scalar from `metrics` shown as the big number (use the API value, never computed). */
  valueField?: keyof DashboardTotals;
  /** Optional secondary line under the number, e.g. "N confirmed". */
  subtitle?: (metrics: DashboardTotals) => string;
  icon: string;
  iconBg: string;
  color: string;
  /** Only enabled cards pull real data; others stay blank until wired. */
  enabled: boolean;
};

const ICON_MAP: { [key: string]: any } = {
  "group.png": require("../../../assets/zapzone-assests/icon/group.png"),
  "ticket.png": require("../../../assets/zapzone-assests/icon/ticket.png"),
  "shopping-cart.png": require("../../../assets/zapzone-assests/icon/shopping-cart.png"),
  "membership.png": require("../../../assets/zapzone-assests/icon/membership.png"),
  "add-user.png": require("../../../assets/zapzone-assests/icon/add-user.png"),
  "checked.png": require("../../../assets/zapzone-assests/icon/checked.png"),
  "party.png": require("../../../assets/zapzone-assests/icon/party-popper.png"),
  "zapzone.png": require("../../../assets/zapzone-assests/zapzone.png"),
};

const getIcon = (iconName: string) => ICON_MAP[iconName] || null;

const darkenColor = (color: string, percent: number = 30) => {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) - amt;
  const G = ((num >> 8) & 0x00ff) - amt;
  const B = (num & 0x0000ff) - amt;
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
};

const MetricIconBadge = ({ metric }: { metric: MetricDefinition }) => (
  <View className={`${metric.iconBg} p-2.5 rounded-lg`}>
    <Image
      source={getIcon(metric.icon)}
      style={{
        width: 22,
        height: 22,
        tintColor: darkenColor(metric.color, 20),
      }}
      contentFit="contain"
    />
  </View>
);

const MetricCard = ({
  metric,
  data,
  onPress,
}: {
  metric: MetricDefinition;
  data: DashboardData | null;
  onPress: (id: number) => void;
}) => {
  const active = metric.enabled && data != null;
  const value =
    active && metric.valueField
      ? String(data.metrics[metric.valueField] ?? 0)
      : "—";
  const subtitle =
    active && metric.subtitle ? metric.subtitle(data.metrics) : null;
  const pill = active ? data.timeframe.description : metric.label;

  return (
    <Pressable
      onPress={() => onPress(metric.id)}
      className="flex-1 bg-white dark:bg-neutral-900 rounded-xl p-4 m-1"
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {pill}
          </Text>
          <Image
            source={require("../../../assets/zapzone-assests/icon/info.png")}
            style={{ width: 14, height: 14 }}
            contentFit="contain"
          />
        </View>
        <MetricIconBadge metric={metric} />
      </View>
      <Text className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3">
        {metric.title}
      </Text>
      <Text className="text-4xl font-bold text-gray-900 dark:text-white">
        {value}
      </Text>
      {subtitle && (
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
};

const Home = () => {
  const insets = useSafeAreaInsets();
  const [selectedMetric, setSelectedMetric] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all_time");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<number | "all">(
    "all",
  );
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [locationOptions, setLocationOptions] = useState<
    { id: number; name: string }[]
  >([]);

  const slideAnim = useRef(
    new Animated.Value(Dimensions.get("window").height),
  ).current;

  const openModal = (id: number) => {
    setSelectedMetric(id);
    slideAnim.setValue(Dimensions.get("window").height);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: Dimensions.get("window").height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setSelectedMetric(null);
    });
  };

  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch } = useDashboardMetrics({
    timeframe: dateFilter,
    locationId: selectedLocation, // "all" → no location_id param sent
    dateFrom: customStartDate,
    dateTo: customEndDate,
  });
  const {
    totalCount: unreadNotificationsCount,
    refresh: refreshNotifications,
  } = useNotifications("unread");

  // Native pull-to-refresh: reload the whole dashboard through the same loaders
  // as the initial fetch. `refetch` flips the hook's `loading` flag, which swaps
  // the grid for the skeleton, so no stale values show while data is in flight.
  // Both loaders swallow their own errors, so this always settles and clears the
  // indicator even on failure. The native control blocks re-triggering while
  // active, preventing concurrent refreshes.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refreshNotifications()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refreshNotifications]);

  // Build the location filter from the metrics response itself (locationStats),
  // mirroring the web admin — no separate /locations call (that payload is too
  // large for mobile and crashes the app). Only refresh the list from an
  // unfiltered ("all") response so all options stay available after selecting one.
  useEffect(() => {
    if (selectedLocation === "all" && data?.locationStats) {
      setLocationOptions(
        Object.entries(data.locationStats).map(([id, stats]) => ({
          id: Number(id),
          name: stats.name,
        })),
      );
    }
  }, [data, selectedLocation]);

  const selectedLocationLabel =
    selectedLocation === "all"
      ? "All Locations"
      : (locationOptions.find((loc) => loc.id === selectedLocation)?.name ??
        "All Locations");

  const handleSelectLocation = (id: number | "all") => {
    setSelectedLocation(id);
    setShowLocationDropdown(false);
  };

  const handleSelectDate = (value: DateFilterType) => {
    setDateFilter(value);
    setShowDateDropdown(false);
  };

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

  const metricDefinitions: MetricDefinition[] = [
    {
      id: 1,
      label: "Today",
      title: "Packages",
      breakdownKey: "packageBreakdown",
      valueField: "totalBookings",
      subtitle: (metrics) => `${metrics.confirmedBookings} confirmed`,
      icon: "party.png",
      iconBg: "bg-blue-100",
      color: "#5B7EFF",
      enabled: true,
    },
    {
      id: 2,
      label: "Today",
      title: "Party Participants",
      breakdownKey: "participantBreakdown",
      valueField: "totalParticipants",
      subtitle: () => "From package bookings",
      icon: "group.png",
      iconBg: "bg-purple-100",
      color: "#A78BFA",
      enabled: true,
    },
    {
      id: 3,
      label: "Today",
      title: "Attractions Sold",
      breakdownKey: "attractionBreakdown",
      valueField: "totalPurchases",
      subtitle: () => "Tickets sold",
      icon: "ticket.png",
      iconBg: "bg-green-100",
      color: "#10B981",
      enabled: true,
    },
    {
      id: 4,
      label: "Today",
      title: "Events Sold",
      breakdownKey: "eventBreakdown",
      valueField: "totalEventPurchases",
      subtitle: (metrics) => `${metrics.totalEventTickets} tickets`,
      icon: "shopping-cart.png",
      iconBg: "bg-pink-100",
      color: "#EC4899",
      enabled: true,
    },
    {
      id: 5,
      label: "Today",
      title: "Memberships",
      breakdownKey: "membershipBreakdown",
      valueField: "newMemberships",
      subtitle: () => "New this period",
      icon: "membership.png",
      iconBg: "bg-yellow-100",
      color: "#F59E0B",
      enabled: true,
    },
    {
      id: 6,
      label: "Today",
      title: "Unique Customers",
      breakdownKey: "customerBreakdown",
      valueField: "totalCustomers",
      subtitle: (metrics) => `${metrics.newCustomers ?? 0} new`,
      icon: "add-user.png",
      iconBg: "bg-red-100",
      color: "#EF4444",
      enabled: true,
    },
    {
      id: 7,
      label: "Today",
      title: "Confirmed Bookings",
      breakdownKey: "confirmedBreakdown",
      valueField: "confirmedBookings",
      subtitle: () => "Packages + events + attractions",
      icon: "checked.png",
      iconBg: "bg-teal-100",
      color: "#14B8A6",
      enabled: true,
    },
  ];

  const currentMetric = metricDefinitions.find((m) => m.id === selectedMetric);
  const currentBreakdown = currentMetric?.enabled
    ? (data?.breakdowns?.[currentMetric.breakdownKey] ?? [])
    : [];
  const isBreakdownEmpty = currentBreakdown.length === 0;

  return (
    <View className="flex-1 bg-background dark:bg-black">
      {/* Blue Header Bar */}
      <View className="bg-[#0644C7] h-[37px] w-full mb-2" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        // Clear the floating tab bar so the last cards aren't trapped behind it.
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
            <Text className="text-2xl font-bold text-gray-900 dark:text-white ">
              Dashboard / <Text className="font-medium">Overview</Text>
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Real-time venue performance overview.
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

          {/* Filter Section */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-1 mr-2">
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

            <Pressable className="bg-white dark:bg-neutral-900 p-3 rounded-lg border border-gray-200 dark:border-neutral-700">
              <Image
                source={require("../../../assets/zapzone-assests/icon/scanner.png")}
                style={{ width: 20, height: 20 }}
                contentFit="contain"
              />
            </Pressable>
          </View>

          {/* Loading State — animated skeleton matching the cards */}
          {loading && <MetricCardsSkeleton />}

          {/* Error State */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <Text className="text-red-700 font-semibold">Error</Text>
              <Text className="text-red-600 text-sm">{error}</Text>
            </View>
          )}

          {/* Metrics Grid */}
          {!loading && !error && (
            <View className="flex-row flex-wrap">
              {metricDefinitions.map((metric) => (
                <View key={metric.id} className="w-1/2">
                  <MetricCard metric={metric} data={data} onPress={openModal} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Breakdown Modal - Bottom Sheet Style */}
      <Modal
        visible={selectedMetric !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View className="absolute inset-0 bg-black/50" />

        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={closeModal} />

          <Animated.View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl p-6 w-full"
            style={{ transform: [{ translateY: slideAnim }] }}
          >
            {currentMetric && (
              <>
                {/* Modal Header */}
                <View className="flex-row items-center justify-between mb-6">
                  <View className="flex-row items-center gap-3">
                    <MetricIconBadge metric={currentMetric} />
                    <Text className="text-lg font-bold text-gray-900 dark:text-white">
                      {currentMetric.title} Breakdown
                    </Text>
                  </View>
                  <Pressable onPress={closeModal} className="p-1">
                    <Text className="text-xl text-gray-500 dark:text-gray-400">
                      ✕
                    </Text>
                  </Pressable>
                </View>

                {/* Check if Breakdown is Empty */}
                {isBreakdownEmpty ? (
                  <View className="justify-center items-center py-12">
                    <Text className="text-gray-500 dark:text-gray-400 text-base font-medium">
                      No Breakdown available
                    </Text>
                  </View>
                ) : (
                  <>
                    {/* Breakdown Items */}
                    <View className="space-y-2 mb-4">
                      {currentBreakdown.map((item, index) => (
                        <View
                          key={index}
                          className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800"
                        >
                          <Text className="text-sm text-gray-700 dark:text-gray-200">
                            {item.label}
                          </Text>
                          <Text className="text-xs text-gray-500 dark:text-gray-400">
                            {item.count} ({item.percentage}%)
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Total */}
                    <View className="flex-row items-center justify-between pt-4 border-t border-gray-200 dark:border-neutral-700">
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        Total
                      </Text>
                      <Text className="text-lg font-bold text-gray-900 dark:text-white">
                        {currentMetric.enabled && currentMetric.valueField
                          ? (data?.metrics[currentMetric.valueField] ?? 0)
                          : 0}
                      </Text>
                    </View>
                  </>
                )}
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Location Picker */}
      <BottomSheet
        visible={showLocationDropdown}
        onClose={() => setShowLocationDropdown(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6">
          {/* All Locations — only the label is hardcoded */}
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

      {/* Timeframe Picker */}
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

export default Home;
