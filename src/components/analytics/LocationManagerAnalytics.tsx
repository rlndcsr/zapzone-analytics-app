import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { getCurrentUser, getToken } from "../../lib/session";
import {
  analyticsViewState,
  formatClockTime,
  formatMoney,
  formatNumber,
  PERIOD_PRESETS,
  periodLabel,
  queryKey,
  type PeriodRange,
} from "../../lib/customers/customerAnalyticsDisplay";
import {
  exportLocationAnalytics,
  fetchLocationAnalytics,
  type LocationExportSection,
  type LocationReport,
} from "../../services/analyticsService";
import { DataTable, metricFigure } from "../ui/AnalyticsCards";
import { AreaChart, type AreaSeries } from "../ui/AreaChart";
import { BarChart } from "../ui/BarChart";
import { BottomSheet } from "../ui/BottomSheet";
import { DateRangeSheet, formatShortDate } from "../ui/DateRangeSheet";
import { ModuleHeader } from "../ui/ModuleHeader";
import {
  FilterChip,
  ListErrorBanner,
  SummaryPanel,
  type SummaryFigure,
} from "../ui/SummaryPanel";
import { AnalyticsSkeleton } from "../ui/skeleton/AnalyticsSkeleton";
import {
  AnalyticsPanel,
  PanelEmpty,
  PeriodCaption,
  SectionLabel,
} from "./CustomerAnalyticsBlocks";

const PRIMARY = "#0644C7";

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

/** Series colors, matching the web chart legends (revenue in the app's blue). */
const C_REVENUE = PRIMARY;
const C_BOOKINGS = "#10B981";
const C_ATTRACTIONS = "#F59E0B";
const C_EVENTS = "#8B5CF6";

/** What a successful load was for, so the figures are labelled truthfully. */
type Loaded = { key: string; period: string; at: Date };

/** Money on the revenue (left) axis, plain counts on the right. */
const moneyLeft = (v: number, s: { axis?: "left" | "right" }) =>
  s.axis === "right" ? formatNumber(v) : formatMoney(v);

/**
 * The location manager's Performance Analytics — a port of the web's
 * `/manager/analytics` (LocationManagerAnalytics), which is a different report
 * from the company admin's: it is scoped to the manager's own location and has
 * its own metric cards, charts and tables.
 */
