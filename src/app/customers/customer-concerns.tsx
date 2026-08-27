import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ConcernsTable,
  STATUS_META,
  describeWanted,
  formatReceived,
} from "../../components/ui/ConcernsTable";
import { Pagination } from "../../components/ui/Pagination";
import { SheetSelect, type SheetSelectOption } from "../../components/ui/SheetSelect";
import { StatTile } from "../../components/ui/StatTile";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { venueDateKey } from "../../lib/date/venueTime";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getToken } from "../../lib/session";
import {
  fetchAllCheckoutConcerns,
  fetchCheckoutConcernStats,
  updateCheckoutConcernStatus,
  type ConcernRow,
  type ConcernStats,
  type ConcernStatus,
} from "../../services/checkoutConcernsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** The web page's "Received" timeframe buttons, in the same order. */
type Timeframe = "all" | "today" | "yesterday" | "last7" | "last30" | "month";

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last7" },
  { label: "Last 30 days", value: "last30" },
  { label: "This month", value: "month" },
];

const STATUS_OPTIONS: SheetSelectOption[] = [
  { label: "All statuses", value: "all" },
  { label: "Needs a call", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Resolved", value: "resolved" },
];

const KIND_OPTIONS: SheetSelectOption[] = [
  { label: "Everything", value: "all" },
  { label: "Schedule help", value: "schedule_help" },
  { label: "Call to book", value: "call_to_book" },
  { label: "Left unfinished", value: "abandoned_checkout" },
];

/** Today in venue time, so the windows below line up with the When column. */
const venueToday = (): string =>
  venueDateKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);

