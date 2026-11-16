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

import {
  AnalyticsPanel,
  PanelEmpty,
  PeriodCaption,
  SectionLabel,
} from "../../components/analytics/CustomerAnalyticsBlocks";
import {
  CompanyExportSheet,
  type CompanyExportValues,
} from "../../components/analytics/CompanyExportSheet";
import LocationManagerAnalytics from "../../components/analytics/LocationManagerAnalytics";
import {
  BreakdownList,
  DataTable,
  metricFigure,
} from "../../components/ui/AnalyticsCards";
import { AreaChart } from "../../components/ui/AreaChart";
import { BarChart } from "../../components/ui/BarChart";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import {
  FilterChip,
  ListErrorBanner,
  SummaryPanel,
  type SummaryFigure,
} from "../../components/ui/SummaryPanel";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import {
  companyExportCsv,
  companyExportJson,
  exportFileName,
} from "../../lib/analytics/companyExport";
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
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchCompanyAnalytics,
  fetchCompanyAnalyticsRaw,
  type PerformanceReport,
} from "../../services/analyticsService";

const PRIMARY = "#0644C7";
const GREEN = "#16A34A";

/** What a successful load was for, so the figures are labelled truthfully. */
type Loaded = { key: string; period: string; locationIds: number[]; at: Date };

/** "All locations" / "3 locations" — which locations a selection covers. */
const scopeOf = (ids: number[], total?: number) =>
  ids.length > 0
    ? `${ids.length} location${ids.length === 1 ? "" : "s"}`
    : total != null && total > 0
      ? `All ${total} location${total === 1 ? "" : "s"}`
      : "All locations";

