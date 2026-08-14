import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Activity,
  CalendarDays,
  Clock,
  DollarSign,
  Package,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AreaChart, type AreaSeries } from "../ui/AreaChart";
import {
  CARD_SHADOW,
  MetricCard,
  Panel,
  PRIMARY,
  TableCard,
  count,
  money,
} from "../ui/AnalyticsCards";
import { BarChart } from "../ui/BarChart";
import { BottomSheet } from "../ui/BottomSheet";
import { DateRangeSheet, formatShortDate } from "../ui/DateRangeSheet";
import { NavTileCard } from "../ui/NavTileCard";
import { SheetSelect } from "../ui/SheetSelect";
import { PerformanceAnalyticsSkeleton } from "../ui/skeleton/PerformanceAnalyticsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  exportLocationAnalytics,
  fetchLocationAnalytics,
  type LocationExportSection,
  type LocationReport,
} from "../../services/analyticsService";

// Same options and wording as the web page's period <select>.
const RANGES = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last year", value: "1y" },
  { label: "Custom Range", value: "custom" },
];

/** The web export modal's "Include in Export" list, same ids, labels and order. */
const EXPORT_SECTIONS: { id: LocationExportSection; label: string }[] = [
  { id: "metrics", label: "Key Metrics" },
  { id: "revenue", label: "Revenue Data" },
  { id: "packages", label: "Package Performance" },
  { id: "attractions", label: "Attraction Data" },
  { id: "timeslots", label: "Time Slot Analysis" },
  { id: "events", label: "Event Performance" },
];

const EXPORT_FORMATS = [
  { label: "JSON (.json)", value: "json" },
  { label: "CSV (.csv)", value: "csv" },
];

/** Series colors, matching the web chart legends. */
const C_REVENUE = "#2563EB";
const C_BOOKINGS = "#10B981";
const C_ATTRACTIONS = "#F59E0B";
const C_EVENTS = "#8B5CF6";

/**
 * The location manager's Performance Analytics — a port of the web's
 * `/manager/analytics` (LocationManagerAnalytics), which is a different report
 * from the company admin's: it is scoped to the manager's own location and has
 * its own metric cards, charts and tables.
 */
