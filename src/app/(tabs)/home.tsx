import { Image } from "expo-image";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  composeSubtitle,
  formatMetricValue,
  getCardSubtitleFn,
  getDashboardConfig,
  METRIC_CARDS,
  type MetricCardDef,
} from "../../lib/dashboard/dashboardConfig";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { useNotifications } from "../../lib/hooks/useNotifications";
import { getCurrentUser } from "../../lib/session";
import type { DashboardData } from "../../services/metricsService";

type DateFilterType =
  | "today"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "all_time"
  | "custom";

const ICON_MAP: { [key: string]: any } = {
  "group.png": require("../../../assets/zapzone-assests/icon/group.png"),
  "ticket.png": require("../../../assets/zapzone-assests/icon/ticket.png"),
  "shopping-cart.png": require("../../../assets/zapzone-assests/icon/shopping-cart.png"),
  "membership.png": require("../../../assets/zapzone-assests/icon/membership.png"),
  "add-user.png": require("../../../assets/zapzone-assests/icon/add-user.png"),
  "checked.png": require("../../../assets/zapzone-assests/icon/checked.png"),
  "party.png": require("../../../assets/zapzone-assests/icon/party-popper.png"),
  "box.png": require("../../../assets/zapzone-assests/icon/box.png"),
  "calendar.png": require("../../../assets/zapzone-assests/icon/calendar.png"),
  "info.png": require("../../../assets/zapzone-assests/icon/info.png"),
  "zapzone.png": require("../../../assets/zapzone-assests/zapzone.png"),
};

const getIcon = (iconName: string) => ICON_MAP[iconName] || null;

const MetricIconBadge = ({ metric }: { metric: MetricCardDef }) => (
  <View
    className="w-10 h-10 rounded-xl items-center justify-center"
    style={{ backgroundColor: metric.gradient[0] + "20" }}
  >
    <Image
      source={getIcon(metric.icon)}
      style={{
        width: 20,
        height: 20,
        tintColor: metric.color,
      }}
      contentFit="contain"
    />
  </View>
);

