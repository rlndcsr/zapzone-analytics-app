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
import { FunnelChart } from "../../components/ui/FunnelChart";
import { PieChart } from "../../components/ui/PieChart";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { StatTile } from "../../components/ui/StatTile";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { getToken } from "../../lib/session";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import {
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

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
type FeatherName = ComponentProps<typeof Feather>["name"];

const money = (n: number) => `$${n.toFixed(2)}`;

/** ms -> "6m 15s". */
function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "2026-07-09" / ISO -> "Jul 9". */
function shortDay(raw: string): string {
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Panel({ icon, title, children }: { icon: FeatherName; title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800" style={CARD_SHADOW}>
      <View className="flex-row items-center gap-2 mb-3">
        <Feather name={icon} size={16} color={PRIMARY} />
        <Text className="text-base font-bold text-gray-900 dark:text-white">{title}</Text>
      </View>
      {children}
    </View>
  );
}

type DeviceTab = "devices" | "browsers" | "oses";

const PageAnalytics = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [overview, setOverview] = useState<PageOverview | null>(null);
  const [live, setLive] = useState<PageLive | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [topEntities, setTopEntities] = useState<TopEntity[]>([]);
  const [sources, setSources] = useState<TrafficSources | null>(null);
  const [deviceData, setDeviceData] = useState<{
    devices: DeviceSlice[];
    browsers: DeviceSlice[];
    oses: DeviceSlice[];
  }>({ devices: [], browsers: [], oses: [] });
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("devices");
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [landing, setLanding] = useState<LandingPage[]>([]);
  const [conversions, setConversions] = useState<ConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [days, setDays] = useState(30);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Location options for the "All Locations" filter.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchLocations(token).then(setLocations).catch(() => setLocations([]));
  }, []);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setError(null);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const loc = locationId ?? undefined;
    const p = {
      token,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      locationId: loc,
    };
    try {
      const [ov, lv, ts, tp, te, src, dev, fn, lp, cv] = await Promise.all([
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
      ]);
      setOverview(ov);
      setLive(lv);
      setSeries(ts.series);
      setTopPages(tp);
      setTopEntities(te);
      setSources(src);
      setDeviceData(dev);
      setFunnel(fn);
      setLanding(lp);
      setConversions(cv);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days, locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const deviceSlices = deviceData[deviceTab] ?? [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full" accessibilityRole="button" accessibilityLabel="Go back">
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Page Analytics</Text>
          <Pressable onPress={onRefresh} className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full" accessibilityRole="button" accessibilityLabel="Refresh">
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6" style={CARD_SHADOW}>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">Page Analytics</Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Visitors, engagement and conversions across your booking pages
            </Text>
          </View>

          {/* Filters: period + location */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <SheetSelect
                icon="calendar"
                title="Select Period"
                value={days}
                options={[
                  { label: "Last 7 days", value: 7 },
                  { label: "Last 30 days", value: 30 },
                  { label: "Last 90 days", value: 90 },
                ]}
                onSelect={(v) => setDays(Number(v))}
              />
            </View>
            <View className="flex-1">
              <SheetSelect
                icon="map-pin"
                title="Select Location"
                value={locationId ?? "all"}
                options={[
                  { label: "All Locations", value: "all" },
                  ...locations.map((l) => ({ label: l.name, value: l.id })),
                ]}
                onSelect={(v) => setLocationId(v === "all" ? null : Number(v))}
              />
            </View>
          </View>

          {loading && !overview && <AnalyticsSkeleton tiles={10} panels={3} />}
          {error && !overview && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">{error}</Text>
              <Pressable onPress={load} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {overview && (
            <>
              {/* Right now */}
              <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-2xl px-4 py-3 border border-gray-100 dark:border-neutral-800" style={CARD_SHADOW}>
                <View className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <Text className="text-sm font-bold text-gray-900 dark:text-white">
                  {live?.activeVisitors ?? 0}
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  visitors right now · {live?.activeSessions ?? 0} sessions
                </Text>
              </View>

              {/* KPI tiles */}
              <View className="flex-row flex-wrap gap-3">
                <StatTile icon="eye" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Page views" value={String(overview.pageViews)} info="Total number of page loads across all tracked booking pages in the selected period." />
                <StatTile icon="users" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Unique visitors" value={String(overview.uniqueVisitors)} info="Distinct visitors who viewed a tracked page during the period." />
                <StatTile icon="repeat" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Sessions" value={String(overview.sessions)} info="Total browsing sessions. A session groups a visitor's activity until they're inactive." />
                <StatTile icon="navigation" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Conversions" value={String(overview.conversions)} info="Completed conversion events (e.g. a purchase) attributed to tracked pages." />
                <StatTile icon="trending-up" iconBg="bg-green-50 dark:bg-green-900/30" iconColor="#16A34A" label="Conv. rate" value={`${overview.conversionRate}%`} info="Conversions divided by sessions, as a percentage." />
                <StatTile icon="dollar-sign" iconBg="bg-green-50 dark:bg-green-900/30" iconColor="#16A34A" label="Revenue" value={money(overview.conversionValue)} info="Total revenue value attributed to tracked conversions in the period." />
                <StatTile icon="corner-up-right" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Bounce rate" value={`${overview.bounceRate}%`} info="Share of sessions that viewed a single page and left without engaging." />
                <StatTile icon="clock" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Avg duration" value={fmtDuration(overview.avgDurationMs)} info="Average time a visitor spends per page view." />
                <StatTile icon="user-plus" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="New visitors" value={String(overview.newVisitors)} info="Visitors seen for the first time during the period." />
                <StatTile icon="user-check" iconBg="bg-blue-50 dark:bg-blue-900/30" iconColor={PRIMARY} label="Returning" value={String(overview.returningVisitors)} info="Visitors who had already visited before this period." />
              </View>

              {/* Traffic & conversions */}
              <Panel icon="activity" title="Traffic & conversions">
                <Text className="text-[11px] text-gray-400 dark:text-gray-500 -mt-2 mb-2">
                  Bucket: day
                </Text>
                <AreaChart
                  height={220}
                  dark={scheme === "dark"}
                  labels={series.map((s) => shortDay(s.bucket))}
                  series={[
                    { label: "Page views", color: "#0644C7", data: series.map((s) => s.views), axis: "left" },
                    { label: "Conversions", color: "#F59E0B", data: series.map((s) => s.conversions), axis: "left", area: false },
                    { label: "Revenue ($)", color: "#16A34A", data: series.map((s) => s.revenue), axis: "right" },
                  ]}
                />
              </Panel>

              {/* Top pages */}
              <Panel icon="file-text" title="Top pages">
                {topPages.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">No data.</Text>
                ) : (
                  topPages.slice(0, 10).map((p, i) => (
                    <View key={`${p.path}-${i}`} className={`flex-row items-center justify-between py-2 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}>
                      <Text className="text-xs text-gray-600 dark:text-gray-300 flex-1 mr-2" numberOfLines={1}>{p.path}</Text>
                      <Text className="text-xs font-semibold text-gray-900 dark:text-white">{p.views}</Text>
                    </View>
                  ))
                )}
              </Panel>

              {/* Top entities */}
              <Panel icon="grid" title="Top entities">
                {topEntities.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">No data.</Text>
                ) : (
                  <>
                    <View className="flex-row pb-2 border-b border-gray-100 dark:border-neutral-800">
                      <Text className="flex-1 text-[10px] font-semibold uppercase text-gray-400">Name</Text>
                      <Text className="w-12 text-right text-[10px] font-semibold uppercase text-gray-400">Views</Text>
                      <Text className="w-12 text-right text-[10px] font-semibold uppercase text-gray-400">Conv</Text>
                      <Text className="w-14 text-right text-[10px] font-semibold uppercase text-gray-400">Rate</Text>
                    </View>
                    {topEntities.slice(0, 10).map((e, i) => (
                      <View key={`${e.name}-${i}`} className="flex-row items-center py-2 border-b border-gray-50 dark:border-neutral-800/50">
                        <Text className="flex-1 text-xs text-gray-700 dark:text-gray-200 mr-2" numberOfLines={1}>{e.name}</Text>
                        <Text className="w-12 text-right text-xs text-gray-600 dark:text-gray-300">{e.views}</Text>
                        <Text className="w-12 text-right text-xs text-gray-600 dark:text-gray-300">{e.conversions}</Text>
                        <Text className="w-14 text-right text-xs font-semibold text-gray-900 dark:text-white">{e.rate}%</Text>
                      </View>
                    ))}
                  </>
                )}
              </Panel>

              {/* Funnel */}
              <Panel icon="filter" title="Funnel">
                <Text className="text-[11px] text-gray-400 dark:text-gray-500 -mt-2 mb-3">
                  View → engage → convert
                </Text>
                {funnel.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">No data.</Text>
                ) : (
                  <FunnelChart data={funnel.map((f) => ({ label: f.label, value: f.visitors }))} />
                )}
              </Panel>

              {/* Devices */}
              <Panel icon="smartphone" title="Devices">
                {/* Devices / Browsers / OS toggle */}
                <View className="flex-row gap-1.5 mb-4 self-start bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
                  {(
                    [
                      { key: "devices", label: "Devices" },
                      { key: "browsers", label: "Browsers" },
                      { key: "oses", label: "OS" },
                    ] as { key: DeviceTab; label: string }[]
                  ).map((t) => {
                    const active = deviceTab === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        onPress={() => setDeviceTab(t.key)}
                        className={`px-3 py-1.5 rounded-md ${active ? "bg-[#0644C7]" : ""}`}
                      >
                        <Text
                          className={`text-xs font-medium ${active ? "text-white" : "text-gray-600 dark:text-gray-300"}`}
                        >
                          {t.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <PieChart data={deviceSlices.map((d) => ({ label: d.label, value: d.views }))} />
              </Panel>

              {/* Traffic sources */}
              <Panel icon="globe" title="Traffic sources">
                {sources ? (
                  <>
                    <View className="flex-row items-center justify-between py-2">
                      <Text className="text-xs text-gray-600 dark:text-gray-300">Direct</Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {sources.direct.visits} visits · {sources.direct.conversions} conv · {money(sources.direct.revenue)}
                      </Text>
                    </View>
                    {sources.referrers.length > 0 && (
                      <Text className="text-[10px] font-semibold uppercase text-gray-400 mt-2 mb-1">Referrers</Text>
                    )}
                    {sources.referrers.slice(0, 12).map((r, i) => (
                      <Text key={`${r.referrer}-${i}`} className="text-xs text-gray-500 dark:text-gray-400 py-1" numberOfLines={1}>
                        {r.referrer}
                      </Text>
                    ))}
                  </>
                ) : (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">No data.</Text>
                )}
              </Panel>

              {/* Top landing pages */}
              <Panel icon="log-in" title="Top landing pages">
                {landing.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">No data.</Text>
                ) : (
                  landing.slice(0, 10).map((l, i) => (
                    <View key={`${l.path}-${i}`} className={`flex-row items-center justify-between py-2 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}>
                      <Text className="text-xs text-gray-600 dark:text-gray-300 flex-1 mr-2" numberOfLines={1}>{l.path}</Text>
                      <Text className="text-xs font-semibold text-gray-900 dark:text-white">{l.sessions}</Text>
                    </View>
                  ))
                )}
              </Panel>

              {/* Recent conversions */}
              <Panel icon="check-circle" title="Recent Conversions">
                {conversions.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No data</Text>
                ) : (
                  conversions.slice(0, 15).map((c, i) => (
                    <View key={i} className={`py-2 ${i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-medium text-gray-900 dark:text-white flex-1 mr-2" numberOfLines={1}>{c.entity}</Text>
                        <Text className="text-xs font-semibold text-green-600 dark:text-green-400">{money(c.value)}</Text>
                      </View>
                      <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {c.event} · {c.utmSource}
                      </Text>
                    </View>
                  ))
                )}
              </Panel>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default PageAnalytics;
