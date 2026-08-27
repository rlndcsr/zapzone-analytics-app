import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { Pagination } from "../../components/ui/Pagination";
import { SheetSelect, type SheetSelectOption } from "../../components/ui/SheetSelect";
import { StatTile } from "../../components/ui/StatTile";
import { VisitorSessionsTable } from "../../components/ui/VisitorSessionsTable";
import { AnalyticsSkeleton } from "../../components/ui/skeleton/AnalyticsSkeleton";
import { venueDateKey } from "../../lib/date/venueTime";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getToken } from "../../lib/session";
import {
  MAX_LOADED_SESSIONS,
  exportVisitorSessions,
  fetchAllVisitorSessions,
  fetchVisitorSessionDetail,
  fetchVisitorStats,
  formatSessionDuration,
  isKnownVisitor,
  type VisitorActivityFilter,
  type VisitorDeviceType,
  type VisitorIdentityFilter,
  type VisitorSessionDetail,
  type VisitorSessionRow,
  type VisitorStats,
  type VisitorTimelineEvent,
} from "../../services/visitorTrackingService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** The web page's TIME FRAME buttons, in the same order. */
type Timeframe = "all" | "today" | "yesterday" | "last7" | "last30" | "month";

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last7" },
  { label: "Last 30 days", value: "last30" },
  { label: "This month", value: "month" },
];

type IdentityFilter = VisitorIdentityFilter | "all";
type DeviceFilter = VisitorDeviceType | "all";
type ActivityFilter = VisitorActivityFilter | "all";

const IDENTITY_OPTIONS: SheetSelectOption[] = [
  { label: "All visitors", value: "all" },
  { label: "Known customers", value: "known" },
  { label: "Anonymous", value: "anonymous" },
];

const DEVICE_OPTIONS: SheetSelectOption[] = [
  { label: "All devices", value: "all" },
  { label: "Mobile", value: "mobile" },
  { label: "Desktop", value: "desktop" },
  { label: "Tablet", value: "tablet" },
];

const ACTIVITY_OPTIONS: SheetSelectOption[] = [
  { label: "Any activity", value: "all" },
  { label: "Made a purchase", value: "purchased" },
  { label: "Reached a checkout page", value: "reached_checkout" },
  { label: "Clicked something", value: "clicked" },
  { label: "Viewed 2+ pages", value: "multi_page" },
];

/** Today in Michigan time — the same calendar the backend groups sessions on. */
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

/** A summary pill in the detail sheet's header row. */
const SummaryChip = ({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "indigo" | "emerald" | "gray";
}) => {
  const styles = {
    blue: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300",
    indigo:
      "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300",
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    gray: "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-300",
  }[tone];
  const [bg1, bg2, br1, br2, fg1, fg2] = styles.split(" ");
  return (
    <View
      className={`px-2.5 py-1 rounded-full border ${bg1} ${bg2} ${br1} ${br2}`}
    >
      <Text numberOfLines={1} className={`text-xs font-semibold ${fg1} ${fg2}`}>
        {label}
      </Text>
    </View>
  );
};

/** Per-event-type icon badge, matching the web timeline's coloured squares. */
const EVENT_BADGE: Record<
  string,
  { icon: ComponentProps<typeof Feather>["name"]; bg: string; tint: string }
> = {
  conversion: {
    icon: "shopping-cart",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    tint: "#059669",
  },
  engagement: {
    icon: "mouse-pointer",
    bg: "bg-indigo-50 dark:bg-indigo-900/30",
    tint: "#4F46E5",
  },
  page_view: {
    icon: "eye",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    tint: PRIMARY,
  },
};

/**
 * One event in a session's timeline: a type badge, the sentence ("Viewed
 * **Zap Zone**", `Clicked "…"`, "Completed **checkout** — $42.00"), the page
 * path with its time-on-page and scroll depth, then the clock time.
 */
