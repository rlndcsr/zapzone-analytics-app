import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AreaChart } from "../../components/ui/AreaChart";
import { BarChart } from "../../components/ui/BarChart";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import { PieChart } from "../../components/ui/PieChart";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { StatTile } from "../../components/ui/StatTile";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchCustomerAnalytics,
  type CustomerAnalytics,
  type CustomerDateRange,
  type TopCustomerRow,
} from "../../services/customersService";
import { useActiveLocation } from "../../lib/location/activeLocationStore";

const PRIMARY = "#0644C7";
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type FeatherName = ComponentProps<typeof Feather>["name"];

const PERIOD_OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
  { label: "Custom range", value: "custom" },
];

const KPI_STYLE: Record<string, { icon: FeatherName; bg: string; color: string }> = {
  "Total Customers": { icon: "users", bg: "bg-blue-50 dark:bg-blue-900/30", color: PRIMARY },
  "Active Customers": { icon: "activity", bg: "bg-green-50 dark:bg-green-900/30", color: "#16A34A" },
  "Total Revenue": { icon: "dollar-sign", bg: "bg-emerald-50 dark:bg-emerald-900/30", color: "#059669" },
  "Repeat Rate": { icon: "repeat", bg: "bg-purple-50 dark:bg-purple-900/30", color: "#8B5CF6" },
  "Avg. Revenue/Customer": { icon: "dollar-sign", bg: "bg-amber-50 dark:bg-amber-900/30", color: "#F59E0B" },
  "New Customers (30d)": { icon: "trending-up", bg: "bg-blue-50 dark:bg-blue-900/30", color: PRIMARY },
};
const DEFAULT_KPI = { icon: "bar-chart-2" as FeatherName, bg: "bg-gray-100 dark:bg-neutral-800", color: "#6B7280" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

/** A titled white panel wrapping a chart or table section. */
const Panel = ({
  icon,
  title,
  children,
}: {
  icon: FeatherName;
  title: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-gray-100 dark:border-neutral-800"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-center gap-2 mb-4">
      <Feather name={icon} size={16} color={PRIMARY} />
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

/** A "top N by customer" table (activities / packages / events). */
const TopTable = ({
  rows,
  itemHeader,
  countHeader,
}: {
  rows: TopCustomerRow[];
  itemHeader: string;
  countHeader: string;
}) => (
  <View>
    <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
      <Text className="flex-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
        Customer
      </Text>
      <Text className="flex-1 text-xs font-semibold text-gray-400 dark:text-gray-500">
        {itemHeader}
      </Text>
      <Text className="w-16 text-right text-xs font-semibold text-gray-400 dark:text-gray-500">
        {countHeader}
      </Text>
    </View>
    {rows.length === 0 ? (
      <Text className="text-sm text-gray-400 dark:text-gray-500 py-3">
        No data available.
      </Text>
    ) : (
      rows.map((r, i) => (
        <View
          key={i}
          className="flex-row py-2.5 border-b border-gray-50 dark:border-neutral-800/50"
        >
          <Text className="flex-1 text-sm text-gray-900 dark:text-white" numberOfLines={1}>
            {r.customer}
          </Text>
          <Text className="flex-1 text-sm text-gray-600 dark:text-gray-300" numberOfLines={1}>
            {r.item}
          </Text>
          <Text className="w-16 text-right text-sm font-semibold text-gray-900 dark:text-white">
            {r.count}
          </Text>
        </View>
      ))
    )}
  </View>
);

const CustomersAnalytics = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const headerIcon = dark ? "#fff" : "#111";

  const user = getCurrentUser();

  // Scope to the global workspace location (company_admin); managers stay
  // backend-scoped. Reactive so switching location refetches server-side.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const [dateRange, setDateRange] = useState<CustomerDateRange>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [showDateSheet, setShowDateSheet] = useState(false);

  const [data, setData] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    // Custom range needs both endpoints before we query.
    if (dateRange === "custom" && (!customStart || !customEnd)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCustomerAnalytics({
        token,
        userId: user?.id,
        dateRange,
        startDate: customStart,
        endDate: customEnd,
        locationId: activeLocationId,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [dateRange, customStart, customEnd, activeLocationId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const growthLabels = data?.customerGrowth.map((p) => p.month) ?? [];
  const revenueLabels = data?.revenueTrend.map((p) => p.month) ?? [];
  const repeatLabels = data?.repeatCustomers.map((p) => p.month) ?? [];

  const showInitialLoader = loading && !data;
  const showError = !loading && !!error && !data;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Customer Analytics
          </Text>
          <Pressable
            onPress={onRefresh}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Customer Analytics
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Customer metrics, trends, and top customers for the selected period
            </Text>
          </View>

          {/* Filters */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <SheetSelect
                icon="calendar"
                title="Period"
                value={dateRange}
                options={PERIOD_OPTIONS}
                onSelect={(v) => setDateRange(v as CustomerDateRange)}
              />
            </View>
          </View>

          {/* Custom range trigger */}
          {dateRange === "custom" && (
            <Pressable
              onPress={() => setShowDateSheet(true)}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1">
                {customStart && customEnd
                  ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
                  : "Pick a date range"}
              </Text>
              <Feather name="chevron-down" size={14} color="#9CA3AF" />
            </Pressable>
          )}

          {showInitialLoader && <AnalyticsSkeleton tiles={6} panels={4} />}

          {showError && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
                {error}
              </Text>
              <Pressable
                onPress={load}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
              >
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {!showInitialLoader && !showError && data && (
            <>
              {/* KPI cards */}
              <View className="flex-row flex-wrap gap-3">
                {data.kpis.map((k) => {
                  const s = KPI_STYLE[k.label] ?? DEFAULT_KPI;
                  return (
                    <StatTile
                      key={k.label}
                      icon={s.icon}
                      iconBg={s.bg}
                      iconColor={s.color}
                      label={k.label}
                      value={k.value}
                      hint={k.change ? `${k.change} vs prev. period` : undefined}
                    />
                  );
                })}
              </View>

              {/* Customer growth */}
              <Panel icon="trending-up" title="Customer Growth">
                <AreaChart
                  dark={dark}
                  labels={growthLabels}
                  series={[
                    {
                      label: "Total Customers",
                      color: PRIMARY,
                      data: data.customerGrowth.map((p) => p.customers),
                    },
                  ]}
                />
              </Panel>

              {/* Revenue & bookings trend (dual axis) */}
              <Panel icon="dollar-sign" title="Revenue & Bookings Trend">
                <AreaChart
                  dark={dark}
                  labels={revenueLabels}
                  series={[
                    {
                      label: "Revenue ($)",
                      color: "#0644C7",
                      data: data.revenueTrend.map((p) => p.revenue),
                      axis: "left",
                      area: false,
                    },
                    {
                      label: "Bookings",
                      color: "#16A34A",
                      data: data.revenueTrend.map((p) => p.bookings),
                      axis: "right",
                      area: false,
                    },
                  ]}
                />
              </Panel>

              {/* Repeat rate */}
              <Panel icon="repeat" title="Repeat Customer Rate">
                <AreaChart
                  dark={dark}
                  labels={repeatLabels}
                  series={[
                    {
                      label: "Repeat Rate %",
                      color: "#8B5CF6",
                      data: data.repeatCustomers.map((p) => p.repeatRate),
                      area: false,
                    },
                  ]}
                />
              </Panel>

              {/* Booking time distribution */}
              <Panel icon="clock" title="Booking Time Distribution">
                <BarChart
                  data={data.bookingTimeDistribution.map((d) => ({
                    label: d.label,
                    value: d.count,
                  }))}
                />
              </Panel>

              {/* Activity by hour */}
              <Panel icon="activity" title="Customer Activity by Hour">
                <BarChart
                  color="#16A34A"
                  data={data.activityHours.map((d) => ({
                    label: d.label,
                    value: d.count,
                  }))}
                />
              </Panel>

              {/* Bookings per customer */}
              <Panel icon="users" title="Bookings per Customer">
                <BarChart
                  color="#F59E0B"
                  data={data.bookingsPerCustomer.map((d) => ({
                    label: d.name,
                    value: d.value,
                  }))}
                />
              </Panel>

              {/* Status distribution */}
              <Panel icon="pie-chart" title="Customer Status Distribution">
                <PieChart
                  data={data.statusDistribution.map((s) => ({
                    label: s.status,
                    value: s.count,
                  }))}
                />
              </Panel>

              {/* Lifetime value segments */}
              <Panel icon="award" title="Customer Value Segments">
                <PieChart
                  data={data.lifetimeValue.map((s) => ({
                    label: s.segment,
                    value: s.value,
                  }))}
                />
              </Panel>

              {/* Top activities / packages / events */}
              <Panel icon="target" title="Top Activities by Customer">
                <TopTable
                  rows={data.topActivities}
                  itemHeader="Activity"
                  countHeader="Qty"
                />
              </Panel>
              <Panel icon="package" title="Top Packages by Customer">
                <TopTable
                  rows={data.topPackages}
                  itemHeader="Package"
                  countHeader="Bookings"
                />
              </Panel>
              {data.topEvents.length > 0 && (
                <Panel icon="calendar" title="Top Events by Customer">
                  <TopTable
                    rows={data.topEvents}
                    itemHeader="Event"
                    countHeader="Qty"
                  />
                </Panel>
              )}

              {/* Recent customers */}
              <Panel icon="user-plus" title="Recent Customers">
                {data.recentCustomers.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 py-3">
                    No customer data available.
                  </Text>
                ) : (
                  data.recentCustomers.map((c) => (
                    <View
                      key={c.id}
                      className="py-3 border-b border-gray-50 dark:border-neutral-800/50"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text
                          className="text-sm font-semibold text-gray-900 dark:text-white flex-1 mr-2"
                          numberOfLines={1}
                        >
                          {c.name}
                        </Text>
                        <StatusBadge status={c.status} />
                      </View>
                      {!!c.email && (
                        <Text
                          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                          numberOfLines={1}
                        >
                          {c.email}
                        </Text>
                      )}
                      <View className="flex-row items-center gap-4 mt-1.5">
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          ${c.totalSpent.toFixed(2)}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {c.bookings} bookings
                        </Text>
                        <Text className="text-xs text-gray-400 dark:text-gray-500">
                          Joined {formatDate(c.joinDate)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Panel>
            </>
          )}
        </View>
      </ScrollView>

      <DateRangeSheet
        visible={showDateSheet}
        initialStart={customStart}
        initialEnd={customEnd}
        onClose={() => setShowDateSheet(false)}
        onApply={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setShowDateSheet(false);
        }}
      />
    </View>
  );
};

export default CustomersAnalytics;
