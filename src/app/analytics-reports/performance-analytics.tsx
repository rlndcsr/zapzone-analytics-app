import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Activity,
  Baby,
  Boxes,
  Building2,
  CalendarDays,
  Clock,
  DollarSign,
  FileSignature,
  MapPin,
  Package,
  Ticket,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import LocationManagerAnalytics from "../../components/analytics/LocationManagerAnalytics";
import {
  CARD_SHADOW,
  MetricCard,
  Panel,
  PRIMARY,
  TableCard,
  count,
  money,
  noteMetric,
} from "../../components/ui/AnalyticsCards";
import { AreaChart } from "../../components/ui/AreaChart";
import { BarChart } from "../../components/ui/BarChart";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { NavTileCard } from "../../components/ui/NavTileCard";
import { PieChart } from "../../components/ui/PieChart";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { PerformanceAnalyticsSkeleton } from "../../components/ui/skeleton/PerformanceAnalyticsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchCompanyAnalytics,
  type PerformanceReport,
} from "../../services/analyticsService";

// Same options and wording as the web page's period <select>.
const RANGES = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
  { label: "Custom Range", value: "custom" },
];


/**
 * Performance Analytics. The web serves two different pages behind this name —
 * the company admin's /admin/analytics (company-wide) and the location
 * manager's /manager/analytics (their own location, with its own metrics,
 * charts and tables) — so pick the one that matches the signed-in role.
 */
const PerformanceAnalytics = () => {
  const role = getCurrentUser()?.role;
  if (role === "location_manager") return <LocationManagerAnalytics />;
  return <CompanyPerformanceAnalytics />;
};

