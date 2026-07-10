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
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DashboardHeader } from "../../components/ui/DashboardHeader";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import { MetricCardsSkeleton } from "../../components/ui/skeleton/MetricCardsSkeleton";
import {
  composeSubtitle,
  formatMetricValue,
  getCardSubtitleFn,
  getDashboardConfig,
  METRIC_CARDS,
  type MetricCardDef,
} from "../../lib/dashboard/dashboardConfig";
import {
  setTimeframeSelection,
  useTimeframeSelection,
} from "../../lib/dashboard/timeframeStore";
import { useDashboardMetrics } from "../../lib/hooks/useDashboardMetrics";
import { useNotifications } from "../../lib/hooks/useNotifications";
import { getCurrentUser } from "../../lib/session";
import type {
  DashboardData,
  RecentEventPurchase,
} from "../../services/metricsService";
import {
  Users,
  MoreVertical,
  Ticket,
  ShoppingCart,
  CreditCard,
  UserPlus,
  CheckCircle,
  PartyPopper,
  Package,
  Calendar,
  Info,
  MapPin,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Scan,
  X,
  Zap,
  Home as HomeIcon,
  BarChart3,
  Clock,
  TrendingUp,
  DollarSign,
  User,
  Settings,
  HelpCircle,
  RefreshCw,
  Mail,
  Phone,
} from "lucide-react-native";

type DateFilterType =
  | "today"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "all_time"
  | "custom";

const ICON_MAP: { [key: string]: any } = {
  "group.png": Users,
  "ticket.png": Ticket,
  "shopping-cart.png": ShoppingCart,
  "membership.png": CreditCard,
  "add-user.png": UserPlus,
  "checked.png": CheckCircle,
  "party.png": PartyPopper,
  "box.png": Package,
  "calendar.png": Calendar,
  "info.png": Info,
  "zapzone.png": Zap,
  "pin.png": MapPin,
  "arrow-down.png": ChevronDown,
  "scanner.png": Scan,
};

const getIcon = (iconName: string) => ICON_MAP[iconName] || null;

