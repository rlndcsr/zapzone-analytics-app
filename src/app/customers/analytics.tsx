import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AnalyticsPanel,
  PanelEmpty,
  RankedList,
  RecentCustomerList,
  SectionLabel,
  StatusCounts,
  TopTable,
  ValueSegments,
} from "../../components/analytics/CustomerAnalyticsBlocks";
import {
  AnalyticsExportSheet,
  DEFAULT_ANALYTICS_EXPORT,
  type AnalyticsExportValues,
} from "../../components/ui/AnalyticsExportSheet";
import { AreaChart } from "../../components/ui/AreaChart";
import { BarChart } from "../../components/ui/BarChart";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import {
  FilterChip,
  ListErrorBanner,
  SummaryPanel,
  type SummaryFigure,
} from "../../components/ui/SummaryPanel";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import {
  analyticsViewState,
  exportBlockReason,
  formatClockTime,
  formatMoney,
  formatNumber,
  kpiDisplay,
  PERIOD_PRESETS,
  periodLabel,
  queryKey,
  rankedRows,
  segmentRows,
  statusRows,
  type AnalyticsQuery,
} from "../../lib/customers/customerAnalyticsDisplay";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken, useCurrentUserRole } from "../../lib/session";
import {
  exportCustomerAnalytics,
  fetchCustomerAnalytics,
  type CustomerAnalytics,
  type CustomerDateRange,
} from "../../services/customersService";

const PRIMARY = "#0644C7";

/** Icon per KPI label; an unknown label falls back to a chart glyph. */
const KPI_ICON: Record<string, FeatherIconName> = {
  "Total Customers": "users",
  "Active Customers": "activity",
  "Total Revenue": "dollar-sign",
  "Repeat Rate": "repeat",
  "Avg. Revenue/Customer": "credit-card",
  "New Customers (30d)": "user-plus",
};

/** What a successful load was for, so the screen can label its figures truthfully. */
type Loaded = { key: string; period: string; location?: string; at: Date };

// The web admin's explanations of each chart.
const INFO = {
  growth: "Tracks your customer count month by month. Shows how your customer base is growing.",
  revenue: "Monthly revenue and total bookings. Helps correlate booking volume with revenue.",
  repeat: "Percentage of each month's customers who had booked before. Higher means better loyalty.",
  bookingTime: "Which hours of the day customers' bookings are for. Helps identify peak times.",
  activity: "When customers make their bookings. Helps plan staffing and promotions.",
  status: "Customers by activity: Active (booked in the last 30 days), Inactive (booked more than 30 days ago) and New (new in the last 30 days).",
  segments: "Customers by total spend: High Value ($1,000+), Medium Value ($500–$999) and Low Value (under $500).",
  bookers: "Your most frequent customers by number of bookings.",
  activities: "The attractions your customers buy most, by customer.",
  packages: "The packages your customers book most, by customer.",
  events: "The events your customers buy most, by customer.",
  recent: "Recent customers with join date, spend, booking count and last activity.",
};

