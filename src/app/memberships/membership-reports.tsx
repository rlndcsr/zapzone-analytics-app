import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TextField } from "../../components/ui/FormControls";
import { getToken } from "../../lib/session";
import {
  fetchMembershipReport,
  type MembershipReport,
} from "../../services/membershipsService";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const PRIMARY = "#0644C7";
type FeatherName = ComponentProps<typeof Feather>["name"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const money = (n: number) => `$${n.toFixed(2)}`;

/** Date -> "YYYY-MM-DD" (local). */
function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO/date -> "Jun 9, 2026". */
function prettyDate(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

type Stat = {
  icon: FeatherName;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
};

/** A KPI tile in the 2-column overview grid. */
function StatCard({ stat }: { stat: Stat }) {
  return (
    <View
      className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className={`w-9 h-9 rounded-xl items-center justify-center ${stat.iconBg}`}>
        <Feather name={stat.icon} size={18} color={stat.iconColor} />
      </View>
      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-3">
        {stat.label}
      </Text>
      <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
        {stat.value}
      </Text>
    </View>
  );
}

/** A titled panel with an icon (Top Plans, Visits by Location, etc.). */
function Panel({
  icon,
  iconColor,
  title,
  children,
}: {
  icon: FeatherName;
  iconColor: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <Feather name={icon} size={16} color={iconColor} />
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const MembershipReports = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  // Default to the last 30 days (matching the web's default range).
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return ymd(d);
  });
  const [to, setTo] = useState(() => ymd(new Date()));

  const [report, setReport] = useState<MembershipReport | null>(null);
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
    setLoading(true);
    setError(null);
    try {
      setReport(
        await fetchMembershipReport({
          token,
          from: from.trim() || undefined,
          to: to.trim() || undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Load once on mount; range changes are applied explicitly via "Apply".
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const stats: Stat[] = useMemo(() => {
    const c = report?.counts;
    return [
      { icon: "users", iconBg: "bg-blue-50 dark:bg-blue-900/30", iconColor: PRIMARY, label: "Active", value: String(c?.active ?? 0) },
      { icon: "alert-triangle", iconBg: "bg-orange-50 dark:bg-orange-900/30", iconColor: "#EA580C", label: "Past Due", value: String(c?.pastDue ?? 0) },
      { icon: "x-circle", iconBg: "bg-red-50 dark:bg-red-900/30", iconColor: "#DC2626", label: "Suspended", value: String(c?.suspended ?? 0) },
      { icon: "pause-circle", iconBg: "bg-blue-50 dark:bg-blue-900/30", iconColor: "#2563EB", label: "Frozen", value: String(c?.frozen ?? 0) },
      { icon: "trending-up", iconBg: "bg-green-50 dark:bg-green-900/30", iconColor: "#16A34A", label: "New (range)", value: String(c?.newInRange ?? 0) },
      { icon: "x-circle", iconBg: "bg-red-50 dark:bg-red-900/30", iconColor: "#DC2626", label: "Canceled (range)", value: String(c?.canceledInRange ?? 0) },
      { icon: "dollar-sign", iconBg: "bg-green-50 dark:bg-green-900/30", iconColor: "#16A34A", label: "MRR", value: money(report?.mrr ?? 0) },
      { icon: "dollar-sign", iconBg: "bg-green-50 dark:bg-green-900/30", iconColor: "#16A34A", label: "ARR", value: money(report?.arr ?? 0) },
    ];
  }, [report]);

  const showInitialLoader = loading && !report;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Membership Reports
          </Text>
          <View style={{ width: 36 }} />
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
              Membership Reports
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              KPIs, revenue, and engagement for the selected range
            </Text>
          </View>

          {/* Date range + Apply */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
            style={CARD_SHADOW}
          >
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="From"
                  value={from}
                  onChangeText={setFrom}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
              </View>
              <View className="flex-1">
                <TextField
                  label="To"
                  value={to}
                  onChangeText={setTo}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
              </View>
            </View>
            <Pressable
              onPress={load}
              disabled={loading}
              className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3 rounded-xl mt-3 active:opacity-90"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="refresh-cw" size={15} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">Apply</Text>
            </Pressable>
          </View>

          {/* Error */}
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

          {showInitialLoader && (
            <View className="items-center py-16">
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          )}

          {report && (
            <>
              {/* KPI grid */}
              <View className="flex-row flex-wrap gap-3">
                {stats.map((s) => (
                  <StatCard key={s.label} stat={s} />
                ))}
              </View>

              {/* Top Plans */}
              <Panel icon="star" iconColor={PRIMARY} title="Top Plans">
                {report.topPlans.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  report.topPlans.map((p, i) => (
                    <View
                      key={p.id}
                      className={`flex-row items-center justify-between py-2 ${
                        i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                      }`}
                    >
                      <Text className="text-sm text-gray-700 dark:text-gray-200">
                        {p.name}
                      </Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {money(p.price)}
                      </Text>
                    </View>
                  ))
                )}
              </Panel>

              {/* Visits by Location */}
              <Panel icon="map-pin" iconColor={PRIMARY} title="Visits by Location">
                {report.visitsByLocation.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No data.
                  </Text>
                ) : (
                  report.visitsByLocation.map((v, i) => (
                    <View
                      key={`${v.locationId}-${i}`}
                      className={`flex-row items-center justify-between py-2 ${
                        i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                      }`}
                    >
                      <Text className="text-sm text-gray-700 dark:text-gray-200">
                        {v.locationName}
                      </Text>
                      <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                        {v.visits}
                      </Text>
                    </View>
                  ))
                )}
              </Panel>

              {/* Revenue */}
              <Panel icon="dollar-sign" iconColor="#16A34A" title="Revenue">
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {prettyDate(report.dateRange.from)} → {prettyDate(report.dateRange.to)}
                </Text>
                <Text className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {money(report.revenueInRange)}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {report.failedPayments} failed payment
                  {report.failedPayments === 1 ? "" : "s"} in range
                </Text>
              </Panel>

              {/* Underused Memberships */}
              <Panel icon="activity" iconColor={PRIMARY} title="Underused Memberships">
                {report.underused.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No underused samples.
                  </Text>
                ) : (
                  report.underused.map((u, i) => (
                    <View
                      key={u.id}
                      className={`py-2.5 ${
                        i > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""
                      }`}
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-medium text-gray-900 dark:text-white flex-1 mr-2">
                          {u.customerName ?? "Member"}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {u.visitsUsed}/{u.visitsPerTerm} used
                        </Text>
                      </View>
                      {!!u.planName && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {u.planName} · {u.visitsRemaining} remaining
                        </Text>
                      )}
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

export default MembershipReports;