/** Money on the revenue (left) axis, plain counts on the right. */
const moneyLeft = (v: number, s: { axis?: "left" | "right" }) =>
  s.axis === "right" ? formatNumber(v) : formatMoney(v);

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
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";

  const [range, setRange] = useState<PeriodRange>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * This page's own location filter — a multi-select that goes to the backend as
   * `location_ids[]`, exactly like the web's "Locations" button. Deliberately
   * separate from the global workspace location: the web page scopes analytics
   * on its own, and an empty selection means every location.
   */
  const [showLocations, setShowLocations] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

  // Export sheet — its own copy of the filters, seeded from the screen's when
  // opened, so ticking boxes there doesn't reload the figures behind it.
  const [showExport, setShowExport] = useState(false);
  const [showExportRange, setShowExportRange] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportValues, setExportValues] = useState<CompanyExportValues>({
    range: "30d",
    locationIds: [],
    format: "json",
  });

  const query = useMemo(
    () => ({ dateRange: range, start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );
  // The selection's identity: period plus the (order-free) set of locations.
  const currentKey = `${queryKey(query)}|${[...selectedLocationIds]
    .sort((a, b) => a - b)
    .join(",")}`;

  // Bumped per load, so ticking several locations (or changing the period) in
  // quick succession shows the last selection's figures, not the slowest reply's.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    const token = getToken();
    const companyId = getCurrentUser()?.company_id;
    if (!token || companyId == null) {
      setError("Company analytics are unavailable for this account.");
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
      const next = await fetchCompanyAnalytics({
        token,
        companyId,
        dateRange: query.dateRange,
        locationIds: selectedLocationIds,
        startDate: query.start,
        endDate: query.end,
      });
      if (isCurrent()) {
        setReport(next);
        setLoaded({
          key: currentKey,
          period: periodLabel(query),
          locationIds: selectedLocationIds,
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
  }, [query, selectedLocationIds, currentKey]);

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

  // Opens on what the screen shows; the format is remembered between exports.
  const openExport = () => {
    if (!report || exporting) return;
    setExportValues((v) => ({
      range,
      start: customStart,
      end: customEnd,
      locationIds: selectedLocationIds,
      format: v.format,
    }));
    setShowExport(true);
  };

  // The calendar is a native sheet too, so close the export sheet first.
  const openExportRange = useCallback(() => {
    setShowExport(false);
    setTimeout(() => setShowExportRange(true), 280);
  }, []);
  const closeExportRange = useCallback(() => {
    setShowExportRange(false);
    setTimeout(() => setShowExport(true), 280);
  }, []);
  const applyExportRange = useCallback((start: string, end: string) => {
    setExportValues((v) => ({ ...v, range: "custom", start, end }));
    setShowExportRange(false);
    setTimeout(() => setShowExport(true), 280);
  }, []);

  /**
   * Builds the file from the company report for the sheet's period and
   * locations (the backend's company export can't — see companyExport.ts),
   * saves it, then opens the share sheet.
   */
  const runExport = useCallback(async () => {
    const token = getToken();
    const companyId = getCurrentUser()?.company_id;
    if (!token || companyId == null) {
      Alert.alert("Export Analytics", "Your account is not linked to a company.");
      return;
    }
    const v = exportValues;
    if (v.range === "custom" && (!v.start || !v.end)) {
      Alert.alert(
        "Export Analytics",
        "Please select both start and end dates for custom range.",
      );
      return;
    }
    setExporting(true);
    try {
      const raw = await fetchCompanyAnalyticsRaw({
        token,
        companyId,
        dateRange: v.range,
        locationIds: v.locationIds,
        startDate: v.start,
        endDate: v.end,
      });
      const now = new Date();
      const generatedAt = now.toISOString();
      const scope =
        v.locationIds.length === 0
          ? "All locations"
          : v.locationIds
              .map((id) => allLocations.find((l) => l.id === id)?.name ?? `Location #${id}`)
              .join("; ");
      const body =
        v.format === "csv"
          ? companyExportCsv(raw, generatedAt, scope)
          : companyExportJson(raw, generatedAt);
      const companyName = report?.company.name ?? "";

      // Lazy-loaded so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const uri = `${FileSystem.cacheDirectory}${exportFileName(companyName, now, v.format)}`;
      await FileSystem.writeAsStringAsync(uri, body, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: v.format === "csv" ? "text/csv" : "application/json",
          dialogTitle: companyName ? `Export Analytics - ${companyName}` : "Export Analytics",
        });
      } else {
        Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      }
      setShowExport(false);
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Failed to export analytics. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }, [exportValues, allLocations, report]);

  const totalLocations = report?.company.totalLocations;
  const requestedScope = scopeOf(selectedLocationIds, totalLocations);
  const shownScope = loaded ? scopeOf(loaded.locationIds, totalLocations) : requestedScope;
  const shownPeriod = loaded?.period ?? periodLabel(query);

  const customChipLabel =
    customStart && customEnd
      ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
      : "Custom";

  const figures: SummaryFigure[] = report
    ? ((): SummaryFigure[] => {
        const k = report.keyMetrics;
        return [
          metricFigure("dollar-sign", "Total Revenue", formatMoney(k.totalRevenue.value), k.totalRevenue),
          metricFigure("map-pin", "Total Locations", formatNumber(k.totalLocations.value), k.totalLocations),
          metricFigure("package", "Package Bookings", formatNumber(k.packageBookings.value), k.packageBookings),
          metricFigure("tag", "Ticket Purchases", formatNumber(k.ticketPurchases.value), k.ticketPurchases),
          metricFigure("users", "Total Participants", formatNumber(k.totalParticipants.value), k.totalParticipants),
          metricFigure("layers", "Active Packages", formatNumber(k.activePackages.value), k.activePackages),
          // Event Tickets / Active Events only appear when the backend sends
          // them, exactly as the web conditions those two cards.
          ...(k.eventTicketPurchases
            ? [metricFigure("calendar", "Event Tickets", formatNumber(k.eventTicketPurchases.value), k.eventTicketPurchases)]
            : []),
          ...(k.activeEvents
            ? [metricFigure("calendar", "Active Events", formatNumber(k.activeEvents.value), k.activeEvents)]
            : []),
        ];
      })()
    : [];

  const waiverFigures: SummaryFigure[] = report?.waivers
    ? ((): SummaryFigure[] => {
        const w = report.waivers.summary;
        return [
          {
            icon: "file-text",
            title: "Waivers Signed",
            value: formatNumber(w.completed),
            hint: `${formatNumber(w.total)} total · ${formatNumber(w.pending)} pending`,
          },
          {
            icon: "user",
            title: "Adults / Minors",
            value: `${formatNumber(w.adultSigners)} / ${formatNumber(w.minorsCovered)}`,
            hint: `${formatNumber(w.peopleCovered)} people covered`,
          },
          {
            icon: "user-check",
            title: "Checked In",
            value: formatNumber(w.checkedIn),
            hint: `${formatNumber(w.signedNotCheckedIn)} signed, not checked in`,
          },
        ];
      })()
    : [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Performance Analytics"
        action={{
          onPress: openExport,
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
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {report?.company.name
              ? `${report.company.name} · revenue, bookings and locations`
              : "Revenue, bookings and location performance"}
          </Text>

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

            {/* This page's own location filter (the web's Locations button). */}
            <Pressable
              onPress={() => setShowLocations(true)}
              className="mt-3 h-11 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel={`Locations, ${requestedScope}`}
            >
              <Feather name="map-pin" size={16} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="flex-1 text-sm text-gray-900 dark:text-white"
              >
                {requestedScope}
              </Text>
              <Feather name="chevron-down" size={16} color="#9CA3AF" />
            </Pressable>

            {view.body === "content" && loaded && (
              <PeriodCaption
                stale={view.stale}
                updating={view.updating && !refreshing}
                shownPeriod={shownPeriod}
                requestedPeriod={`${periodLabel(query)} · ${requestedScope}`}
                location={shownScope}
                updatedAt={formatClockTime(loaded.at)}
              />
            )}
          </View>

          {view.body === "skeleton" && <AnalyticsSkeleton tiles={6} panels={4} />}

          {view.body === "error" && (
            <ListErrorBanner
              title="Couldn't load performance analytics"
              message={error ?? "Something went wrong."}
              onRetry={() => void load()}
            />
          )}

          {view.banner && (
            <ListErrorBanner
              title={view.stale ? "Couldn't load that selection" : "Couldn't refresh analytics"}
              message={
                view.stale
                  ? `${error} The figures below are still for ${shownPeriod} · ${shownScope}.`
                  : `${error} Showing the figures from ${loaded ? formatClockTime(loaded.at) : "earlier"}.`
              }
              onRetry={() => void load()}
            />
          )}

          {view.body === "content" && report && (
            // Figures for another period or set of locations are dimmed and
            // can't be tapped, so they can't pass for the selection above.
            <View
              style={{ opacity: view.stale ? 0.45 : 1 }}
              pointerEvents={view.stale ? "none" : "auto"}
              className="gap-4"
            >
              {/* Every key-metric card in one panel, waivers included, in the
                  web's order. */}
              <SummaryPanel figures={[...figures, ...waiverFigures]} />

              <SectionLabel title="Revenue & bookings" />
              <AnalyticsPanel
                icon="trending-up"
                title="Revenue & Package Bookings"
                info="Total revenue and package booking trends across all locations. Revenue includes both packages and attraction tickets."
              >
                <AreaChart
                  dark={dark}
                  interactive
                  xLabelMode="spaced"
                  formatValue={moneyLeft}
                  labels={report.revenueTrend.map((r) => r.label)}
                  series={[
                    {
                      label: "Revenue ($)",
                      color: PRIMARY,
                      data: report.revenueTrend.map((r) => r.revenue),
                      axis: "left",
                      area: false,
                    },
                    {
                      label: "Bookings",
                      color: GREEN,
                      data: report.revenueTrend.map((r) => r.bookings),
                      axis: "right",
                      area: false,
                    },
                  ]}
                />
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="activity"
                title="Daily Performance (7 Days)"
                info="Revenue and participant trends over the last week"
              >
                <AreaChart
                  dark={dark}
                  interactive
                  xLabelMode="spaced"
                  formatValue={moneyLeft}
                  labels={report.dailyPerformance.map((d) => d.day.slice(0, 3))}
                  series={[
                    {
                      label: "Revenue ($)",
                      color: PRIMARY,
                      data: report.dailyPerformance.map((d) => d.revenue),
                      axis: "left",
                      area: true,
                    },
                    {
                      label: "Participants",
                      color: GREEN,
                      data: report.dailyPerformance.map((d) => d.participants),
                      axis: "right",
                      area: true,
                    },
                  ]}
                />
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="clock"
                title="Peak Activity Hours"
                info="Hourly activity patterns for package bookings and ticket purchases across all locations"
              >
                {report.peakHours.length === 0 ? (
                  <PanelEmpty message="No activity in this period." />
                ) : (
                  <BarChart
                    interactive
                    maxXLabels={6}
                    color={PRIMARY}
                    formatValue={formatNumber}
                    data={report.peakHours.map((h) => ({ label: h.hour, value: h.count }))}
                  />
                )}
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="package"
                title="Package Distribution"
                info="Distribution of package bookings by type. Packages are group experiences that can be reserved in advance."
              >
                <BreakdownList
                  emptyMessage="No package bookings in this period."
                  parts={report.packageDistribution.map((p) => ({
                    label: p.name,
                    value: p.count,
                    color: p.color,
                  }))}
                />
              </AnalyticsPanel>

              <AnalyticsPanel
                icon="check-circle"
                title="Booking Status"
                info="Current status of all bookings"
              >
                <BreakdownList
                  emptyMessage="No bookings in this period."
                  parts={report.bookingStatus.map((s) => ({
                    label: s.status,
                    value: s.count,
                    color: s.color,
                  }))}
                />
              </AnalyticsPanel>

              <SectionLabel title="Locations" detail={shownScope} />
              <AnalyticsPanel
                icon="map-pin"
                title="Location Performance"
                info="Revenue comparison across all locations"
              >
                {report.locationPerformance.length === 0 ? (
                  <PanelEmpty message="No location data." />
                ) : (
                  <BarChart
                    interactive
                    color={PRIMARY}
                    formatValue={formatMoney}
                    data={report.locationPerformance.map((l) => ({
                      label: l.name,
                      value: l.revenue,
                    }))}
                  />
                )}
              </AnalyticsPanel>

              {/* The web shows the first 6 rows. */}
              <AnalyticsPanel icon="award" title="Top Locations by Revenue">
                <DataTable
                  columns={[
                    ["Location", 0],
                    ["Revenue", 100],
                    ["Packages", 68],
                  ]}
                  rows={report.locationPerformance
                    .slice(0, 6)
                    .map((l) => [l.name, formatMoney(l.revenue), formatNumber(l.packages)])}
                  emptyMessage="No location data."
                />
              </AnalyticsPanel>

              <SectionLabel title="Top sellers" />
              <AnalyticsPanel icon="tag" title="Top Attractions (Ticket Sales)">
                <DataTable
                  columns={[
                    ["Attraction", 0],
                    ["Tickets Sold", 84],
                    ["Revenue", 100],
                  ]}
                  rows={report.topAttractions.map((a) => [
                    a.name,
                    formatNumber(a.ticketsSold),
                    formatMoney(a.revenue),
                  ])}
                  emptyMessage="No ticket sales in this period."
                />
              </AnalyticsPanel>

              {/* Only when the backend returns any, as the web card does. */}
              {report.topEvents.length > 0 && (
                <AnalyticsPanel icon="calendar" title="Top Events">
                  <DataTable
                    columns={[
                      ["Event", 0],
                      ["Tickets Sold", 84],
                      ["Revenue", 100],
                    ]}
                    rows={report.topEvents.map((e) => [
                      e.name,
                      formatNumber(e.ticketsSold),
                      formatMoney(e.revenue),
                    ])}
                    emptyMessage="No event sales in this period."
                  />
                </AnalyticsPanel>
              )}

              {/* Waivers — hidden when the response omits the block. */}
              {!!report.waivers && (
                <>
                  <SectionLabel title="Waivers" />

                  <AnalyticsPanel
                    icon="file-text"
                    title="Waivers Per Day"
                    info="Waivers created per day across the selected period and locations. Longer ranges are grouped by month."
                  >
                    {report.waivers.perDay.length === 0 ? (
                      <PanelEmpty message="No waivers in this period." />
                    ) : (
                      <AreaChart
                        dark={dark}
                        interactive
                        xLabelMode="spaced"
                        formatValue={(v) => formatNumber(v)}
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
                  </AnalyticsPanel>

                  <AnalyticsPanel
                    icon="users"
                    title="Adult Age Brackets"
                    info="Age distribution of adult signers, computed from the date of birth on signed waivers."
                  >
                    {report.waivers.ageBrackets.length === 0 ? (
                      <PanelEmpty message="No adult signers in this period." />
                    ) : (
                      <BarChart
                        interactive
                        color={PRIMARY}
                        formatValue={formatNumber}
                        data={report.waivers.ageBrackets.map((b) => ({
                          label: b.bracket,
                          value: b.count,
                        }))}
                      />
                    )}
                  </AnalyticsPanel>

                  {/* The backend always returns the four buckets, so an all-zero
                      result means no minors were covered: say so rather than
                      draw four empty bars. */}
                  <AnalyticsPanel
                    icon="user"
                    title="Minor Age Brackets"
                    info="Ages of the minors covered by signed waivers, computed from each minor's date of birth as of the waiver date."
                  >
                    {!report.waivers.minorAgeBrackets.some((b) => b.count > 0) ? (
                      <PanelEmpty message="No minors covered in this period." />
                    ) : (
                      <BarChart
                        interactive
                        color={PRIMARY}
                        formatValue={formatNumber}
                        data={report.waivers.minorAgeBrackets.map((b) => ({
                          label: b.bracket,
                          value: b.count,
                        }))}
                      />
                    )}
                  </AnalyticsPanel>

                  {report.waivers.bySource.length > 0 && (
                    <AnalyticsPanel
                      icon="share-2"
                      title="Waivers by Source"
                      info="Where waivers in the period originated: kiosk, email, SMS, staff-sent, bulk invite, or checkout."
                    >
                      <BreakdownList
                        emptyMessage="No waivers in this period."
                        parts={report.waivers.bySource.map((s) => ({
                          label: s.source,
                          value: s.count,
                          color: s.color,
                        }))}
                      />
                    </AnalyticsPanel>
                  )}
                </>
              )}
            </View>
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

      <CompanyExportSheet
        visible={showExport}
        values={exportValues}
        locations={allLocations}
        exporting={exporting}
        onChange={setExportValues}
        onClose={() => setShowExport(false)}
        onExport={runExport}
        onOpenCustomRange={openExportRange}
      />

      {/* Calendar for the export's own custom range. */}
      <DateRangeSheet
        visible={showExportRange}
        initialStart={exportValues.start}
        initialEnd={exportValues.end}
        onClose={closeExportRange}
        onApply={applyExportRange}
      />

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
};

export default PerformanceAnalytics;