const CompanyPerformanceAnalytics = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [range, setRange] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState<number | null>(null);

  /**
   * This page's own location filter — a multi-select that goes to the backend as
   * `location_ids[]`, exactly like the web's "Locations" button. Deliberately
   * separate from the global workspace location: the web page scopes analytics
   * on its own, and an empty selection means every location.
   */
  const [showLocations, setShowLocations] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    const token = getToken();
    const companyId = getCurrentUser()?.company_id;
    if (!token || companyId == null) {
      setError("Company analytics are unavailable for this account.");
      setLoading(false);
      return;
    }
    // A custom range only makes a request once both ends are picked, as on web.
    if (range === "custom" && (!customStart || !customEnd)) return;
    setLoading(true);
    setError(null);
    setSelectedLoc(null);
    try {
      setReport(
        await fetchCompanyAnalytics({
          token,
          companyId,
          dateRange: range,
          locationIds: selectedLocationIds,
          startDate: customStart || undefined,
          endDate: customEnd || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd, selectedLocationIds]);

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

  const toggleLocation = (id: number) =>
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );

  // The web falls back to the names in location_performance when the backend
  // sends no available_locations block.
  const allLocations = useMemo(() => {
    if (!report) return [];
    if (report.availableLocations.length > 0) return report.availableLocations;
    return report.locationPerformance
      .filter((l) => l.locationId != null)
      .map((l) => ({ id: l.locationId as number, name: l.name }));
  }, [report]);

  // "3 locations selected" / "All 7 locations" — the web's header subtitle.
  const scopeLabel = report
    ? selectedLocationIds.length > 0
      ? `${selectedLocationIds.length} location${
          selectedLocationIds.length !== 1 ? "s" : ""
        } selected`
      : `All ${report.company.totalLocations} locations`
    : "Revenue, bookings, and location performance";

  const rangeLabel =
    range === "custom" && customStart && customEnd
      ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
      : (RANGES.find((r) => r.value === range)?.label ?? "");

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
              {report?.company.name || "Company Analytics"}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {scopeLabel}
            </Text>
          </View>

          {/* Sibling report shortcuts — side-by-side square cards, the same
              design the other modules use. */}
          <View className="flex-row items-stretch gap-3">
            <View className="flex-1">
              <NavTileCard
                icon="bar-chart"
                title="Page Analytics"
                desc="Visitors, engagement, conversions"
                cta="View Analytics"
                onPress={() => router.push("/analytics-reports/page-analytics")}
              />
            </View>
            <View className="flex-1">
              <NavTileCard
                icon="bar-chart-2"
                title="Accounting"
                desc="Purchases made on selected dates"
                cta="View Accounting"
                onPress={() =>
                  router.push("/analytics-reports/accounting-analytics")
                }
              />
            </View>
          </View>

          {/* Period + this page's own location filter (the web's header row) */}
          <SheetSelect
            icon="calendar"
            title="Select Period"
            value={range}
            options={RANGES}
            onSelect={(v) => {
              const next = String(v);
              setRange(next);
              // Picking "Custom Range" goes straight to the calendar, like the
              // web revealing its DateRangeCalendar beside the select.
              if (next === "custom") setShowCustomRange(true);
            }}
          />

          {range === "custom" && (
            <Pressable
              onPress={() => setShowCustomRange(true)}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-800"
            >
              <Feather name="calendar" size={16} color="#6B7280" />
              <Text
                className={`flex-1 text-sm ${
                  customStart && customEnd
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-400 dark:text-gray-500"
                }`}
                numberOfLines={1}
              >
                {customStart && customEnd ? rangeLabel : "Pick a date range"}
              </Text>
              <Feather name="chevron-right" size={16} color="#9CA3AF" />
            </Pressable>
          )}

          <Pressable
            onPress={() => setShowLocations(true)}
            className={`flex-row items-center gap-2 px-4 py-3.5 rounded-xl border ${
              selectedLocationIds.length > 0
                ? "bg-[#0644C7] border-[#0644C7]"
                : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
            }`}
            accessibilityRole="button"
            accessibilityLabel="Filter by locations"
          >
            <Feather
              name="filter"
              size={16}
              color={selectedLocationIds.length > 0 ? "#FFFFFF" : "#6B7280"}
            />
            <Text
              className={`flex-1 text-sm font-medium ${
                selectedLocationIds.length > 0
                  ? "text-white"
                  : "text-gray-700 dark:text-gray-200"
              }`}
              numberOfLines={1}
            >
              Locations
            </Text>
            {selectedLocationIds.length > 0 && (
              <View className="px-2 py-0.5 rounded-full bg-white">
                <Text className="text-xs font-semibold text-gray-900">
                  {selectedLocationIds.length}
                </Text>
              </View>
            )}
          </Pressable>

          {loading && !report && (
            <PerformanceAnalyticsSkeleton metrics={6} panels={6} tables={2} />
          )}
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
              {/* Key metrics — the web's card grid, same order, labels + icons.
                  Event Tickets / Active Events only appear when the backend
                  sends them, exactly as the web conditions those two cards. */}
              <View className="flex-row flex-wrap items-stretch -mx-1.5">
                <MetricCard
                  icon={DollarSign}
                  label="Total Revenue"
                  value={money(report.keyMetrics.totalRevenue.value)}
                  metric={report.keyMetrics.totalRevenue}
                />
                <MetricCard
                  icon={Building2}
                  label="Total Locations"
                  value={count(report.keyMetrics.totalLocations.value)}
                  metric={report.keyMetrics.totalLocations}
                />
                <MetricCard
                  icon={Package}
                  label="Package Bookings"
                  value={count(report.keyMetrics.packageBookings.value)}
                  metric={report.keyMetrics.packageBookings}
                />
                <MetricCard
                  icon={Ticket}
                  label="Ticket Purchases"
                  value={count(report.keyMetrics.ticketPurchases.value)}
                  metric={report.keyMetrics.ticketPurchases}
                />
                <MetricCard
                  icon={Users}
                  label="Total Participants"
                  value={count(report.keyMetrics.totalParticipants.value)}
                  metric={report.keyMetrics.totalParticipants}
                />
                <MetricCard
                  icon={Boxes}
                  label="Active Packages"
                  value={count(report.keyMetrics.activePackages.value)}
                  metric={report.keyMetrics.activePackages}
                />
                {!!report.keyMetrics.eventTicketPurchases && (
                  <MetricCard
                    icon={CalendarDays}
                    label="Event Tickets"
                    value={count(report.keyMetrics.eventTicketPurchases.value)}
                    metric={report.keyMetrics.eventTicketPurchases}
                  />
                )}
                {!!report.keyMetrics.activeEvents && (
                  <MetricCard
                    icon={CalendarDays}
                    label="Active Events"
                    value={count(report.keyMetrics.activeEvents.value)}
                    metric={report.keyMetrics.activeEvents}
                  />
                )}
                {/* Waiver tiles — hidden when the response omits the block. */}
                {!!report.waivers && (
                  <MetricCard
                    icon={FileSignature}
                    label="Waivers Signed"
                    value={count(report.waivers.summary.completed)}
                    metric={noteMetric(
                      `${count(report.waivers.summary.total)} total · ${count(report.waivers.summary.pending)} pending`,
                    )}
                  />
                )}
                {!!report.waivers && (
                  <MetricCard
                    icon={Baby}
                    label="Adults / Minors"
                    value={count(report.waivers.summary.adultSigners)}
                    valueSuffix={` / ${count(report.waivers.summary.minorsCovered)}`}
                    metric={noteMetric(
                      `${count(report.waivers.summary.peopleCovered)} people covered`,
                    )}
                  />
                )}
                {!!report.waivers && (
                  <MetricCard
                    icon={UserCheck}
                    label="Checked In"
                    value={count(report.waivers.summary.checkedIn)}
                    metric={noteMetric(
                      `${count(report.waivers.summary.signedNotCheckedIn)} signed, not checked in`,
                    )}
                  />
                )}
              </View>

              {/* Revenue & Package Bookings */}
              <Panel
                icon={TrendingUp}
                title="Revenue & Package Bookings"
                info="Total revenue and package booking trends across all locations. Revenue includes both packages and attraction tickets."
              >
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
              <Panel
                icon={MapPin}
                title="Location Performance"
                info="Revenue comparison across all locations"
              >
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
              <Panel
                icon={Package}
                title="Package Distribution"
                info="Distribution of package bookings by type. Packages are group experiences that can be reserved in advance."
              >
                <PieChart
                  data={report.packageDistribution.map((p) => ({
                    label: p.name,
                    value: p.count || p.value,
                  }))}
                />
              </Panel>

              {/* Peak Activity Hours */}
              <Panel
                icon={Clock}
                title="Peak Activity Hours"
                info="Hourly activity patterns for package bookings and ticket purchases across all locations"
              >
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
              <Panel
                icon={Activity}
                title="Daily Performance (7 Days)"
                info="Revenue and participant trends over the last week"
              >
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
              <Panel
                icon={Activity}
                title="Booking Status"
                info="Current status of all bookings"
              >
                <PieChart
                  data={report.bookingStatus.map((s) => ({
                    label: `${s.status}: ${s.count}`,
                    value: s.count,
                  }))}
                />
              </Panel>

              {/* Waivers Per Day */}
              {!!report.waivers && (
                <Panel
                  icon={FileSignature}
                  title="Waivers Per Day"
                  info="Waivers created per day across the selected period and locations. Longer ranges are grouped by month."
                >
                  {report.waivers.perDay.length === 0 ? (
                    <Text className="text-sm text-gray-400 dark:text-gray-500">
                      No data.
                    </Text>
                  ) : (
                    <AreaChart
                      height={220}
                      dark={scheme === "dark"}
                      labels={report.waivers.perDay.map((d) => d.label)}
                      series={[
                        {
                          label: "Waivers",
                          color: PRIMARY,
                          data: report.waivers.perDay.map((d) => d.count),
                        },
                      ]}
                    />
                  )}
                </Panel>
              )}

              {/* Adult Age Brackets */}
              {!!report.waivers && (
                <Panel
                  icon={Users}
                  title="Adult Age Brackets"
                  info="Age distribution of adult signers, computed from the date of birth on signed waivers."
                >
                  {report.waivers.ageBrackets.length === 0 ? (
                    <Text className="text-sm text-gray-400 dark:text-gray-500">
                      No data.
                    </Text>
                  ) : (
                    <BarChart
                      data={report.waivers.ageBrackets.map((b) => ({
                        label: b.bracket,
                        value: b.count,
                      }))}
                      height={200}
                    />
                  )}
                </Panel>
              )}

              {/* Waivers by Source */}
              {!!report.waivers && report.waivers.bySource.length > 0 && (
                <Panel
                  icon={Boxes}
                  title="Waivers by Source"
                  info="Where waivers in the period originated: kiosk, email, SMS, staff-sent, bulk invite, or checkout."
                >
                  <PieChart
                    data={report.waivers.bySource.map((s) => ({
                      label: `${s.source}: ${s.count}`,
                      value: s.count,
                    }))}
                  />
                </Panel>
              )}

              {/* Top Locations by Revenue — the web shows its first 6 rows. */}
              <TableCard
                icon={MapPin}
                title="Top Locations by Revenue"
                columns={[
                  ["Location", 0],
                  ["Revenue", 96],
                  ["Packages", 64],
                ]}
                rows={report.locationPerformance
                  .slice(0, 6)
                  .map((l) => [l.name, money(l.revenue), l.packages])}
                empty="No data."
              />

              {/* Top Attractions (Ticket Sales) */}
              <TableCard
                icon={Ticket}
                title="Top Attractions (Ticket Sales)"
                columns={[
                  ["Attraction", 0],
                  ["Tickets Sold", 80],
                  ["Revenue", 96],
                ]}
                rows={report.topAttractions.map((a) => [
                  a.name,
                  a.ticketsSold,
                  money(a.revenue),
                ])}
                empty="No data."
              />

              {/* Top Events — only rendered when the backend returns any, the
                  same condition the web card uses. */}
              {report.topEvents.length > 0 && (
                <TableCard
                  icon={CalendarDays}
                  title="Top Events"
                  columns={[
                    ["Event", 0],
                    ["Tickets Sold", 80],
                    ["Revenue", 96],
                  ]}
                  rows={report.topEvents.map((e) => [
                    e.name,
                    e.ticketsSold,
                    money(e.revenue),
                  ])}
                  empty="No data."
                />
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* This page's own location filter — multi-select, "Clear All", and an
          empty selection meaning every location (the web's Locations panel). */}
      <BottomSheet
        visible={showLocations}
        onClose={() => setShowLocations(false)}
        title="Select Locations"
        subtitle={
          selectedLocationIds.length > 0
            ? `${selectedLocationIds.length} location(s) selected`
            : "All locations selected"
        }
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {allLocations.length === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 px-2 py-4">
              No locations available.
            </Text>
          ) : (
            <>
              {allLocations.map((loc) => {
                const on = selectedLocationIds.includes(loc.id);
                return (
                  <Pressable
                    key={loc.id}
                    onPress={() => toggleLocation(loc.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center gap-3 px-2 py-3.5"
                  >
                    <View
                      className={`w-6 h-6 rounded-md items-center justify-center border ${
                        on
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "border-gray-300 dark:border-neutral-600"
                      }`}
                    >
                      {on && <Feather name="check" size={14} color="#FFFFFF" />}
                    </View>
                    <Text
                      className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1"
                      numberOfLines={1}
                    >
                      {loc.name}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setSelectedLocationIds([])}
                disabled={selectedLocationIds.length === 0}
                className="mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800 px-2"
              >
                <Text
                  className={`text-sm font-semibold ${
                    selectedLocationIds.length === 0
                      ? "text-gray-300 dark:text-neutral-600"
                      : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  Clear All
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Custom period calendar, for the range select's "Custom Range". */}
      <DateRangeSheet
        visible={showCustomRange}
        initialStart={customStart || undefined}
        initialEnd={customEnd || undefined}
        onClose={() => setShowCustomRange(false)}
        onApply={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setShowCustomRange(false);
        }}
      />
    </View>
  );
};

export default PerformanceAnalytics;