const TimelineRow = ({ event }: { event: VisitorTimelineEvent }) => {
  const badge = EVENT_BADGE[event.eventType] ?? EVENT_BADGE.page_view;

  const sentence =
    event.eventType === "conversion" ? (
      <>
        Completed{" "}
        <Text className="font-semibold">
          {(event.eventName || "purchase").replace(/_/g, " ")}
        </Text>
        {event.conversionValue
          ? ` — $${event.conversionValue.toFixed(2)}`
          : ""}
      </>
    ) : event.eventType === "engagement" ? (
      <>
        Clicked{" "}
        <Text className="font-semibold">
          “{event.label || event.eventName}”
        </Text>
      </>
    ) : (
      <>
        Viewed{" "}
        <Text className="font-semibold">
          {event.pageTitle || event.pagePath || "—"}
        </Text>
      </>
    );

  const meta = [
    event.pagePath,
    event.eventType === "page_view" && event.durationMs
      ? `${formatSessionDuration(event.durationMs)} on page`
      : "",
    event.eventType === "page_view" && event.scrollDepth
      ? `scrolled ${event.scrollDepth}%`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="flex-row items-start gap-3 py-2">
      <View
        className={`w-7 h-7 rounded-lg items-center justify-center ${badge.bg}`}
      >
        <Feather name={badge.icon} size={13} color={badge.tint} />
      </View>
      <View className="flex-1">
        <Text className="text-sm text-gray-800 dark:text-gray-200">
          {sentence}
        </Text>
        {!!meta && (
          <Text className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {meta}
          </Text>
        )}
      </View>
      <Text className="shrink-0 text-xs text-gray-500 dark:text-gray-400 mt-1">
        {event.timeLabel}
      </Text>
    </View>
  );
};

/**
 * Visitor Tracking — every customer visit as its own session (one visitor, one
 * day, Michigan time). Reads the same `/api/visitor-sessions` endpoints as the
 * web admin page: the grouped list (paged through so the filters below run over
 * the whole loaded set), the statistics behind the four counters, the
 * server-side export, and one session's timeline behind the eye action.
 */