const CustomersAnalytics = () => {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";

  const user = getCurrentUser();
  const role = useCurrentUserRole();
  const isCompanyAdmin = role === "company_admin";

  // Scope to the global workspace location (company_admin); managers stay
  // backend-scoped. Reactive so switching location refetches server-side.
  const activeLocation = useActiveLocation();
  const activeLocationId = activeLocation.id === "all" ? undefined : activeLocation.id;

  // What the figures and the export cover. Company admins follow the
  // workspace location; everyone else is held to their own by the server.
  const scopeLabel = isCompanyAdmin
    ? activeLocation.id === "all"
      ? "All locations"
      : activeLocation.name
    : "Your current location";

  const [dateRange, setDateRange] = useState<CustomerDateRange>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [showDateSheet, setShowDateSheet] = useState(false);

  const [data, setData] = useState<CustomerAnalytics | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Export sheet — its own date range, separate from the one on screen.
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [showExportRangeSheet, setShowExportRangeSheet] = useState(false);
  const [exportValues, setExportValues] = useState<AnalyticsExportValues>(
    DEFAULT_ANALYTICS_EXPORT,
  );
  const [exporting, setExporting] = useState(false);

  const query: AnalyticsQuery = useMemo(
    () => ({ dateRange, start: customStart, end: customEnd, locationId: activeLocationId }),
    [dateRange, customStart, customEnd, activeLocationId],
  );
  const currentKey = queryKey(query);

  // Bumped per load, so changing the range quickly shows the last choice's
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
    // Custom range needs both endpoints before we query.
    if (query.dateRange === "custom" && (!query.start || !query.end)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCustomerAnalytics({
        token,
        userId: user?.id,
        dateRange: query.dateRange,
        startDate: query.start,
        endDate: query.end,
        locationId: query.locationId,
      });
      if (isCurrent()) {
        setData(res);
        setLoaded({
          key: queryKey(query),
          period: periodLabel(query),
          location: isCompanyAdmin ? scopeLabel : undefined,
          at: new Date(),
        });
      }
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [query, user?.id, isCompanyAdmin, scopeLabel]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const view = analyticsViewState({
    loading,
    error,
    hasData: !!data,
    loadedKey: loaded?.key ?? null,
    currentKey,
  });

  // The calendar is a native sheet too, so close the export sheet first.
  const openExportRange = useCallback(() => {
    setShowExportSheet(false);
    setTimeout(() => setShowExportRangeSheet(true), 280);
  }, []);
  const closeExportRange = useCallback(() => {
    setShowExportRangeSheet(false);
    setTimeout(() => setShowExportSheet(true), 280);
  }, []);
  const applyExportRange = useCallback((start: string, end: string) => {
    setExportValues((v) => ({ ...v, start, end }));
    setShowExportRangeSheet(false);
    setTimeout(() => setShowExportSheet(true), 280);
  }, []);

  // Ask the server for the file, save it, then open the share sheet.
  const runExport = useCallback(async () => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to export.");
      return;
    }
    // The sheet already disables Export in these cases; this is a backstop.
    const blocked = exportBlockReason(exportValues);
    if (blocked) {
      Alert.alert("Can't export yet", blocked);
      return;
    }
    setExporting(true);
    try {
      const file = await exportCustomerAnalytics({
        token,
        userId: user?.id,
        format: exportValues.format,
        sections: exportValues.sections,
        dateRange: exportValues.dateRange,
        startDate: exportValues.start || undefined,
        endDate: exportValues.end || undefined,
        locationId: activeLocationId ?? null,
      });

      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const uri = `${FileSystem.cacheDirectory}${file.filename}`;
      await FileSystem.writeAsStringAsync(uri, file.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: "Export Analytics" });
      } else {
        Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      }
      setShowExportSheet(false);
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Failed to export analytics. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }, [exportValues, user?.id, activeLocationId]);

  const figures: SummaryFigure[] = (data?.kpis ?? []).map((k) => {
    const d = kpiDisplay(k);
    return {
      icon: KPI_ICON[k.label] ?? "bar-chart-2",
      title: k.label,
      value: k.value,
      hint: d.comparison,
      delta: d.delta ? { text: d.delta, tone: d.tone } : undefined,
      info: d.info,
    };
  });

  const customChipLabel =
    customStart && customEnd
      ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
      : "Custom";
  const loadedPeriod = loaded?.period ?? periodLabel(query);
  const monthsSpan = (n: number) => (n > 0 ? `Last ${n} ${n === 1 ? "month" : "months"}` : undefined);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Customer Analytics"
        action={{
          onPress: () => {
            if (!exporting) setShowExportSheet(true);
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
          {/* Period — presets as chips; Custom opens the calendar and only
              takes effect once both dates are picked. */}
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
                  selected={dateRange === p.value}
                  onPress={() => setDateRange(p.value)}
                />
              ))}
              <FilterChip
                label={customChipLabel}
                selected={dateRange === "custom"}
                onPress={() => setShowDateSheet(true)}
              />
            </ScrollView>

            {view.body === "content" && loaded && (
              <PeriodCaption
                stale={view.stale}
                updating={view.updating && !refreshing}
                shownPeriod={loadedPeriod}
                requestedPeriod={periodLabel(query)}
                location={loaded.location}
                updatedAt={formatClockTime(loaded.at)}
              />
            )}
          </View>

          {view.body === "skeleton" && <AnalyticsSkeleton tiles={6} panels={4} />}

          {view.body === "error" && (
            <ListErrorBanner
              title="Couldn't load customer analytics"
              message={error ?? "Something went wrong."}
              onRetry={load}
            />
          )}

          {view.banner && (
            <ListErrorBanner
              title={view.stale ? `Couldn't load ${periodLabel(query)}` : "Couldn't refresh analytics"}
              message={
                view.stale
                  ? `${error} The figures below are still for ${loadedPeriod}.`
                  : `${error} Showing the figures from ${loaded ? formatClockTime(loaded.at) : "earlier"}.`
              }
              onRetry={load}
            />
          )}

          {view.body === "content" && data && (
            // Figures for another period or location are dimmed and can't be
            // tapped, so they can't pass for the selection above.
            <View
              style={{ opacity: view.stale ? 0.45 : 1 }}
              pointerEvents={view.stale ? "none" : "auto"}
              className="gap-4"
            >
              {figures.length > 0 && <SummaryPanel figures={figures} />}

              <SectionLabel title="Trends" />
              <AnalyticsPanel
                icon="trending-up"
                title="Customer Growth"
                subtitle={monthsSpan(data.customerGrowth.length)}
                info={INFO.growth}
              >
                <AreaChart
                  dark={dark}
                  interactive
                  xLabelMode="spaced"
                  formatValue={(v) => formatNumber(v)}
                  labels={data.customerGrowth.map((p) => p.month)}
                  series={[
                    {
                      label: "Total Customers",
                      color: PRIMARY,
                      data: data.customerGrowth.map((p) => p.customers),
                    },
                  ]}
                />
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="dollar-sign"
                title="Revenue & Bookings Trend"
                subtitle={monthsSpan(data.revenueTrend.length)}
                info={INFO.revenue}
              >
                <AreaChart
                  dark={dark}
                  interactive
                  xLabelMode="spaced"
                  formatValue={(v, s) => (s.axis === "right" ? formatNumber(v) : formatMoney(v))}
                  labels={data.revenueTrend.map((p) => p.month)}
                  series={[
                    {
                      label: "Revenue ($)",
                      color: PRIMARY,
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
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="repeat"
                title="Repeat Customer Rate"
                subtitle={monthsSpan(data.repeatCustomers.length)}
                info={INFO.repeat}
              >
                <AreaChart
                  dark={dark}
                  interactive
                  xLabelMode="spaced"
                  formatValue={(v) => `${formatNumber(v)}%`}
                  labels={data.repeatCustomers.map((p) => p.month)}
                  series={[
                    {
                      label: "Repeat Rate %",
                      color: "#8B5CF6",
                      data: data.repeatCustomers.map((p) => p.repeatRate),
                      area: false,
                    },
                  ]}
                />
              </AnalyticsPanel>

              <SectionLabel title="When customers book" detail={loadedPeriod} />
              <AnalyticsPanel icon="clock" title="Booking Time Distribution" info={INFO.bookingTime}>
                {data.bookingTimeDistribution.length === 0 ? (
                  <PanelEmpty message="No bookings in this period." />
                ) : (
                  <BarChart
                    interactive
                    maxXLabels={6}
                    color={PRIMARY}
                    formatValue={(v) => `${formatNumber(v)} ${v === 1 ? "booking" : "bookings"}`}
                    data={data.bookingTimeDistribution.map((d) => ({ label: d.label, value: d.count }))}
                  />
                )}
              </AnalyticsPanel>

              <AnalyticsPanel icon="activity" title="Customer Activity by Hour" info={INFO.activity}>
                {data.activityHours.length === 0 ? (
                  <PanelEmpty message="No bookings in this period." />
                ) : (
                  <BarChart
                    interactive
                    maxXLabels={6}
                    color="#16A34A"
                    formatValue={(v) => `${formatNumber(v)} ${v === 1 ? "booking" : "bookings"}`}
                    data={data.activityHours.map((d) => ({ label: d.label, value: d.count }))}
                  />
                )}
              </AnalyticsPanel>

              <SectionLabel title="Customers" />
              <AnalyticsPanel icon="users" title="Customer Status" info={INFO.status}>
                <StatusCounts rows={statusRows(data.statusDistribution)} />
              </AnalyticsPanel>

              <AnalyticsPanel icon="award" title="Customer Value Segments" info={INFO.segments}>
                <ValueSegments rows={segmentRows(data.lifetimeValue)} />
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="bar-chart-2"
                title="Bookings per Customer"
                subtitle={`Most bookings · ${loadedPeriod}`}
                info={INFO.bookers}
              >
                <RankedList
                  rows={rankedRows(data.bookingsPerCustomer)}
                  unit={["booking", "bookings"]}
                  emptyMessage="No bookings in this period."
                />
              </AnalyticsPanel>

              <AnalyticsPanel icon="user-plus" title="Recent Customers" info={INFO.recent}>
                <RecentCustomerList customers={data.recentCustomers} />
              </AnalyticsPanel>

              <SectionLabel title="Top purchases" detail={loadedPeriod} />
              <AnalyticsPanel icon="target" title="Top 5 Activities by Customer" info={INFO.activities}>
                <TopTable
                  rows={data.topActivities}
                  itemHeader="Activity"
                  countHeader="Purchases"
                  emptyMessage="No activity data available."
                />
              </AnalyticsPanel>
              <AnalyticsPanel icon="package" title="Top 5 Packages by Customer" info={INFO.packages}>
                <TopTable
                  rows={data.topPackages}
                  itemHeader="Package"
                  countHeader="Bookings"
                  emptyMessage="No package data available."
                />
              </AnalyticsPanel>
              {data.topEvents.length > 0 && (
                <AnalyticsPanel icon="calendar" title="Top 5 Events by Customer" info={INFO.events}>
                  <TopTable
                    rows={data.topEvents}
                    itemHeader="Event"
                    countHeader="Purchases"
                    emptyMessage="No event data available."
                  />
                </AnalyticsPanel>
              )}
            </View>
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
          setDateRange("custom");
          setShowDateSheet(false);
        }}
      />

      <AnalyticsExportSheet
        visible={showExportSheet}
        values={exportValues}
        exporting={exporting}
        onChange={setExportValues}
        onClose={() => setShowExportSheet(false)}
        onExport={runExport}
        onOpenCustomRange={openExportRange}
        scopeLabel={scopeLabel}
      />

      {/* Calendar for the export's own custom range. */}
      <DateRangeSheet
        visible={showExportRangeSheet}
        initialStart={exportValues.start || undefined}
        initialEnd={exportValues.end || undefined}
        onClose={closeExportRange}
        onApply={applyExportRange}
      />
    </View>
  );
};

/**
 * Under the period chips: which period (and, for admins, location) the figures
 * below really cover, and when they loaded. While another period loads, or if
 * it failed, it says the figures are still the old ones.
 */
function PeriodCaption({
  stale,
  updating,
  shownPeriod,
  requestedPeriod,
  location,
  updatedAt,
}: {
  stale: boolean;
  updating: boolean;
  shownPeriod: string;
  requestedPeriod: string;
  location?: string;
  updatedAt: string;
}) {
  if (stale) {
    return (
      // Its own element (not a restyled caption), so no classes change after mount.
      <View
        key="stale"
        className="flex-row items-center gap-2 mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
        accessibilityLiveRegion="polite"
      >
        {updating ? (
          <ActivityIndicator size="small" color="#D97706" />
        ) : (
          <Feather name="clock" size={14} color="#D97706" />
        )}
        <Text className="flex-1 text-xs text-amber-800 dark:text-amber-300">
          {updating ? `Loading ${requestedPeriod}… ` : ""}
          Still showing {shownPeriod}
          {location ? ` · ${location}` : ""}.
        </Text>
      </View>
    );
  }
  return (
    <View key="current" className="flex-row items-center gap-2 mt-3">
      <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
        {shownPeriod}
        {location ? ` · ${location}` : ""}
        {` · Updated ${updatedAt}`}
      </Text>
      {updating && (
        <View className="flex-row items-center gap-1.5">
          <ActivityIndicator size="small" color={PRIMARY} />
          <Text className="text-xs text-gray-500 dark:text-gray-400">Updating</Text>
        </View>
      )}
    </View>
  );
}

export default CustomersAnalytics;