const MetricCard = ({
  metric,
  data,
  interactive,
  subtitleFn,
  timeframeLabel,
  onPress,
}: {
  metric: MetricCardDef;
  data: DashboardData | null;
  interactive: boolean;
  /** Role-resolved builder for the card's metric part (timeframe appended here). */
  subtitleFn?: (metrics: DashboardData["metrics"]) => string;
  /** Backend timeframe label, e.g. "All Time" — the sub-line's trailing context. */
  timeframeLabel: string;
  onPress: (key: string) => void;
}) => {
  // A field that's absent from the payload (undefined) renders a placeholder,
  // so cards for not-yet-exposed backend fields degrade gracefully — and light
  // up automatically once the field appears. A real 0 still shows as "0".
  const raw = data ? data.metrics[metric.valueField] : undefined;
  const hasValue = raw != null && !Number.isNaN(raw);
  const value = hasValue ? formatMetricValue(raw, metric.format) : "—";
  // Contextual sub-line: "<metric part> • <timeframe>", matching the web.
  const subtitle = hasValue
    ? composeSubtitle(subtitleFn ? subtitleFn(data!.metrics) : "", timeframeLabel)
    : null;

  return (
    <Pressable
      onPress={interactive ? () => onPress(metric.key) : undefined}
      disabled={!interactive}
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-5 m-1.5 shadow-sm"
      style={{
        shadowColor: "#424242",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-1 mr-2">
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {metric.title}
          </Text>
        </View>
        <MetricIconBadge metric={metric} />
      </View>

      <Text className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
        {value}
      </Text>
      {subtitle && (
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
};

const Home = () => {
  const insets = useSafeAreaInsets();

  // Role drives which cards, endpoint, and controls this dashboard shows. Read
  // once from the in-memory session (set at login / restored on launch).
  const dashboardConfig = useMemo(
    () => getDashboardConfig(getCurrentUser()?.role),
    [],
  );
  const visibleCards = useMemo<MetricCardDef[]>(
    () => dashboardConfig.cards.map((key) => METRIC_CARDS[key]),
    [dashboardConfig],
  );

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
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

  const openModal = (key: string) => {
    setSelectedMetric(key);
    slideAnim.setValue(Dimensions.get("window").height);
    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 25,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  };

  const closeModal = () => {
    Animated.spring(slideAnim, {
      toValue: Dimensions.get("window").height,
      damping: 25,
      mass: 0.8,
      useNativeDriver: true,
    }).start(() => {
      setSelectedMetric(null);
    });
  };

  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refetch } = useDashboardMetrics({
    timeframe: dateFilter,
    locationId: selectedLocation,
    dateFrom: customStartDate,
    dateTo: customEndDate,
  });
  const {
    totalCount: unreadNotificationsCount,
    refresh: refreshNotifications,
  } = useNotifications("unread");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refreshNotifications()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refreshNotifications]);

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
    { label: "Last 24 Hours", value: "last_24h" as DateFilterType },
    { label: "Last 7 Days", value: "last_7d" as DateFilterType },
    { label: "Last 30 Days", value: "last_30d" as DateFilterType },
    { label: "Custom Range", value: "custom" as DateFilterType },
  ];

  const currentDateLabel =
    dateFilterOptions.find((opt) => opt.value === dateFilter)?.label ||
    "All Time";

  // Card sub-lines end with the timeframe. Prefer the backend-supplied label
  // (data.timeframe.description, exactly as the web uses) so it always reflects
  // the resolved window; fall back to the selected filter label before data.
  const timeframeLabel = data?.timeframe?.description ?? currentDateLabel;

  const currentMetric: MetricCardDef | undefined = selectedMetric
    ? METRIC_CARDS[selectedMetric as keyof typeof METRIC_CARDS]
    : undefined;
  const currentBreakdown =
    currentMetric?.breakdownKey && dashboardConfig.showBreakdowns
      ? (data?.breakdowns?.[currentMetric.breakdownKey] ?? [])
      : [];
  const isBreakdownEmpty = currentBreakdown.length === 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Gradient Header - Fixed position */}
      <View className="bg-[#0644C7] pt-12 pb-4 px-5 w-full relative overflow-hidden z-10">
        <View className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <View className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
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
                className="bg-white/20 backdrop-blur-sm rounded-full px-3.5 py-1.5 flex-row items-center gap-2"
              >
                <Image
                  source={require("../../../assets/zapzone-assests/icon/notification-bell.png")}
                  style={{ width: 16, height: 16 }}
                  contentFit="contain"
                  tintColor="#FFFFFF"
                />
                <Text className="text-white text-xs font-semibold">
                  {unreadNotificationsCount > 99
                    ? "99+"
                    : unreadNotificationsCount}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push("/settings/settings")}
              className="bg-white/20 backdrop-blur-sm p-2 rounded-full"
            >
              <Image
                source={require("../../../assets/zapzone-assests/icon/settings.png")}
                style={{ width: 20, height: 20 }}
                contentFit="contain"
                tintColor="#FFFFFF"
              />
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
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Welcome back!
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Here&apos;s what&apos;s happening at your venue
            </Text>
          </View>

          {/* Filters Row */}
          <View className="flex-row gap-3 mb-5">
            {/* Multi-location picker — company-wide roles only. Single-location
                roles (manager/attendant) are scoped to their own location. */}
            {dashboardConfig.showLocationSelector && (
              <Pressable
                onPress={() => setShowLocationDropdown(true)}
                className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
              >
                <Image
                  source={require("../../../assets/zapzone-assests/icon/pin.png")}
                  style={{ width: 16, height: 16 }}
                  contentFit="contain"
                  tintColor="#0644C7"
                />
                <Text
                  className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                  numberOfLines={1}
                >
                  {selectedLocationLabel}
                </Text>
                <Image
                  source={require("../../../assets/zapzone-assests/icon/arrow-down.png")}
                  style={{ width: 10, height: 10 }}
                  contentFit="contain"
                  tintColor="#9CA3AF"
                />
              </Pressable>
            )}

            <Pressable
              onPress={() => setShowDateDropdown(true)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Image
                source={require("../../../assets/zapzone-assests/icon/calendar.png")}
                style={{ width: 16, height: 16 }}
                contentFit="contain"
                tintColor="#0644C7"
              />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1">
                {currentDateLabel}
              </Text>
              <Image
                source={require("../../../assets/zapzone-assests/icon/arrow-down.png")}
                style={{ width: 10, height: 10 }}
                contentFit="contain"
                tintColor="#9CA3AF"
              />
            </Pressable>

            <Pressable className="bg-white dark:bg-neutral-900 p-3.5 rounded-xl border border-gray-100 dark:border-neutral-800">
              <Image
                source={require("../../../assets/zapzone-assests/icon/scanner.png")}
                style={{ width: 18, height: 18 }}
                contentFit="contain"
                tintColor="#0644C7"
              />
            </Pressable>
          </View>

          {/* Loading State */}
          {loading && <MetricCardsSkeleton count={visibleCards.length} />}

          {/* Error State */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* Metrics Grid — cards come from the role's dashboard config. */}
          {!loading && !error && (
            <View className="flex-row flex-wrap -mx-1.5">
              {visibleCards.map((metric) => (
                <View key={metric.key} className="w-1/2">
                  <MetricCard
                    metric={metric}
                    data={data}
                    interactive={
                      dashboardConfig.showBreakdowns && !!metric.breakdownKey
                    }
                    subtitleFn={getCardSubtitleFn(dashboardConfig, metric)}
                    timeframeLabel={timeframeLabel}
                    onPress={openModal}
                  />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Breakdown Modal */}
      <Modal
        visible={selectedMetric !== null}
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View className="absolute inset-0 bg-black/25" />

        <View className="flex-1 justify-end">
          <Pressable className="flex-1" onPress={closeModal} />

          <Animated.View
            className="bg-white dark:bg-neutral-900 rounded-t-3xl px-6 pt-6 w-full"
            style={{
              transform: [{ translateY: slideAnim }],
              paddingBottom: insets.bottom + 32,
            }}
          >
            {currentMetric && (
              <>
                {/* Modal Header */}
                <View className="flex-row items-center justify-between mb-6">
                  <View className="flex-row items-center gap-3">
                    <View
                      className="w-12 h-12 rounded-2xl items-center justify-center"
                      style={{
                        backgroundColor: currentMetric.gradient[0] + "20",
                      }}
                    >
                      <Image
                        source={getIcon(currentMetric.icon)}
                        style={{
                          width: 24,
                          height: 24,
                          tintColor: currentMetric.color,
                        }}
                        contentFit="contain"
                      />
                    </View>
                    <View>
                      <Text className="text-sm text-gray-500 dark:text-gray-400">
                        {currentMetric.label}
                      </Text>
                      <Text className="text-lg font-bold text-gray-900 dark:text-white">
                        {currentMetric.title}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={closeModal}
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center"
                  >
                    <Text className="text-gray-500 dark:text-gray-400 text-lg">
                      ✕
                    </Text>
                  </Pressable>
                </View>

                {isBreakdownEmpty ? (
                  <View className="justify-center items-center py-16">
                    <Text className="text-gray-400 dark:text-gray-500 text-base font-medium">
                      No data available
                    </Text>
                  </View>
                ) : (
                  <>
                    <View className="space-y-1 mb-6">
                      {currentBreakdown.map((item, index) => (
                        <View
                          key={index}
                          className="flex-row items-center justify-between py-3 px-2 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-800"
                        >
                          <Text className="text-sm text-gray-700 dark:text-gray-200">
                            {item.label}
                          </Text>
                          <View className="flex-row items-center gap-3">
                            <Text className="text-xs text-gray-400 dark:text-gray-500">
                              {item.percentage}%
                            </Text>
                            <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                              {item.count}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
                      <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Total
                      </Text>
                      <Text className="text-xl font-bold text-gray-900 dark:text-white">
                        {formatMetricValue(
                          data?.metrics[currentMetric.valueField] ?? 0,
                          currentMetric.format,
                        )}
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
                <Image
                  source={require("../../../assets/zapzone-assests/icon/checked.png")}
                  style={{ width: 14, height: 14, tintColor: "#FFFFFF" }}
                  contentFit="contain"
                />
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
                    <Image
                      source={require("../../../assets/zapzone-assests/icon/checked.png")}
                      style={{ width: 14, height: 14, tintColor: "#FFFFFF" }}
                      contentFit="contain"
                    />
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
            return (
              <Pressable
                key={option.value}
                onPress={() => handleSelectDate(option.value)}
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
                    <Image
                      source={require("../../../assets/zapzone-assests/icon/checked.png")}
                      style={{ width: 14, height: 14, tintColor: "#FFFFFF" }}
                      contentFit="contain"
                    />
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

export default Home;