const MetricIconBadge = ({ metric }: { metric: MetricCardDef }) => {
  const IconComponent = getIcon(metric.icon);
  return (
    <View
      className="w-10 h-10 rounded-xl items-center justify-center"
      style={{ backgroundColor: metric.gradient[0] + "20" }}
    >
      {IconComponent && (
        <IconComponent size={20} color={metric.color} strokeWidth={1.5} />
      )}
    </View>
  );
};

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
  subtitleFn?: (metrics: DashboardData["metrics"]) => string;
  timeframeLabel: string;
  onPress: (key: string) => void;
}) => {
  const raw = data ? data.metrics[metric.valueField] : undefined;
  const hasValue = raw != null && !Number.isNaN(raw);
  const value = hasValue ? formatMetricValue(raw, metric.format) : "—";
  const subtitle = hasValue
    ? composeSubtitle(
        subtitleFn ? subtitleFn(data!.metrics) : "",
        timeframeLabel,
      )
    : null;

  return (
    <Pressable
      onPress={interactive ? () => onPress(metric.key) : undefined}
      disabled={!interactive}
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-5 m-1.5 shadow-sm border border-gray-100 dark:border-neutral-800"
      style={{
        shadowColor: "#424242",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
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

const formatMoney = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return `$${(Number.isNaN(n) ? 0 : n).toFixed(2)}`;
};

const formatPurchaseDate = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (value: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const EventPurchaseRow = ({
  row,
  isLast,
}: {
  row: RecentEventPurchase;
  isLast: boolean;
}) => (
  <View
    className={`flex-row items-center py-3.5 px-2 ${
      isLast ? "" : "border-b border-gray-50 dark:border-neutral-800/50"
    }`}
    
  >
    <View className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 items-center justify-center mr-3">
      <Ticket size={18} color="#0644C7" strokeWidth={1.75} />
    </View>

    <View className="flex-1 mr-3">
      <View className="flex-row items-center gap-2">
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {row.customer_name?.trim() || "Guest"}
        </Text>
        <View className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          #{row.id != null ? String(row.id).slice(0, 8) : "—"}
        </Text>
      </View>
      <Text
        className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
        numberOfLines={1}
      >
        {row.event_name?.trim() || "—"}
      </Text>
      <View className="flex-row items-center gap-3 mt-1">
        <View className="flex-row items-center gap-1">
          <Calendar size={11} color="#9CA3AF" />
          <Text className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatPurchaseDate(row.purchase_date ?? row.created_at)}
          </Text>
        </View>
        <View className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        <View className="flex-row items-center gap-1">
          <Clock size={11} color="#9CA3AF" />
          <Text className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatTime(row.purchase_date ?? row.created_at)}
          </Text>
        </View>
        <View className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        <Text className="text-[10px] text-gray-400 dark:text-gray-500">
          Qty {row.quantity}
        </Text>
      </View>
    </View>

    <View className="items-end">
      <Text className="text-sm font-bold text-gray-900 dark:text-white">
        {formatMoney(row.total_amount)}
      </Text>
      <Text className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 mb-1.5">
        Paid {formatMoney(row.amount_paid)}
      </Text>
      <StatusBadge status={row.status} palette="event" />
    </View>
  </View>
);

const RecentEventPurchases = ({ rows }: { rows: RecentEventPurchase[] }) => (
  <View className="mt-5">
    {/* Modern Header */}
    <View className="flex-row items-center justify-between mb-3 px-1">
      <View className="flex-row items-center gap-2.5 flex-1">
        <View className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 items-center justify-center">
          <Ticket size={18} color="#0644C7" strokeWidth={1.75} />
        </View>
        <Text
          className="text-base font-bold text-gray-900 dark:text-white flex-1"
          numberOfLines={1}
        >
          Recent Purchases
        </Text>
        <View className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
          <Text className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
            {rows.length}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => router.push("/events/purchases" as never)}
        className="flex-row items-center gap-1 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel="View all event purchases"
      >
        <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
          View All
        </Text>
        <ChevronRight size={14} color="#0644C7" />
      </Pressable>
    </View>

    {/* Modern Cards List - No background */}
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 overflow-hidden">
      {rows.map((row, index) => (
        <EventPurchaseRow
          key={row.id}
          row={row}
          isLast={index === rows.length - 1}
        />
      ))}
    </View>
  </View>
);

const Home = () => {
  const insets = useSafeAreaInsets();

  const dashboardConfig = useMemo(
    () => getDashboardConfig(getCurrentUser()?.role),
    [],
  );
  const visibleCards = useMemo<MetricCardDef[]>(
    () => dashboardConfig.cards.map((key) => METRIC_CARDS[key]),
    [dashboardConfig],
  );
  // Show/Hide Cards — keys the user has toggled off (cards still fetch data).
  const [hiddenCards, setHiddenCards] = useState<string[]>([]);
  const [showCardsMenu, setShowCardsMenu] = useState(false);
  const displayCards = useMemo(
    () => visibleCards.filter((card) => !hiddenCards.includes(card.key)),
    [visibleCards, hiddenCards],
  );
  const toggleCard = useCallback((key: string) => {
    setHiddenCards((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const {
    timeframe: dateFilter,
    dateFrom: customStartDate,
    dateTo: customEndDate,
  } = useTimeframeSelection();
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<number | "all">(
    "all",
  );
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [locationOptions, setLocationOptions] = useState<
    { id: number; name: string }[]
  >([]);

  // Real-time US time state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format time in US format (12-hour with AM/PM)
  const formatUSTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

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
    setShowDateDropdown(false);
    if (value === "custom") {
      setTimeout(() => setShowCustomRange(true), 260);
      return;
    }
    setTimeframeSelection({ timeframe: value });
  };

  const handleApplyCustomRange = (start: string, end: string) => {
    setTimeframeSelection({
      timeframe: "custom",
      dateFrom: start,
      dateTo: end,
    });
    setShowCustomRange(false);
  };

  const dateFilterOptions = [
    { label: "All Time", value: "all_time" as DateFilterType, icon: BarChart3 },
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
      icon: Calendar,
    },
    {
      label: "Custom Range",
      value: "custom" as DateFilterType,
      icon: Calendar,
    },
  ];

  const currentDateLabel =
    dateFilterOptions.find((opt) => opt.value === dateFilter)?.label ||
    "All Time";

  const dateButtonLabel =
    dateFilter === "custom" && customStartDate && customEndDate
      ? `${formatShortDate(customStartDate)} – ${formatShortDate(customEndDate)}`
      : currentDateLabel;

  const timeframeLabel = data?.timeframe?.description ?? currentDateLabel;

  const currentMetric: MetricCardDef | undefined = selectedMetric
    ? METRIC_CARDS[selectedMetric as keyof typeof METRIC_CARDS]
    : undefined;
  const currentBreakdown =
    currentMetric?.breakdownKey && dashboardConfig.showBreakdowns
      ? (data?.breakdowns?.[currentMetric.breakdownKey] ?? [])
      : [];
  const isBreakdownEmpty = currentBreakdown.length === 0;
  const [showMenu, setShowMenu] = useState(false);

  return (
    <View className="flex-1 bg-white dark:bg-black">
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
          {/* Welcome Section with US Time */}
          <View
            className="relative overflow-hidden rounded-2xl p-5 mt-6 mb-5 shadow-xl"
            style={{
              backgroundColor: "#0644C7",
              borderColor: "rgba(0, 68, 255, 0.79)",
              borderWidth: 1,
            }}
          >
            {/* Grid pattern */}
            <View className="absolute inset-0 opacity-10">
              <View
                className="absolute inset-0"
                style={{
                  backgroundImage: `
                    linear-gradient(rgb(3, 49, 197) 1px, transparent 1px),
                    linear-gradient(90deg, rgb(59, 131, 246) 1px, transparent 1px)
                  `,
                  backgroundSize: "20px 20px",
                }}
              />
            </View>

            {/* Glow effect */}
            <View className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-blue-500/10 blur-3xl" />

            {/* Three dots menu button - Top Right */}
            <Pressable
              onPress={() => {
                setShowMenu(!showMenu);
              }}
              className="absolute top-3 right-3 z-10 w-8 h-8 backdrop-blur-sm items-center justify-center"
            >
              <MoreVertical size={16} color="rgba(255,255,255,0.7)" />
            </Pressable>

            {/* Menu Dropdown */}
            {showMenu && (
              <View className="absolute top-12 right-3 z-20 bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-gray-100 dark:border-neutral-700 py-2 min-w-[160px]">
                <Pressable
                  onPress={() => {
                    console.log("Settings pressed");
                    setShowMenu(false);
                  }}
                  className="flex-row items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-neutral-700"
                >
                  <Settings size={16} color="#6b7280" />
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    Settings
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    console.log("Help pressed");
                    setShowMenu(false);
                  }}
                  className="flex-row items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-neutral-700"
                >
                  <HelpCircle size={16} color="#6b7280" />
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    Help & Support
                  </Text>
                </Pressable>
                <View className="h-px bg-gray-100 dark:bg-neutral-700 my-1" />
                <Pressable
                  onPress={() => {
                    console.log("Refresh pressed");
                    setShowMenu(false);
                    onRefresh();
                  }}
                  className="flex-row items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-neutral-700"
                >
                  <RefreshCw size={16} color="#6b7280" />
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    Refresh
                  </Text>
                </Pressable>
              </View>
            )}

            <Text className="text-blue-300/60 text-[10px] font-medium tracking-wider">
              Zone Heating
            </Text>
            <Text className="text-xl font-bold text-white tracking-tight">
              Company Dashboard
            </Text>
            <Text className="text-xs text-white/30 mt-1">
              Multi-location booking overview and management
            </Text>

            <View className="mt-3 pt-3 border-t border-white/5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 items-center justify-center">
                  <Clock size={14} color="rgba(255,255,255,0.3)" />
                </View>
                <View>
                  <Text className="text-[6px] text-white/20 uppercase tracking-wider">
                    Time
                  </Text>
                  <Text className="text-white font-bold text-sm">
                    {formatUSTime(currentTime)}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <Text className="text-[6px] text-white/30 font-medium tracking-wider">
                  ONLINE
                </Text>
              </View>
            </View>
          </View>

          {/* Filters Row — full-width segmented pill (equal segments) */}
          <FilterPill>
            <PillSegment
              label={dateButtonLabel}
              active={showDateDropdown}
              onPress={() => setShowDateDropdown(true)}
              renderIcon={(c) => <Calendar size={15} color={c} />}
            />
            <PillSegment
              label="Cards"
              active={showCardsMenu}
              onPress={() => setShowCardsMenu(true)}
              renderIcon={(c) => <Eye size={15} color={c} />}
            />
            {dashboardConfig.showLocationSelector && (
              <PillSegment
                label={selectedLocationLabel}
                active={showLocationDropdown}
                onPress={() => setShowLocationDropdown(true)}
                renderIcon={(c) => <MapPin size={15} color={c} />}
              />
            )}
          </FilterPill>

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

          {/* Metrics Grid */}
          {!loading && !error && displayCards.length > 0 && (
            <View className="flex-row flex-wrap -mx-1.5">
              {displayCards.map((metric) => (
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

          {/* All cards hidden */}
          {!loading && !error && displayCards.length === 0 && (
            <Pressable
              onPress={() => setShowCardsMenu(true)}
              className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800"
            >
              <View className="w-14 h-14 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Eye size={24} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold">
                All cards hidden
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                Tap to choose which metric cards to show.
              </Text>
            </Pressable>
          )}

          {/* Recent Event Purchases */}
          {!loading &&
            !error &&
            (data?.recentEventPurchases?.length ?? 0) > 0 && (
              <RecentEventPurchases rows={data!.recentEventPurchases!} />
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
                      {getIcon(currentMetric.icon) && (
                        <View style={{ width: 24, height: 24 }}>
                          {React.createElement(getIcon(currentMetric.icon), {
                            size: 24,
                            color: currentMetric.color,
                            strokeWidth: 1.5,
                          })}
                        </View>
                      )}
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
                    <X size={18} color="#6b7280" />
                  </Pressable>
                </View>

                {isBreakdownEmpty ? (
                  <View className="justify-center items-center py-16">
                    <BarChart3 size={32} color="#9ca3af" />
                    <Text className="text-gray-400 dark:text-gray-500 text-base font-medium mt-3">
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

      {/* Custom Range calendar */}
      <DateRangeSheet
        visible={showCustomRange}
        initialStart={customStartDate}
        initialEnd={customEndDate}
        onClose={() => setShowCustomRange(false)}
        onApply={handleApplyCustomRange}
      />

      {/* Show / Hide Cards */}
      <BottomSheet
        visible={showCardsMenu}
        onClose={() => setShowCardsMenu(false)}
        title="Show / Hide Cards"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {visibleCards.map((card) => {
            const isVisible = !hiddenCards.includes(card.key);
            return (
              <Pressable
                key={card.key}
                onPress={() => toggleCard(card.key)}
                className="flex-row items-center gap-3 px-2 py-3.5"
              >
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center border ${
                    isVisible
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-transparent border-gray-300 dark:border-neutral-600"
                  }`}
                >
                  {isVisible && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                  {card.title}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setHiddenCards([])}
            disabled={hiddenCards.length === 0}
            className="mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800"
          >
            <Text
              className={`text-sm font-semibold px-2 ${
                hiddenCards.length === 0
                  ? "text-gray-300 dark:text-neutral-600"
                  : "text-blue-600 dark:text-blue-400"
              }`}
            >
              Show All
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default Home;