const VisitorTracking = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const [sessions, setSessions] = useState<VisitorSessionRow[]>([]);
  const [capped, setCapped] = useState(false);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters. Visitor Type starts on "Known customers", the web page's default.
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [identity, setIdentity] = useState<IdentityFilter>("known");
  const [device, setDevice] = useState<DeviceFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Session timeline sheet.
  const [detail, setDetail] = useState<VisitorSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

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
        fetchAllVisitorSessions({ token, locationId: activeLocationId }),
        // Best-effort: the counters go blank rather than failing the screen.
        fetchVisitorStats(token, activeLocationId).catch(() => null),
      ]);
      setSessions(list.rows);
      setCapped(list.capped);
      setStats(counts);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load visitor sessions — you may not have permission.",
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
  }, [timeframe, identity, device, activity, search, perPage, activeLocationId]);

  // Timeframe · visitor type · device · activity · search, client-side over the
  // loaded set — the same predicates the web table applies.
  const filtered = useMemo(() => {
    const window = timeframeWindow(timeframe);
    const term = search.trim().toLowerCase();

    return sessions.filter((s) => {
      if (window) {
        const day = s.sessionDate;
        if (!day || day < window.from || day > window.to) return false;
      }
      if (identity === "known" && !isKnownVisitor(s)) return false;
      if (identity === "anonymous" && isKnownVisitor(s)) return false;
      if (device !== "all" && s.deviceType !== device) return false;
      if (activity === "purchased" && s.conversions === 0) return false;
      if (activity === "clicked" && s.clicks === 0) return false;
      if (activity === "multi_page" && s.pageViews < 2) return false;
      if (activity === "reached_checkout" && !s.reachedCheckout) return false;
      if (term) {
        const haystack = [
          s.guestName,
          s.guestPhone,
          s.guestEmail,
          s.entryPage,
          s.exitPage,
          s.entryTitle,
          s.exitTitle,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [sessions, timeframe, identity, device, activity, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  const filtersActive =
    timeframe !== "all" ||
    identity !== "all" ||
    device !== "all" ||
    activity !== "all" ||
    !!search.trim();

  const openDetail = useCallback(async (session: VisitorSessionRow) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to view this.");
      return;
    }
    setDetail(null);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      setDetail(
        await fetchVisitorSessionDetail(
          token,
          session.visitorId,
          session.sessionDate,
        ),
      );
    } catch (err) {
      setDetailOpen(false);
      Alert.alert(
        "Could not load this session",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Export goes through the server-side endpoint, like the web's does, so a CSV
  // isn't limited to the sessions this screen happened to load.
  const exportCsv = useCallback(async () => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to export.");
      return;
    }
    setExporting(true);
    try {
      const window = timeframeWindow(timeframe);
      const result = await exportVisitorSessions(token, {
        locationId: activeLocationId,
        identified: identity === "all" ? undefined : identity,
        deviceType: device === "all" ? undefined : device,
        activity: activity === "all" ? undefined : activity,
        dateFrom: window?.from,
        dateTo: window?.to,
        search: search.trim() || undefined,
      });

      if (result.rows.length === 0) {
        Alert.alert(
          "Nothing to export",
          "No sessions match the current search and filters.",
        );
        return;
      }

      // Loaded lazily so these native modules never run at app startup.
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");

      const header = [
        "Customer",
        "Phone",
        "Email",
        "Date",
        "First seen (ET)",
        "Last seen (ET)",
        "Pages viewed",
        "Clicks",
        "Purchases",
        "Time on site",
        "Entry page",
        "Exit page",
        "Device",
        "Browser",
        "Session actions (ET)",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = result.rows.map((s) =>
        [
          s.guestName || "Anonymous",
          s.guestPhone,
          s.guestEmail,
          s.sessionDate,
          s.firstSeenLabel,
          s.lastSeenLabel,
          s.pageViews,
          s.clicks,
          s.conversions,
          formatSessionDuration(s.durationMs),
          s.entryPage,
          s.exitPage,
          s.deviceType,
          s.browser,
          s.actions,
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}visitor-sessions-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Visitor Sessions",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert(
          "Sharing unavailable",
          "Sharing isn't available on this device.",
        );
      }

      if (result.truncated) {
        Alert.alert(
          "Export truncated",
          `Exported the ${result.maxSessions} most recent sessions — narrow the time frame to get the rest.`,
        );
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }, [activeLocationId, identity, device, activity, timeframe, search]);

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
            Visitor Tracking
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
              Visitor Tracking
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Every customer visit as its own session — one visitor, one day,
              Michigan time
            </Text>
          </View>

          {/* Counters */}
          {loading && sessions.length === 0 ? (
            <AnalyticsSkeleton tiles={4} panels={0} />
          ) : (
            <View className="flex-row flex-wrap gap-3">
              <StatTile
                icon="activity"
                iconBg="bg-blue-50 dark:bg-blue-900/30"
                iconColor={PRIMARY}
                label="Sessions Today"
                value={String(stats?.sessionsToday ?? 0)}
                hint="One row per visitor per day"
              />
              <StatTile
                icon="calendar"
                iconBg="bg-indigo-50 dark:bg-indigo-900/30"
                iconColor="#4F46E5"
                label="Sessions This Week"
                value={String(stats?.sessionsWeek ?? 0)}
                hint="Last 7 days"
              />
              <StatTile
                icon="user-check"
                iconBg="bg-green-50 dark:bg-green-900/30"
                iconColor="#16A34A"
                label="Identified Today"
                value={String(stats?.identifiedToday ?? 0)}
                hint="Gave a name and number"
              />
              <StatTile
                // Footprints on the web too; Feather has no footprint glyph.
                icon="users"
                renderIcon={(color, size) => (
                  <Ionicons name="footsteps-outline" size={size} color={color} />
                )}
                iconBg="bg-amber-50 dark:bg-amber-900/30"
                iconColor="#D97706"
                label="Known Visitors"
                value={String(stats?.identifiedTotal ?? 0)}
                hint="All-time identified"
              />
            </View>
          )}

          {/* Time frame — the web's button row, scrolled sideways. */}
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-3"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-1.5 mb-2.5">
              <Feather name="calendar" size={13} color="#9CA3AF" />
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Time frame
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
                      numberOfLines={1}
                      className={`shrink-0 text-xs font-semibold ${
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
              placeholder="Search by name, phone, email or page..."
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

          {/* Visitor Type · Device · Activity */}
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <SheetSelect
                  icon="user-check"
                  title="Visitor Type"
                  value={identity}
                  options={IDENTITY_OPTIONS}
                  onSelect={(v) => setIdentity(v as IdentityFilter)}
                />
              </View>
              <View className="flex-1">
                <SheetSelect
                  icon="smartphone"
                  title="Device"
                  value={device}
                  options={DEVICE_OPTIONS}
                  onSelect={(v) => setDevice(v as DeviceFilter)}
                />
              </View>
            </View>
            <SheetSelect
              icon="mouse-pointer"
              title="Activity"
              value={activity}
              options={ACTIVITY_OPTIONS}
              onSelect={(v) => setActivity(v as ActivityFilter)}
            />
          </View>

          {/* Load cap notice, same wording as the web banner. */}
          {capped && (
            <View className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5">
              <Text className="text-sm text-amber-800 dark:text-amber-200">
                Showing the {MAX_LOADED_SESSIONS.toLocaleString()} most recent
                sessions — use Export CSV or the time frame for older activity.
              </Text>
            </View>
          )}

          {!loading && !error && (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Showing {filtered.length}{" "}
              {filtered.length === 1 ? "session" : "sessions"}
              {sessions.length !== filtered.length
                ? ` of ${sessions.length} loaded`
                : ""}
            </Text>
          )}

          {/* List / states */}
          {loading && sessions.length === 0 ? (
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
                <Feather
                  name={identity === "known" ? "user-check" : "users"}
                  size={26}
                  color={PRIMARY}
                />
              </View>
              {identity === "known" && sessions.length > 0 ? (
                <>
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                    No known customers yet
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                    Guests appear here once they enter their name and number in
                    the welcome popup. There{" "}
                    {sessions.length === 1 ? "is" : "are"} {sessions.length}{" "}
                    anonymous session{sessions.length === 1 ? "" : "s"} behind
                    this filter.
                  </Text>
                  <Pressable
                    onPress={() => setIdentity("all")}
                    className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel="Show all visitors"
                  >
                    <Text
                      numberOfLines={1}
                      className="text-sm font-semibold text-gray-700 dark:text-gray-200"
                    >
                      Show all visitors
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                    No visits recorded
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                    {filtersActive
                      ? "Try adjusting your search or filters"
                      : "Customer visits will appear here as they browse the booking site"}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View>
              <VisitorSessionsTable sessions={paged} onViewSession={openDetail} />
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

      {/* Session timeline */}
      <BottomSheet
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Session timeline"
      >
        <ScrollView
          className="px-5 pb-6"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {detailLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !detail ? (
            <View className="py-12 items-center">
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                No activity found for this session.
              </Text>
            </View>
          ) : (
            <View className="pb-4">
              {/* Who, when, and how to reach them — the web modal's header. */}
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                {detail.guestName || "Anonymous visitor"}
              </Text>
              <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {detail.dateLabel}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {detail.firstSeenLabel} – {detail.lastSeenLabel} ET
                </Text>
                {!!detail.guestPhone && (
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${detail.guestPhone}`)}
                    accessibilityRole="link"
                    accessibilityLabel={detail.guestPhone}
                    className="flex-row items-center gap-1 active:opacity-70"
                  >
                    <Feather name="phone" size={11} color={PRIMARY} />
                    <Text className="text-xs text-[#0644C7] dark:text-blue-400">
                      {detail.guestPhone}
                    </Text>
                  </Pressable>
                )}
                {!!detail.guestEmail && (
                  <Pressable
                    onPress={() => Linking.openURL(`mailto:${detail.guestEmail}`)}
                    accessibilityRole="link"
                    accessibilityLabel={detail.guestEmail}
                    className="flex-row items-center gap-1 active:opacity-70"
                  >
                    <Feather name="mail" size={11} color={PRIMARY} />
                    <Text className="text-xs text-[#0644C7] dark:text-blue-400">
                      {detail.guestEmail}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* Summary pills */}
              <View className="flex-row flex-wrap gap-2 mt-3 pb-3 border-b border-gray-100 dark:border-neutral-800">
                <SummaryChip
                  label={`${detail.pageViews} page${detail.pageViews === 1 ? "" : "s"}`}
                  tone="blue"
                />
                <SummaryChip
                  label={`${detail.clicks} click${detail.clicks === 1 ? "" : "s"}`}
                  tone="indigo"
                />
                {detail.conversions > 0 && (
                  <SummaryChip
                    label={`${detail.conversions} purchase${detail.conversions === 1 ? "" : "s"}`}
                    tone="emerald"
                  />
                )}
                <SummaryChip
                  label={`${formatSessionDuration(detail.durationMs)} on site`}
                  tone="gray"
                />
                <SummaryChip
                  label={
                    [detail.deviceType, detail.browser, detail.os]
                      .filter(Boolean)
                      .join(" · ") || "Unknown device"
                  }
                  tone="gray"
                />
              </View>

              {!!detail.referrer && (
                <Text
                  numberOfLines={1}
                  className="text-xs text-gray-400 dark:text-gray-500 mt-3"
                >
                  From: {detail.referrer}
                </Text>
              )}

              {/* Event by event */}
              <View className="mt-2">
                {detail.timeline.map((event) => (
                  <TimelineRow key={event.id} event={event} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default VisitorTracking;
