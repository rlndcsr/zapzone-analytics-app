import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { BreakdownList, DataTable } from "../../components/ui/AnalyticsCards";
import { AreaChart } from "../../components/ui/AreaChart";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { FunnelChart } from "../../components/ui/FunnelChart";
import { ModuleHeader } from "../../components/ui/ModuleHeader";
import {
  FilterChip,
  ListErrorBanner,
  SummaryPanel,
  type SummaryFigure,
} from "../../components/ui/SummaryPanel";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import {
  formatDuration,
  formatPercent,
  formatWhen,
  mergeAttribution,
  pageRange,
  shortDay,
  type AttributionRow,
} from "../../lib/analytics/pageAnalyticsDisplay";
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
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken, useCurrentUserRole } from "../../lib/session";
import {
  fetchAttribution,
  fetchDevices,
  fetchFunnel,
  fetchLandingPages,
  fetchPageLive,
  fetchPageOverview,
  fetchPageTimeseries,
  fetchRecentConversions,
  fetchTopEntities,
  fetchTopPages,
  fetchTrafficSources,
  type ConversionRow,
  type DeviceSlice,
  type FunnelStep,
  type LandingPage,
  type PageLive,
  type PageOverview,
  type TimeseriesPoint,
  type TopEntity,
  type TopPage,
  type TrafficSources,
} from "../../services/analyticsService";

const PRIMARY = "#0644C7";
const AMBER = "#F59E0B";
const GREEN = "#16A34A";

type DeviceTab = "devices" | "browsers" | "oses";

const DEVICE_TABS: { key: DeviceTab; label: string }[] = [
  { key: "devices", label: "Devices" },
  { key: "browsers", label: "Browsers" },
  { key: "oses", label: "OS" },
];

/** Everything one load brings back, so a period's figures are swapped in together. */
type PageReport = {
  overview: PageOverview;
  live: PageLive | null;
  bucket: string;
  series: TimeseriesPoint[];
  topPages: TopPage[];
  topEntities: TopEntity[];
  sources: TrafficSources | null;
  devices: Record<DeviceTab, DeviceSlice[]>;
  funnel: FunnelStep[];
  landing: LandingPage[];
  conversions: ConversionRow[];
  attribution: AttributionRow[];
};

/** What a successful load was for, so the figures are labelled truthfully. */
type Loaded = { key: string; period: string; scope: string; at: Date };