/** Shift a YYYY-MM-DD key by whole days, without local-timezone drift. */
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/** Inclusive [from, to] day keys for a timeframe; null means unbounded. */
function timeframeWindow(tf: Timeframe): { from: string; to: string } | null {
  const today = venueToday();
  switch (tf) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = shiftKey(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: shiftKey(today, -6), to: today };
    case "last30":
      return { from: shiftKey(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default:
      return null;
  }
}

/**
 * Customer Concerns — guests who asked for schedule help, want to book by phone,
 * or left checkout with their details filled in. Reads the same
 * `/api/checkout-concerns` endpoints as the web admin page: the list (paged
 * through so the filters below run over the whole set) and the statistics call
 * behind the five counters. Status changes write back through the same PUT.
 */
const CustomerConcerns = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  // Scoped to the global workspace location, like every other list screen.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const [concerns, setConcerns] = useState<ConcernRow[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [stats, setStats] = useState<ConcernStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters. Status starts on "Needs a call", the default the web page applies.
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [status, setStatus] = useState<ConcernStatus | "all">("new");
  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, counts] = await Promise.all([
        fetchAllCheckoutConcerns({ token, locationId: activeLocationId }),
        // Best-effort: the counters go blank rather than failing the screen.
        fetchCheckoutConcernStats(token, activeLocationId).catch(() => null),
      ]);
      setConcerns(list.rows);
      setServerTotal(list.total);
      setStats(counts);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load customer concerns — you may not have permission.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [timeframe, status, kind, search, perPage, activeLocationId]);

  // Timeframe · status · kind · search, all client-side over the loaded set —
  // the same predicates the web table applies.
  const filtered = useMemo(() => {
    const window = timeframeWindow(timeframe);
    const term = search.trim().toLowerCase();

    return concerns.filter((c) => {
      if (window) {
        const day = venueDateKey(c.createdAt);
        if (!day || day < window.from || day > window.to) return false;
      }
      if (status !== "all" && c.status !== status) return false;
      if (kind !== "all" && c.kind !== kind) return false;
      if (term) {
        const haystack = [
          c.name,
          c.phone,
          c.email,
          c.entityName,
          c.message,
          c.locationName,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [concerns, timeframe, status, kind, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  const filtersActive =
    timeframe !== "all" || status !== "all" || kind !== "all" || !!search.trim();

  const setConcernStatus = useCallback(
    async (concern: ConcernRow, next: ConcernStatus) => {
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again to update this.");
        return;
      }
      setBusyId(concern.id);
      try {
        const updated = await updateCheckoutConcernStatus(
          token,
          concern.id,
          next,
        );
        setConcerns((prev) =>
          prev.map((row) =>
            row.id === concern.id
              ? // The response carries the new handler; fall back to a local
                // status flip if the body came back without a row.
                (updated ?? { ...row, status: next })
              : row,
          ),
        );
        // Counters are server-computed, so re-read them rather than guessing.
        fetchCheckoutConcernStats(token, activeLocationId)
          .then(setStats)
          .catch(() => {});
      } catch (err) {
        Alert.alert(
          "That did not save",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setBusyId(null);
      }
    },
    [activeLocationId],
  );

  const exportCsv = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert(
        "Nothing to export",
        "No concerns match the current search and filters.",
      );
      return;
    }
    setExporting(true);
    try {
      // Loaded lazily so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "Guest",
        "Location",
        "Phone",
        "Email",
        "What they wanted",
        "Why",
        "Message",
        "Status",
        "Handled by",
        "When",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = filtered.map((c) =>
        [
          c.name,
          c.locationName,
          c.phone,
          c.email,
          describeWanted(c),
          c.kind,
          c.message,
          STATUS_META[c.status]?.label ?? c.status,
          c.handlerName,
          formatReceived(c.createdAt),
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}customer-concerns-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Customer Concerns",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — Export CSV is icon-only here, as on the other list screens. */}
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
            Customer Concerns
          </Text>
          <Pressable
            onPress={exportCsv}
            disabled={exporting}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Export CSV"
          >
            {exporting ? (
              <ActivityIndicator size="small" color={headerIcon} />
            ) : (
              <Feather name="download" size={20} color={headerIcon} />
            )}
          </Pressable>
        </View>
      </View>

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
          />
        }
      >
        <View className="px-5 gap-4">
          {/* Intro — same heading and copy as the web page. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 shadow-sm"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Customer Concerns
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Guests who asked for schedule help, want to book by phone, or left
              checkout with their details filled in
            </Text>
          </View>

          {/* Counters */}
          {loading && concerns.length === 0 ? (
            <AnalyticsSkeleton tiles={4} panels={0} />
          ) : (
            <View className="flex-row flex-wrap gap-3">
              <StatTile
                icon="phone-call"
                iconBg="bg-amber-50 dark:bg-amber-900/30"
                iconColor="#D97706"
                label="Waiting on a Call"
                value={String(stats?.open ?? 0)}
                hint="Open concerns"
              />
              <StatTile
                icon="calendar"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Schedule Help"
                value={String(stats?.scheduleHelp ?? 0)}
                hint="Calendar did not work"
              />
              <StatTile
                icon="phone"
                iconBg="bg-teal-50 dark:bg-teal-900/30"
                iconColor="#0D9488"
                label="Call to Book"
                value={String(stats?.callToBook ?? 0)}
                hint="No online schedule"
              />
              <StatTile
                icon="shopping-cart"
                iconBg="bg-purple-50 dark:bg-purple-900/30"
                iconColor="#7C3AED"
                label="Left Unfinished"
                value={String(stats?.abandonedCheckout ?? 0)}
                hint="Closed checkout mid-way"
              />
              <StatTile
                icon="inbox"
                iconBg="bg-green-50 dark:bg-green-900/30"
                iconColor="#16A34A"
                label="Today"
                value={String(stats?.today ?? 0)}
                hint="Received today"
              />
            </View>
          )}

          {/* Received timeframe — the web's button row, scrolled sideways. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-3"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-1.5 mb-2.5">
              <Feather name="calendar" size={13} color="#9CA3AF" />
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Received
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {TIMEFRAMES.map((option) => {
                const active = timeframe === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setTimeframe(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`px-3.5 py-2 rounded-xl border ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/20 border-[#0644C7]"
                        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        active
                          ? "text-[#0644C7] dark:text-blue-400"
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
            <Feather name="search" size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name, phone, email, item or message..."
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              className="flex-1 text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Status + Why filters */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <SheetSelect
                icon="check-circle"
                title="Status"
                value={status}
                options={STATUS_OPTIONS}
                onSelect={(v) => setStatus(v as ConcernStatus | "all")}
              />
            </View>
            <View className="flex-1">
              <SheetSelect
                icon="help-circle"
                title="Why"
                value={kind}
                options={KIND_OPTIONS}
                onSelect={(v) => setKind(String(v))}
              />
            </View>
          </View>

          {/* Count line + the cap notice, when the server holds more than the
              screen loaded (so a filtered count is never read as the total). */}
          {!loading && !error && (
            <View>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filtered.length}{" "}
                {filtered.length === 1 ? "concern" : "concerns"}
                {concerns.length !== filtered.length
                  ? ` of ${concerns.length} loaded`
                  : ""}
              </Text>
              {serverTotal > concerns.length && (
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Newest {concerns.length} of {serverTotal} — older ones aren’t
                  loaded on mobile.
                </Text>
              )}
            </View>
          )}

          {/* List / states */}
          {loading && concerns.length === 0 ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : error ? (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center"
              style={CARD_SHADOW}
            >
              <View className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 items-center justify-center mb-3">
                <Feather name="inbox" size={26} color={PRIMARY} />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                Nothing here
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                {filtersActive
                  ? "Try adjusting your search or filters"
                  : "No guest is waiting on a call"}
              </Text>
            </View>
          ) : (
            <View>
              <ConcernsTable
                concerns={paged}
                busyId={busyId}
                onSetStatus={setConcernStatus}
              />
              <Pagination
                page={page}
                perPage={perPage}
                total={filtered.length}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default CustomerConcerns;