export default function LocationManagerAnalytics() {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";

  const [range, setRange] = useState<PeriodRange>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [report, setReport] = useState<LocationReport | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
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

  const query = useMemo(
    () => ({ dateRange: range, start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );
  const currentKey = queryKey(query);

  // Bumped per load, so changing the period quickly shows the last choice's
  // figures, not whichever reply arrived last.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    if (locationId == null) {
      setError(
        "Your account is not assigned to a location. Please contact your company administrator.",
      );
      setLoading(false);
      return;
    }
    // A custom range only makes a request once both ends are picked, as on web.
    if (query.dateRange === "custom" && (!query.start || !query.end)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchLocationAnalytics({
        token,
        locationId,
        dateRange: query.dateRange,
        startDate: query.start,
        endDate: query.end,
      });
      if (isCurrent()) {
        setReport(next);
        setLoaded({ key: currentKey, period: periodLabel(query), at: new Date() });
      }
    } catch (err) {
      if (isCurrent()) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load analytics. Please try again.",
        );
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [locationId, query, currentKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const view = analyticsViewState({
    loading,
    error,
    hasData: !!report,
    loadedKey: loaded?.key ?? null,
    currentKey,
  });

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
        startDate: customStart,
        endDate: customEnd,
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

  const customChipLabel =
    customStart && customEnd
      ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
      : "Custom";
  const shownPeriod = loaded?.period ?? periodLabel(query);

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

  const figures: SummaryFigure[] = report
    ? ((): SummaryFigure[] => {
        const k = report.keyMetrics;
        return [
          metricFigure("dollar-sign", "Location Revenue", formatMoney(k.locationRevenue.value), k.locationRevenue),
          metricFigure("package", "Package Bookings", formatNumber(k.packageBookings.value), k.packageBookings),
          metricFigure("tag", "Ticket Sales", formatNumber(k.ticketSales.value), k.ticketSales),
          metricFigure("users", "Total Visitors", formatNumber(k.totalVisitors.value), k.totalVisitors),
          metricFigure("layers", "Active Packages", formatNumber(k.activePackages.value), k.activePackages),
          metricFigure("activity", "Active Attractions", formatNumber(k.activeAttractions.value), k.activeAttractions),
          // Only when the backend sends them, exactly as the web conditions
          // those cards.
          ...(k.eventTicketSales
            ? [metricFigure("calendar", "Event Ticket Sales", formatNumber(k.eventTicketSales.value), k.eventTicketSales)]
            : []),
          ...(k.activeEvents
            ? [metricFigure("calendar", "Active Events", formatNumber(k.activeEvents.value), k.activeEvents)]
            : []),
        ];
      })()
    : [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Performance Analytics"
        action={{
          onPress: () => {
            if (report && !exporting) setShowExport(true);
          },
          accessibilityLabel: "Export analytics",
          label: "Export",
          icon: "download",
        }}
      />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-4 mt-4 gap-4">
          {/* The web's "Location Analytics - {name}" heading, with the
              location's full address beneath it. */}
          <View>
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              {report?.location.name
                ? `Location Analytics - ${report.location.name}`
                : "Location Analytics"}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {report?.location.fullAddress ||
                "Revenue, bookings and attraction performance"}
            </Text>
          </View>

          {/* Period — the web's period select as chips; Custom opens the
              calendar and only takes effect once both dates are picked. */}
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: 4, gap: 8 }}
              className="-mx-1 px-1"
            >
              {PERIOD_PRESETS.map((p) => (
                <FilterChip
                  key={p.value}
                  label={p.label}
                  selected={range === p.value}
                  onPress={() => setRange(p.value)}
                />
              ))}
              <FilterChip
                label={customChipLabel}
                selected={range === "custom"}
                onPress={() => setShowCustomRange(true)}
              />
            </ScrollView>

            {view.body === "content" && loaded && (
              <PeriodCaption
                stale={view.stale}
                updating={view.updating && !refreshing}
                shownPeriod={shownPeriod}
                requestedPeriod={periodLabel(query)}
                updatedAt={formatClockTime(loaded.at)}
              />
            )}
          </View>

          {view.body === "skeleton" && <AnalyticsSkeleton tiles={6} panels={4} />}

          {view.body === "error" && (
            <ListErrorBanner
              title="Analytics unavailable"
              message={error ?? "Something went wrong."}
              onRetry={() => void load()}
            />
          )}

          {view.banner && (
            <ListErrorBanner
              title={view.stale ? `Couldn't load ${periodLabel(query)}` : "Couldn't refresh analytics"}
              message={
                view.stale
                  ? `${error} The figures below are still for ${shownPeriod}.`
                  : `${error} Showing the figures from ${loaded ? formatClockTime(loaded.at) : "earlier"}.`
              }
              onRetry={() => void load()}
            />
          )}

          {view.body === "content" && report && (
            // Figures for another period are dimmed and can't be tapped, so
            // they can't pass for the selection above.
            <View
              style={{ opacity: view.stale ? 0.45 : 1 }}
              pointerEvents={view.stale ? "none" : "auto"}
              className="gap-4"
            >
              <SummaryPanel figures={figures} />

              <SectionLabel title="Revenue & bookings" />
              <AnalyticsPanel
                icon="clock"
                title="Hourly Revenue Pattern"
                info="Revenue and booking patterns throughout the day (only hours with activity)"
              >
                {hourly.length === 0 ? (
                  <PanelEmpty message="No activity in this period." />
                ) : (
                  <AreaChart
                    dark={dark}
                    interactive
                    xLabelMode="spaced"
                    formatValue={moneyLeft}
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
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="activity"
                title="Daily Performance"
                info="Revenue, bookings, and attraction purchase trends per day"
              >
                {report.dailyRevenue.length === 0 ? (
                  <PanelEmpty message="No activity in this period." />
                ) : (
                  <AreaChart
                    dark={dark}
                    interactive
                    xLabelMode="spaced"
                    formatValue={moneyLeft}
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
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="trending-up"
                title="5-Week Trend"
                info="Revenue and booking trends over the last 5 weeks"
              >
                {report.weeklyTrend.length === 0 ? (
                  <PanelEmpty message="No activity in the last 5 weeks." />
                ) : (
                  <AreaChart
                    dark={dark}
                    interactive
                    xLabelMode="spaced"
                    formatValue={moneyLeft}
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
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="bar-chart-2"
                title="Time Slot Performance"
                info="Revenue, bookings, and ticket sales by hour (only hours with activity)"
              >
                {timeSlots.length === 0 ? (
                  <PanelEmpty message="No activity in this period." />
                ) : (
                  <BarChart
                    interactive
                    maxXLabels={6}
                    color={PRIMARY}
                    formatValue={formatMoney}
                    data={timeSlots.map((s) => ({
                      label: s.label,
                      value: s.totalRevenue,
                    }))}
                  />
                )}
              </AnalyticsPanel>

              {/* Packages — the web's chart and table, in one panel. */}
              <SectionLabel title="Packages" detail={shownPeriod} />
              <AnalyticsPanel
                icon="package"
                title="Package Bookings"
                info="Reserved package bookings by type. Packages are group experiences scheduled in advance."
              >
                {report.packagePerformance.length === 0 ? (
                  <PanelEmpty message="No package bookings in this period." />
                ) : (
                  <>
                    <BarChart
                      interactive
                      color={PRIMARY}
                      formatValue={(v) => `${formatNumber(v)} ${v === 1 ? "booking" : "bookings"}`}
                      data={report.packagePerformance.map((p) => ({
                        label: p.name,
                        value: p.bookings,
                      }))}
                    />
                    <View className="mt-4">
                      <DataTable
                        columns={[
                          ["Package", 0],
                          ["Bookings", 72],
                          ["Participants", 88],
                        ]}
                        rows={report.packagePerformance.map((p) => [
                          p.name,
                          formatNumber(p.bookings),
                          formatNumber(p.avgPartySize),
                        ])}
                        emptyMessage="No package bookings in this period."
                      />
                    </View>
                  </>
                )}
              </AnalyticsPanel>

              {/* Attractions — the web's chart and table, in one panel. */}
              <SectionLabel title="Attractions" detail={shownPeriod} />
              <AnalyticsPanel
                icon="tag"
                title="Attraction Ticket Sales"
                info="Tickets sold and revenue per attraction"
              >
                {report.attractionPerformance.length === 0 ? (
                  <PanelEmpty message="No ticket sales in this period." />
                ) : (
                  <>
                    <BarChart
                      interactive
                      color={C_ATTRACTIONS}
                      formatValue={(v) => `${formatNumber(v)} ${v === 1 ? "ticket" : "tickets"}`}
                      data={report.attractionPerformance.map((a) => ({
                        label: a.name,
                        value: a.ticketsSold,
                      }))}
                    />
                    <View className="mt-4">
                      <DataTable
                        columns={[
                          ["Attraction", 0],
                          ["Tickets Sold", 84],
                          ["Revenue", 100],
                        ]}
                        rows={report.attractionPerformance.map((a) => [
                          a.name,
                          formatNumber(a.ticketsSold),
                          formatMoney(a.revenue),
                        ])}
                        emptyMessage="No ticket sales in this period."
                      />
                    </View>
                  </>
                )}
              </AnalyticsPanel>

              {/* Event Performance — only rendered when the backend returns
                  any, the same condition the web card uses. */}
              {report.eventPerformance.length > 0 && (
                <>
                  <SectionLabel title="Events" detail={shownPeriod} />
                  <AnalyticsPanel icon="calendar" title="Event Performance">
                    <DataTable
                      columns={[
                        ["Event", 0],
                        ["Purchases", 70],
                        ["Tickets", 58],
                        ["Revenue", 96],
                      ]}
                      rows={report.eventPerformance.map((e) => [
                        e.name,
                        formatNumber(e.purchases),
                        formatNumber(e.ticketsSold),
                        formatMoney(e.revenue),
                      ])}
                      emptyMessage="No event sales in this period."
                    />
                  </AnalyticsPanel>
                </>
              )}
            </View>
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
        subtitle={periodLabel(query)}
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

      {/* Custom period calendar, for the "Custom" chip. */}
      <DateRangeSheet
        visible={showCustomRange}
        initialStart={customStart}
        initialEnd={customEnd}
        onClose={() => setShowCustomRange(false)}
        onApply={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
          setRange("custom");
          setShowCustomRange(false);
        }}
      />
    </View>
  );
}
