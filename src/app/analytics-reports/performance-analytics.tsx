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
import { PieChart } from "../../components/ui/PieChart";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchCompanyAnalytics,
  type PerformanceReport,
} from "../../services/analyticsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
type FeatherName = ComponentProps<typeof Feather>["name"];

const RANGES = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "1y" },
];

/** "$14,494.62" with thousands separators. */
const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Panel({
  icon,
  title,
  children,
}: {
  icon: FeatherName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Feather name={icon} size={16} color={PRIMARY} />
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const PerformanceAnalytics = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [range, setRange] = useState("30d");
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<number | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    const companyId = getCurrentUser()?.company_id;
    if (!token || companyId == null) {
      setError("Company analytics are unavailable for this account.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedLoc(null);
    try {
      setReport(
        await fetchCompanyAnalytics({ token, companyId, dateRange: range }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const selectedLocation =
    report && selectedLoc != null
      ? report.locationPerformance[selectedLoc]
      : null;

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
            Performance Analytics
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
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Performance Analytics
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Revenue, bookings, and location performance
            </Text>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => router.push("/analytics-reports/accounting-analytics")}
              className="flex-1 flex-row items-center justify-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
              accessibilityRole="button"
              accessibilityLabel="Scan member"
            >
              <Feather name="bar-chart-2" size={16} color="#6B7280" />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200"
                numberOfLines={1}
              >
                Accounting Analytics
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/analytics-reports/page-analytics")}
              className="flex-1 flex-row items-center justify-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
              accessibilityRole="button"
              accessibilityLabel="Plans"
            >
              <Feather name="bar-chart" size={16} color="#6B7280" />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200"
                numberOfLines={1}
              >
                Page Analytics
              </Text>
            </Pressable>
          </View>

          {/* Period */}
          <SheetSelect
            icon="calendar"
            title="Select Period"
            value={range}
            options={RANGES}
            onSelect={(v) => setRange(String(v))}
          />

          {loading && !report && <AnalyticsSkeleton tiles={0} panels={4} />}
          {error && !report && (
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

          {report && (
            <>
              {/* Revenue & Package Bookings */}
              <Panel icon="trending-up" title="Revenue & Package Bookings">
                <AreaChart
                  height={220}
                  dark={scheme === "dark"}
                  labels={report.revenueTrend.map((r) => r.label)}
                  series={[
                    {
                      label: "Revenue ($)",
                      color: "#2563EB",
                      data: report.revenueTrend.map((r) => r.revenue),
                      axis: "left",
                      area: false,
                    },
                    {
                      label: "Bookings",
                      color: "#16A34A",
                      data: report.revenueTrend.map((r) => r.bookings),
                      axis: "right",
                      area: false,
                    },
                  ]}
                />
              </Panel>

              {/* Location Performance */}
              <Panel icon="map-pin" title="Location Performance">
                {report.locationPerformance.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <>
                    <BarChart
                      data={report.locationPerformance.map((l) => ({
                        label: l.name,
                        value: l.revenue,
                      }))}
                      selectedIndex={selectedLoc}
                      onBarPress={(_, i) =>
                        setSelectedLoc((prev) => (prev === i ? null : i))
                      }
                    />
                    <View className="mt-3 items-center">
                      {selectedLocation ? (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {selectedLocation.name}:{" "}
                          {money(selectedLocation.revenue)}
                        </Text>
                      ) : (
                        <Text className="text-xs text-gray-400 dark:text-gray-500">
                          Tap a bar to see the location&apos;s revenue
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </Panel>

              {/* Package Distribution */}
              <Panel icon="package" title="Package Distribution">
                <PieChart
                  data={report.packageDistribution.map((p) => ({
                    label: p.name,
                    value: p.count || p.value,
                  }))}
                />
              </Panel>

              {/* Peak Activity Hours */}
              <Panel icon="clock" title="Peak Activity Hours">
                {report.peakHours.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <BarChart
                    data={report.peakHours.map((h) => ({
                      label: h.hour,
                      value: h.count,
                    }))}
                    height={200}
                  />
                )}
              </Panel>

              {/* Daily Performance */}
              <Panel icon="activity" title="Daily Performance (7 Days)">
                <AreaChart
                  height={220}
                  dark={scheme === "dark"}
                  labels={report.dailyPerformance.map((d) => d.day.slice(0, 3))}
                  series={[
                    {
                      label: "Revenue ($)",
                      color: "#2563EB",
                      data: report.dailyPerformance.map((d) => d.revenue),
                      axis: "left",
                      area: true,
                    },
                    {
                      label: "Participants",
                      color: "#16A34A",
                      data: report.dailyPerformance.map((d) => d.participants),
                      axis: "right",
                      area: true,
                    },
                  ]}
                />
              </Panel>

              {/* Booking Status */}
              <Panel icon="pie-chart" title="Booking Status">
                <PieChart
                  data={report.bookingStatus.map((s) => ({
                    label: `${s.status}: ${s.count}`,
                    value: s.count,
                  }))}
                />
              </Panel>

              {/* Top Locations by Revenue */}
              <Panel icon="map-pin" title="Top Locations by Revenue">
                <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
                  <Text className="flex-1 text-[10px] font-semibold uppercase text-gray-400">
                    Location
                  </Text>
                  <Text className="w-24 text-right text-[10px] font-semibold uppercase text-gray-400">
                    Revenue
                  </Text>
                  <Text className="w-16 text-right text-[10px] font-semibold uppercase text-gray-400">
                    Packages
                  </Text>
                </View>
                {report.locationPerformance.map((l, i) => (
                  <View
                    key={`${l.name}-${i}`}
                    className="flex-row items-center py-2.5 border-b border-gray-50 dark:border-neutral-800/50"
                  >
                    <Text
                      className="flex-1 text-xs text-gray-700 dark:text-gray-200 mr-2"
                      numberOfLines={1}
                    >
                      {l.name}
                    </Text>
                    <Text className="w-24 text-right text-xs font-medium text-gray-900 dark:text-white">
                      {money(l.revenue)}
                    </Text>
                    <Text className="w-16 text-right text-xs text-gray-600 dark:text-gray-300">
                      {l.packages}
                    </Text>
                  </View>
                ))}
              </Panel>

              {/* Top Attractions */}
              <Panel icon="target" title="Top Attractions (Ticket Sales)">
                {report.topAttractions.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <>
                    <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
                      <Text className="flex-1 text-[10px] font-semibold uppercase text-gray-400">
                        Attraction
                      </Text>
                      <Text className="w-14 text-right text-[10px] font-semibold uppercase text-gray-400">
                        Tickets
                      </Text>
                      <Text className="w-24 text-right text-[10px] font-semibold uppercase text-gray-400">
                        Revenue
                      </Text>
                    </View>
                    {report.topAttractions.map((a, i) => (
                      <View
                        key={`${a.name}-${i}`}
                        className="flex-row items-center py-2.5 border-b border-gray-50 dark:border-neutral-800/50"
                      >
                        <Text
                          className="flex-1 text-xs text-gray-700 dark:text-gray-200 mr-2"
                          numberOfLines={1}
                        >
                          {a.name}
                        </Text>
                        <Text className="w-14 text-right text-xs text-gray-600 dark:text-gray-300">
                          {a.ticketsSold}
                        </Text>
                        <Text className="w-24 text-right text-xs font-medium text-gray-900 dark:text-white">
                          {money(a.revenue)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </Panel>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default PerformanceAnalytics;