// The web's ⓘ tooltips for each figure.
const INFO = {
  pageViews: "Total number of page loads across all tracked booking pages in the selected period.",
  uniqueVisitors: "Count of distinct visitors identified by browser session or tracking cookie.",
  sessions: "Total visit sessions started. A single visitor can start multiple sessions across different times or devices.",
  conversions: "Number of completed booking events (e.g. form submissions or purchases) recorded in the period.",
  conversionRate: "Conversions ÷ unique visitors × 100. Shows what share of visitors completed a booking.",
  revenue: "Total dollar value attributed to conversion events tracked on your booking pages.",
  bounceRate: "Percentage of visitors who viewed only one page and left without any further interaction.",
  avgDuration: "Average time visitors spent on your pages per session, measured from first to last tracked event.",
  newVisitors: "Visitors seen for the first time in this period — no prior tracking record found.",
  returning: "Visitors who had a tracked session on your pages before the selected date range.",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const PageAnalytics = () => {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";

  const [range, setRange] = useState<PeriodRange>("30d");
  const [customStart, setCustomStart] = useState<string | undefined>();
  const [customEnd, setCustomEnd] = useState<string | undefined>();
  const [showCustomRange, setShowCustomRange] = useState(false);

  // Follows the global location, as the web page does: a company admin's
  // workspace selection, everyone else their own location.
  const activeLocation = useActiveLocation();
  const isCompanyAdmin = useCurrentUserRole() === "company_admin";
  const ownLocationId = getCurrentUser()?.location_id ?? null;
  const locationId: number | null = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : ownLocationId;
  const requestedScope = isCompanyAdmin ? activeLocation.name : "Your location";

  const [report, setReport] = useState<PageReport | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("devices");

  const query = useMemo(
    () => ({ dateRange: range, start: customStart, end: customEnd }),
    [range, customStart, customEnd],
  );
  const currentKey = queryKey({ ...query, locationId: locationId ?? undefined });

  // Bumped per load, so switching period/location quickly shows the last
  // choice's figures, not whichever batch of replies arrived last.
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
    // A custom range only makes a request once both ends are picked.
    if (query.dateRange === "custom" && (!query.start || !query.end)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const loc = locationId ?? undefined;
    const p = { token, ...pageRange(query), locationId: loc };
    try {
      // The overview is required; every other block falls back to empty, so
      // one failing panel never blanks the page.
      const [ov, lv, ts, tp, te, src, dev, fn, lp, cv, attr] = await Promise.all([
        fetchPageOverview(p),
        fetchPageLive({ token, locationId: loc }).catch(() => null),
        fetchPageTimeseries(p).catch(() => ({ bucket: "day", series: [] })),
        fetchTopPages(p).catch(() => []),
        fetchTopEntities(p).catch(() => []),
        fetchTrafficSources(p).catch(() => null),
        fetchDevices(p).catch(() => ({ devices: [], browsers: [], oses: [] })),
        fetchFunnel(p).catch(() => []),
        fetchLandingPages(p).catch(() => []),
        fetchRecentConversions(p).catch(() => []),
        fetchAttribution(p).catch(() => ({ firstTouch: [], lastTouch: [] })),
      ]);
      if (!isCurrent()) return;
      setReport({
        overview: ov,
        live: lv,
        bucket: ts.bucket,
        series: ts.series,
        topPages: tp,
        topEntities: te,
        sources: src,
        devices: dev,
        funnel: fn,
        landing: lp,
        conversions: cv,
        attribution: mergeAttribution(attr.firstTouch, attr.lastTouch),
      });
      setLoaded({
        key: currentKey,
        period: periodLabel(query),
        scope: requestedScope,
        at: new Date(),
      });
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [query, locationId, currentKey, requestedScope]);

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

  const shownPeriod = loaded?.period ?? periodLabel(query);
  const shownScope = loaded?.scope ?? requestedScope;
  const customChipLabel =
    customStart && customEnd
      ? `${formatShortDate(customStart)} – ${formatShortDate(customEnd)}`
      : "Custom";

  const figures: SummaryFigure[] = report
    ? ((): SummaryFigure[] => {
        const o = report.overview;
        return [
          { icon: "eye", title: "Page views", value: formatNumber(o.pageViews), hint: "", info: INFO.pageViews },
          { icon: "users", title: "Unique visitors", value: formatNumber(o.uniqueVisitors), hint: "", info: INFO.uniqueVisitors },
          { icon: "repeat", title: "Sessions", value: formatNumber(o.sessions), hint: "", info: INFO.sessions },
          { icon: "mouse-pointer", title: "Conversions", value: formatNumber(o.conversions), hint: "", info: INFO.conversions },
          { icon: "trending-up", title: "Conv. rate", value: `${formatNumber(o.conversionRate)}%`, hint: "", info: INFO.conversionRate },
          { icon: "dollar-sign", title: "Revenue", value: formatMoney(o.conversionValue), hint: "", info: INFO.revenue },
          { icon: "corner-up-right", title: "Bounce rate", value: `${formatNumber(o.bounceRate)}%`, hint: "", info: INFO.bounceRate },
          { icon: "clock", title: "Avg duration", value: formatDuration(o.avgDurationMs), hint: "", info: INFO.avgDuration },
          { icon: "user-plus", title: "New visitors", value: formatNumber(o.newVisitors), hint: "", info: INFO.newVisitors },
          { icon: "user-check", title: "Returning", value: formatNumber(o.returningVisitors), hint: "", info: INFO.returning },
        ];
      })()
    : [];

  const liveVisitors = report?.live?.activeVisitors ?? 0;
  const liveSessions = report?.live?.activeSessions ?? 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Page Analytics"
        action={{
          onPress: () => void load(),
          accessibilityLabel: "Refresh page analytics",
          label: "Refresh",
          icon: "refresh-cw",
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
            Visitors, engagement and conversions across your booking pages
          </Text>

          {/* Period chips (the web's period select) + location. */}
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
                requestedPeriod={`${periodLabel(query)} · ${requestedScope}`}
                location={shownScope}
                updatedAt={formatClockTime(loaded.at)}
              />
            )}
          </View>

          {view.body === "skeleton" && <AnalyticsSkeleton tiles={10} panels={3} />}

          {view.body === "error" && (
            <ListErrorBanner
              title="Page Analytics unavailable"
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
            // Figures for another period or location are dimmed and can't be
            // tapped, so they can't pass for the selection above.
            <View
              style={{ opacity: view.stale ? 0.45 : 1 }}
              pointerEvents={view.stale ? "none" : "auto"}
              className="gap-4"
            >
              {/* Right now */}
              <View className="flex-row items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                <View className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  Right now
                </Text>
                <Text className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatNumber(liveVisitors)}
                </Text>
                <Text numberOfLines={1} className="flex-1 text-sm text-gray-500 dark:text-gray-400">
                  {plural(liveVisitors, "visitor", "visitors")} · {formatNumber(liveSessions)}{" "}
                  {plural(liveSessions, "session", "sessions")}
                </Text>
              </View>

              <SummaryPanel figures={figures} />

              <SectionLabel title="Traffic" />
              <AnalyticsPanel
                icon="activity"
                title="Traffic & conversions"
                subtitle={`Bucket: ${report.bucket}`}
              >
                {report.series.length === 0 ? (
                  <PanelEmpty message="No traffic in this period." />
                ) : (
                  <AreaChart
                    dark={dark}
                    interactive
                    xLabelMode="spaced"
                    formatValue={(v, s) => (s.axis === "right" ? formatMoney(v) : formatNumber(v))}
                    labels={report.series.map((s) => shortDay(s.bucket))}
                    series={[
                      { label: "Page views", color: PRIMARY, data: report.series.map((s) => s.views), axis: "left" },
                      { label: "Conversions", color: AMBER, data: report.series.map((s) => s.conversions), axis: "left", area: false },
                      { label: "Revenue ($)", color: GREEN, data: report.series.map((s) => s.revenue), axis: "right" },
                    ]}
                  />
                )}
              </AnalyticsPanel>

              <AnalyticsPanel icon="filter" title="Funnel" subtitle="View → engage → convert">
                {report.funnel.length === 0 ? (
                  <PanelEmpty message="No funnel data in this period." />
                ) : (
                  <FunnelChart
                    color={PRIMARY}
                    data={report.funnel.map((f) => ({ label: f.label, value: f.visitors }))}
                  />
                )}
              </AnalyticsPanel>

              <SectionLabel title="Pages" detail={shownPeriod} />
              <AnalyticsPanel icon="file-text" title="Top pages">
                <DataTable
                  columns={[
                    ["Path", 0],
                    ["Views", 56],
                    ["Conv.", 48],
                    ["Revenue", 84],
                  ]}
                  rows={report.topPages.slice(0, 10).map((p) => [
                    p.path || "—",
                    formatNumber(p.views),
                    formatNumber(p.conversions),
                    formatMoney(p.revenue),
                  ])}
                  emptyMessage="No page views in this period."
                />
              </AnalyticsPanel>

              <AnalyticsPanel icon="grid" title="Top entities">
                <DataTable
                  columns={[
                    ["Name", 0],
                    ["Views", 56],
                    ["Conv.", 48],
                    ["Rate", 60],
                  ]}
                  rows={report.topEntities.slice(0, 10).map((e) => [
                    e.name,
                    formatNumber(e.views),
                    formatNumber(e.conversions),
                    formatPercent(e.rate),
                  ])}
                  emptyMessage="No entity views in this period."
                />
              </AnalyticsPanel>

              <AnalyticsPanel icon="log-in" title="Top landing pages">
                <DataTable
                  columns={[
                    ["Path", 0],
                    ["Entries", 60],
                    ["Bounce", 60],
                    ["Conv.", 48],
                  ]}
                  rows={report.landing.slice(0, 10).map((l) => [
                    l.path || "—",
                    formatNumber(l.sessions),
                    formatPercent(l.bounceRate),
                    formatNumber(l.conversions),
                  ])}
                  emptyMessage="No landing pages in this period."
                />
              </AnalyticsPanel>

              <SectionLabel title="Audience" detail={shownPeriod} />
              <AnalyticsPanel icon="smartphone" title="Devices">
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {DEVICE_TABS.map((t) => (
                    <FilterChip
                      key={t.key}
                      label={t.label}
                      selected={deviceTab === t.key}
                      onPress={() => setDeviceTab(t.key)}
                    />
                  ))}
                </View>
                <BreakdownList
                  emptyMessage="No visits in this period."
                  parts={(report.devices[deviceTab] ?? []).map((d) => ({
                    label: d.label,
                    value: d.views,
                  }))}
                />
              </AnalyticsPanel>

              <AnalyticsPanel icon="globe" title="Traffic sources">
                {!report.sources ? (
                  <PanelEmpty message="No traffic source data." />
                ) : (
                  <>
                    <DataTable
                      columns={[
                        ["Source", 0],
                        ["Visits", 56],
                        ["Conv.", 48],
                        ["Revenue", 84],
                      ]}
                      rows={[
                        ...report.sources.utm.map((s) => [
                          [s.source, s.medium, s.campaign].filter((x) => x !== "—").join(" / ") || "—",
                          formatNumber(s.views),
                          formatNumber(s.conversions),
                          formatMoney(s.revenue),
                        ]),
                        [
                          "Direct",
                          formatNumber(report.sources.direct.visits),
                          formatNumber(report.sources.direct.conversions),
                          formatMoney(report.sources.direct.revenue),
                        ],
                      ]}
                      emptyMessage="No traffic source data."
                    />
                    {report.sources.referrers.length > 0 && (
                      <View className="mt-4">
                        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                          Referrers
                        </Text>
                        <DataTable
                          columns={[
                            ["Referrer", 0],
                            ["Visits", 56],
                          ]}
                          rows={report.sources.referrers
                            .slice(0, 12)
                            .map((r) => [r.referrer || "—", formatNumber(r.visits)])}
                          emptyMessage="No referrers."
                        />
                      </View>
                    )}
                  </>
                )}
              </AnalyticsPanel>

              <SectionLabel title="Conversions" detail={shownPeriod} />
              {/* Only when there is any, as on the web. */}
              {report.attribution.length > 0 && (
                <AnalyticsPanel
                  icon="star"
                  title="Attribution"
                  subtitle="First-touch vs last-touch revenue"
                  info="Revenue from conversions, credited to the source a visitor first came from (first touch) and to the source of the visit they converted on (last touch)."
                >
                  <AttributionBars rows={report.attribution} />
                </AnalyticsPanel>
              )}

              <AnalyticsPanel icon="check-circle" title="Recent Conversions">
                {report.conversions.length === 0 ? (
                  <PanelEmpty message="No conversions in this period." />
                ) : (
                  report.conversions.slice(0, 15).map((c, i) => (
                    <View
                      key={i}
                      className={`py-3 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
                    >
                      <View className="flex-row items-start justify-between gap-2">
                        <Text className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">
                          {c.entity}
                        </Text>
                        <Text className="text-sm font-semibold text-green-600 dark:text-green-400">
                          {formatMoney(c.value)}
                        </Text>
                      </View>
                      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {c.event} · {formatWhen(c.when)}
                      </Text>
                      {(c.utmSource !== "—" || c.utmCampaign !== "—") && (
                        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          UTM {c.utmSource}
                          {c.utmCampaign !== "—" ? ` · ${c.utmCampaign}` : ""}
                        </Text>
                      )}
                    </View>
                  ))
                )}
              </AnalyticsPanel>
            </View>
          )}
        </View>
      </ScrollView>

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

/**
 * First- and last-touch revenue per source: a legend, then each source with
 * its two bars, scaled to the largest figure, and the exact amounts.
 */
function AttributionBars({ rows }: { rows: AttributionRow[] }) {
  const max = Math.max(...rows.flatMap((r) => [r.firstTouch, r.lastTouch]), 0) || 1;
  const bar = (value: number, color: string, label: string) => (
    <View className="flex-row items-center gap-2 mt-1.5" accessibilityLabel={`${label} ${formatMoney(value)}`}>
      <View className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden">
        <View
          style={{
            width: `${value > 0 ? Math.max(2, (value / max) * 100) : 0}%`,
            height: "100%",
            backgroundColor: color,
          }}
        />
      </View>
      <Text className="w-20 text-right text-xs font-semibold text-gray-900 dark:text-white">
        {formatMoney(value)}
      </Text>
    </View>
  );
  return (
    <View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1 mb-1">
        {[
          { color: PRIMARY, label: "First-touch $" },
          { color: GREEN, label: "Last-touch $" },
        ].map((l) => (
          <View key={l.label} className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: l.color }} />
            <Text className="text-xs text-gray-600 dark:text-gray-300">{l.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((r, i) => (
        <View
          key={r.key}
          className={`py-2.5 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
        >
          <Text className="text-sm font-medium text-gray-900 dark:text-white">{r.label}</Text>
          {bar(r.firstTouch, PRIMARY, "First touch")}
          {bar(r.lastTouch, GREEN, "Last touch")}
        </View>
      ))}
    </View>
  );
}

export default PageAnalytics;