export default function LocationManagerAnalytics() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [range, setRange] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [report, setReport] = useState<LocationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Export modal state — the web's sections default to everything selected.
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exporting, setExporting] = useState(false);
  const [sections, setSections] = useState<LocationExportSection[]>(
    EXPORT_SECTIONS.map((s) => s.id),
  );

  const locationId = getCurrentUser()?.location_id ?? null;

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    if (locationId == null) {
      setError(
        "Your account is not assigned to a location. Please contact your company administrator.",
      );
      setLoading(false);
      return;
    }
    // A custom range only makes a request once both ends are picked, as on web.
    if (range === "custom" && (!customStart || !customEnd)) return;
    setLoading(true);
    setError(null);
    try {
      setReport(
        await fetchLocationAnalytics({
          token,
          locationId,
          dateRange: range,
          startDate: customStart || undefined,
          endDate: customEnd || undefined,
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load analytics. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [locationId, range, customStart, customEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleSection = (id: LocationExportSection) =>
    setSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  const runExport = useCallback(async () => {
    const token = getToken();
    if (!token || locationId == null || !report) return;
    if (range === "custom" && (!customStart || !customEnd)) {
      Alert.alert(
        "Export Analytics",
        "Please select both start and end dates for custom range.",
      );
      return;
    }
    setExporting(true);
    try {
      const body = await exportLocationAnalytics({
        token,
        locationId,
        dateRange: range,
        format: exportFormat,
        sections,
        startDate: customStart || undefined,
        endDate: customEnd || undefined,
      });
      // Lazy-loaded so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const safeName =
        report.location.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() ||
        "location";
      const uri = `${FileSystem.cacheDirectory}${safeName}-analytics.${exportFormat}`;
      await FileSystem.writeAsStringAsync(uri, body, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: exportFormat === "csv" ? "text/csv" : "application/json",
          dialogTitle: `Export Analytics - ${report.location.name}`,
        });
      }
      setShowExport(false);
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }, [
    locationId,
    report,
    range,
    customStart,
    customEnd,
    exportFormat,
    sections,
  ]);

  const rangeLabel =
    range === "custom" && customStart && customEnd
      ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
      : (RANGES.find((r) => r.value === range)?.label ?? "");

  // Only hours with activity, exactly as the web filters both hourly panels.
  const hourly = useMemo(
    () =>
      (report?.hourlyRevenue ?? []).filter(
        (h) => h.revenue > 0 || h.bookings > 0 || h.attractionPurchases > 0,
      ),
    [report],
  );
  const timeSlots = useMemo(
    () =>
      (report?.timeSlotPerformance ?? []).filter(
        (s) => s.totalTransactions > 0,
      ),
    [report],
  );

  /** Web behaviour: the event series is only drawn when the data carries one. */
  const withEvents = (base: AreaSeries[], extra: AreaSeries, show: boolean) =>
    show ? [...base, extra] : base;

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
          {/* Intro — the web's "Location Analytics - {name}" heading and the
              location's full address beneath it. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {report
                ? `Location Analytics - ${report.location.name}`
                : "Location Analytics"}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {report?.location.fullAddress ||
                "Revenue, bookings and attraction performance"}
            </Text>
          </View>

          {/* Sibling report shortcuts (the manager sidebar's other two entries) */}
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

          {/* Period select + Export — the web header's controls */}
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
            onPress={() => setShowExport(true)}
            disabled={!report}
            className={`flex-row items-center justify-center gap-2 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 ${
              report ? "active:opacity-70" : "opacity-50"
            }`}
            accessibilityRole="button"
            accessibilityLabel="Export"
          >
            <Feather name="download" size={16} color={PRIMARY} />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Export
            </Text>
          </Pressable>

          {loading && !report && (
            <PerformanceAnalyticsSkeleton metrics={6} panels={6} tables={2} />
          )}
          {error && !report && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#F59E0B" />
              <Text className="text-base font-semibold text-gray-900 dark:text-white mt-3">
                Analytics unavailable
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1 text-center">
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
                  The last two only render when the backend sends them, exactly
                  as the web conditions those cards. */}
              <View className="flex-row flex-wrap items-stretch -mx-1.5">
                <MetricCard
                  icon={DollarSign}
                  label="Location Revenue"
                  value={money(report.keyMetrics.locationRevenue.value)}
                  metric={report.keyMetrics.locationRevenue}
                />
                <MetricCard
                  icon={Package}
                  label="Package Bookings"
                  value={count(report.keyMetrics.packageBookings.value)}
                  metric={report.keyMetrics.packageBookings}
                />
                <MetricCard
                  icon={Ticket}
                  label="Ticket Sales"
                  value={count(report.keyMetrics.ticketSales.value)}
                  metric={report.keyMetrics.ticketSales}
                />
                <MetricCard
                  icon={Users}
                  label="Total Visitors"
                  value={count(report.keyMetrics.totalVisitors.value)}
                  metric={report.keyMetrics.totalVisitors}
                />
                <MetricCard
                  icon={Package}
                  label="Active Packages"
                  value={count(report.keyMetrics.activePackages.value)}
                  metric={report.keyMetrics.activePackages}
                />
                <MetricCard
                  icon={Activity}
                  label="Active Attractions"
                  value={count(report.keyMetrics.activeAttractions.value)}
                  metric={report.keyMetrics.activeAttractions}
                />
                {!!report.keyMetrics.eventTicketSales && (
                  <MetricCard
                    icon={CalendarDays}
                    label="Event Ticket Sales"
                    value={count(report.keyMetrics.eventTicketSales.value)}
                    metric={report.keyMetrics.eventTicketSales}
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
              </View>

              {/* Hourly Revenue Pattern */}
              <Panel
                icon={Clock}
                title="Hourly Revenue Pattern"
                info="Revenue and booking patterns throughout the day (only hours with activity)"
              >
                {hourly.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <AreaChart
                    height={220}
                    dark={scheme === "dark"}
                    labels={hourly.map((h) => h.label)}
                    series={withEvents(
                      [
                        {
                          label: "Revenue ($)",
                          color: C_REVENUE,
                          data: hourly.map((h) => h.revenue),
                          axis: "left",
                          area: false,
                        },
                        {
                          label: "Bookings",
                          color: C_BOOKINGS,
                          data: hourly.map((h) => h.bookings),
                          axis: "right",
                          area: false,
                        },
                        {
                          label: "Attraction Purchases",
                          color: C_ATTRACTIONS,
                          data: hourly.map((h) => h.attractionPurchases),
                          axis: "right",
                          area: false,
                        },
                      ],
                      {
                        label: "Event Purchases",
                        color: C_EVENTS,
                        data: hourly.map((h) => h.eventPurchases),
                        axis: "right",
                        area: false,
                      },
                      hourly.some((h) => h.eventPurchases > 0),
                    )}
                  />
                )}
              </Panel>

              {/* Daily Performance */}
              <Panel
                icon={Activity}
                title="Daily Performance"
                info="Revenue, bookings, and attraction purchase trends per day"
              >
                {report.dailyRevenue.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <AreaChart
                    height={220}
                    dark={scheme === "dark"}
                    labels={report.dailyRevenue.map((d) => d.label)}
                    series={withEvents(
                      [
                        {
                          label: "Revenue ($)",
                          color: C_REVENUE,
                          data: report.dailyRevenue.map((d) => d.revenue),
                          axis: "left",
                          area: true,
                        },
                        {
                          label: "Bookings",
                          color: C_BOOKINGS,
                          data: report.dailyRevenue.map((d) => d.bookings),
                          axis: "right",
                          area: true,
                        },
                        {
                          label: "Attraction Purchases",
                          color: C_ATTRACTIONS,
                          data: report.dailyRevenue.map(
                            (d) => d.attractionPurchases,
                          ),
                          axis: "right",
                          area: true,
                        },
                      ],
                      {
                        label: "Event Purchases",
                        color: C_EVENTS,
                        data: report.dailyRevenue.map((d) => d.eventPurchases),
                        axis: "right",
                        area: true,
                      },
                      report.dailyRevenue.some((d) => d.eventPurchases > 0),
                    )}
                  />
                )}
              </Panel>

              {/* Package Bookings */}
              <Panel
                icon={Package}
                title="Package Bookings"
                info="Reserved package bookings by type. Packages are group experiences scheduled in advance."
              >
                {report.packagePerformance.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <BarChart
                    data={report.packagePerformance.map((p) => ({
                      label: p.name,
                      value: p.bookings,
                    }))}
                  />
                )}
              </Panel>

              {/* Attraction Ticket Sales */}
              <Panel
                icon={Ticket}
                title="Attraction Ticket Sales"
                info="Tickets sold and revenue per attraction"
              >
                {report.attractionPerformance.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <BarChart
                    data={report.attractionPerformance.map((a) => ({
                      label: a.name,
                      value: a.ticketsSold,
                    }))}
                  />
                )}
              </Panel>

              {/* 5-Week Trend */}
              <Panel
                icon={TrendingUp}
                title="5-Week Trend"
                info="Revenue and booking trends over the last 5 weeks"
              >
                {report.weeklyTrend.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <AreaChart
                    height={220}
                    dark={scheme === "dark"}
                    labels={report.weeklyTrend.map((w) => w.week)}
                    series={withEvents(
                      [
                        {
                          label: "Revenue ($)",
                          color: C_REVENUE,
                          data: report.weeklyTrend.map((w) => w.revenue),
                          axis: "left",
                          area: false,
                        },
                        {
                          label: "Bookings",
                          color: C_BOOKINGS,
                          data: report.weeklyTrend.map((w) => w.bookings),
                          axis: "right",
                          area: false,
                        },
                        {
                          label: "Tickets Sold",
                          color: C_ATTRACTIONS,
                          data: report.weeklyTrend.map((w) => w.tickets),
                          axis: "right",
                          area: false,
                        },
                      ],
                      {
                        label: "Event Tickets",
                        color: C_EVENTS,
                        data: report.weeklyTrend.map((w) => w.eventTickets),
                        axis: "right",
                        area: false,
                      },
                      report.weeklyTrend.some((w) => w.eventTickets > 0),
                    )}
                  />
                )}
              </Panel>

              {/* Time Slot Performance */}
              <Panel
                icon={Clock}
                title="Time Slot Performance"
                info="Revenue, bookings, and ticket sales by hour (only hours with activity)"
              >
                {timeSlots.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  <BarChart
                    height={200}
                    data={timeSlots.map((s) => ({
                      label: s.label,
                      value: s.totalRevenue,
                    }))}
                  />
                )}
              </Panel>

              {/* Package Bookings table */}
              <TableCard
                icon={Package}
                title="Package Bookings"
                columns={[
                  ["Package", 0],
                  ["Bookings", 72],
                  ["Participants", 88],
                ]}
                rows={report.packagePerformance.map((p) => [
                  p.name,
                  count(p.bookings),
                  count(p.avgPartySize),
                ])}
                empty="No data."
              />

              {/* Attraction Ticket Sales table */}
              <TableCard
                icon={Ticket}
                title="Attraction Ticket Sales"
                columns={[
                  ["Attraction", 0],
                  ["Tickets Sold", 80],
                  ["Revenue", 96],
                ]}
                rows={report.attractionPerformance.map((a) => [
                  a.name,
                  count(a.ticketsSold),
                  money(a.revenue),
                ])}
                empty="No data."
              />

              {/* Event Performance — only rendered when the backend returns
                  any, the same condition the web card uses. */}
              {report.eventPerformance.length > 0 && (
                <TableCard
                  icon={CalendarDays}
                  title="Event Performance"
                  columns={[
                    ["Event", 0],
                    ["Purchases", 68],
                    ["Tickets", 60],
                    ["Revenue", 84],
                  ]}
                  rows={report.eventPerformance.map((e) => [
                    e.name,
                    count(e.purchases),
                    count(e.ticketsSold),
                    money(e.revenue),
                  ])}
                  empty="No data."
                />
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Export Analytics — the web's export modal (period, sections, format) */}
      <BottomSheet
        visible={showExport}
        onClose={() => setShowExport(false)}
        title={
          report ? `Export Analytics - ${report.location.name}` : "Export Analytics"
        }
        subtitle={rangeLabel}
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Include in Export
          </Text>
          <View className="border border-gray-200 dark:border-neutral-800 rounded-xl p-2 mb-5">
            {EXPORT_SECTIONS.map((section) => {
              const on = sections.includes(section.id);
              return (
                <Pressable
                  key={section.id}
                  onPress={() => toggleSection(section.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  className="flex-row items-center gap-3 px-2 py-3"
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
                  <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1">
                    {section.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Export Format
          </Text>
          <View className="flex-row gap-3 mb-6">
            {EXPORT_FORMATS.map((f) => {
              const on = exportFormat === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => setExportFormat(f.value as "json" | "csv")}
                  className={`flex-1 py-3 rounded-xl border items-center ${
                    on
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      on ? "text-white" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-stretch gap-3 pt-4 border-t border-gray-100 dark:border-neutral-800">
            <Pressable
              onPress={() => setShowExport(false)}
              className="flex-1 h-12 rounded-xl items-center justify-center border border-gray-200 dark:border-neutral-700 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={runExport}
              disabled={exporting || sections.length === 0}
              className={`flex-1 h-12 rounded-xl flex-row items-center justify-center gap-2 bg-[#0644C7] ${
                exporting || sections.length === 0
                  ? "opacity-60"
                  : "active:opacity-90"
              }`}
            >
              {!exporting && (
                <Feather name="download" size={16} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">
                {exporting ? "Exporting..." : "Export Data"}
              </Text>
            </Pressable>
          </View>
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
}
