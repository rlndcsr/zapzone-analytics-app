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
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetSelect } from "../../components/ui/SheetSelect";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import {
  fetchAccountingReport,
  type AccountingCategory,
  type AccountingReport,
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
function ymd(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

/** One expandable category (Parties / Attractions / Events / Add-ons). */
function CategoryRow({ category }: { category: AccountingCategory }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="border-t border-gray-100 dark:border-neutral-800">
      <Pressable onPress={() => setOpen((o) => !o)} className="flex-row items-center justify-between py-3.5">
        <View className="flex-row items-center gap-2 flex-1">
          <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" />
          <Text className="text-sm font-bold text-gray-900 dark:text-white">{category.name}</Text>
          {category.informational && (
            <View className="bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Informational</Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mr-3">{category.itemCount} items</Text>
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">{money(category.total)}</Text>
      </Pressable>

      {open && (
        <View className="pb-3 pl-6">
          {category.items.length === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 py-2 text-center">
              No {category.name.toLowerCase()} for this date
            </Text>
          ) : (
            category.items.map((it, i) => (
              <View key={`${it.name}-${i}`} className="flex-row items-center justify-between py-1.5">
                <View className="flex-1 mr-2">
                  <Text className="text-xs text-gray-700 dark:text-gray-200" numberOfLines={1}>{it.name}</Text>
                  {!!it.subCategory && (
                    <Text className="text-[10px] text-gray-400 dark:text-gray-500">{it.subCategory}</Text>
                  )}
                </View>
                <Text className="text-[11px] text-gray-400 dark:text-gray-500 mr-3">×{it.quantity}</Text>
                <Text className="text-xs font-medium text-gray-900 dark:text-white">{money(it.grossSales)}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const AccountingAnalytics = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#fff" : "#111";

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState<number | null>(getCurrentUser()?.location_id ?? null);
  const [start, setStart] = useState(() => ymd(new Date()));
  const [end, setEnd] = useState(() => ymd(new Date()));
  const [viewMode, setViewMode] = useState<"booked_on" | "booked_for">("booked_on");

  const [report, setReport] = useState<AccountingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load the location options once.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchLocations(token)
      .then((locs) => {
        setLocations(locs);
        setLocationId((prev) => prev ?? locs[0]?.id ?? null);
      })
      .catch(() => setLocations([]));
  }, []);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || locationId == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReport(
        await fetchAccountingReport({
          token,
          locationId,
          startDate: start,
          endDate: end || undefined,
          viewMode,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [locationId, start, end, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const tiles = useMemo(() => {
    const s = report?.summary;
    const t: { icon: FeatherName; label: string; value: string; negative?: boolean }[] = [
      { icon: "hash", label: "Qty Sold", value: String(s?.qtySold ?? 0) },
      { icon: "dollar-sign", label: "Gross Sales", value: money(s?.grossSales ?? 0) },
      { icon: "tag", label: "Discounts", value: `-${money(s?.discounts ?? 0)}`, negative: true },
      { icon: "file-text", label: "Net Sales", value: money(s?.netSales ?? 0) },
      { icon: "percent", label: "Fees", value: money(s?.fees ?? 0) },
      { icon: "briefcase", label: "Tax", value: money(s?.tax ?? 0) },
      { icon: "file", label: "Total Billed", value: money(s?.totalBilled ?? 0) },
      { icon: "dollar-sign", label: "Collected", value: money(s?.collected ?? 0) },
      { icon: "credit-card", label: "Authorize Payment", value: money(s?.authorizePayment ?? 0) },
      { icon: "credit-card", label: "Gateway Net", value: money(s?.gatewayNet ?? 0) },
    ];
    return t;
  }, [report]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full" accessibilityRole="button" accessibilityLabel="Go back">
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Accounting & Analytics</Text>
          <Pressable onPress={onRefresh} className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full" accessibilityRole="button" accessibilityLabel="Refresh">
            <Feather name="refresh-cw" size={18} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="px-5 gap-4">
          {/* Intro */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6" style={CARD_SHADOW}>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">Accounting & Analytics</Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">Purchases made on selected dates</Text>
          </View>

          {/* Controls */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800 gap-4" style={CARD_SHADOW}>
            {locations.length > 0 && (
              <SheetSelect
                icon="map-pin"
                title="Select Location"
                value={locationId}
                options={locations.map((l) => ({ label: l.name, value: l.id }))}
                onSelect={(v) => setLocationId(Number(v))}
              />
            )}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Start Date</Text>
                <TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" autoCapitalize="none" className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">End Date</Text>
                <TextInput value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" placeholderTextColor="#9CA3AF" autoCapitalize="none" className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 text-sm text-gray-900 dark:text-white" />
              </View>
            </View>
            <SheetSelect
              icon="clock"
              title="Date basis"
              value={viewMode}
              options={[
                { label: "Created On", value: "booked_on" },
                { label: "Booked For", value: "booked_for" },
              ]}
              onSelect={(v) => setViewMode(v as "booked_on" | "booked_for")}
            />
          </View>

          {loading && !report && <AnalyticsSkeleton tiles={10} panels={1} />}
          {error && !report && (
            <View className="items-center py-14">
              <Feather name="alert-circle" size={40} color="#EF4444" />
              <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">{error}</Text>
              <Pressable onPress={load} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]">
                <Text className="text-sm font-semibold text-white">Retry</Text>
              </Pressable>
            </View>
          )}

          {report && (
            <>
              {/* Summary tiles */}
              <View className="flex-row flex-wrap gap-3">
                {tiles.map((t) => (
                  <View key={t.label} className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800" style={CARD_SHADOW}>
                    <View className="flex-row items-center gap-2">
                      <View className="w-9 h-9 rounded-xl items-center justify-center bg-blue-50 dark:bg-blue-900/30">
                        <Feather name={t.icon} size={18} color={PRIMARY} />
                      </View>
                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 flex-1" numberOfLines={1}>{t.label}</Text>
                    </View>
                    <Text className={`text-xl font-bold mt-3 ${t.negative ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                      {t.value}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Sales by category */}
              <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800" style={CARD_SHADOW}>
                <Text className="text-base font-bold text-gray-900 dark:text-white">Sales by Category</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-1">
                  Breakdown by Parties, Attractions, Events, and Add-ons
                </Text>
                {report.categories.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No sales for this date</Text>
                ) : (
                  report.categories.map((c) => <CategoryRow key={c.name} category={c} />)
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default AccountingAnalytics;
