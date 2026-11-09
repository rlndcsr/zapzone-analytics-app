import { Feather } from "@expo/vector-icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { Pagination } from "../../components/ui/Pagination";
import {
  AppliedFiltersHint,
  FilterChip,
  FilterChipGroup,
  FilterSheetFooter,
  FiltersButton,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SpecCell,
  SummaryPanel,
  ToneDotBadge,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { VisitorSessionsTable } from "../../components/ui/VisitorSessionsTable";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import { venueDateKey } from "../../lib/date/venueTime";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getToken } from "../../lib/session";
import { smsConsentLabel, smsOptInLine } from "../../lib/visitors/smsConsent";
import {
  MAX_LOADED_SESSIONS,
  exportVisitorSessions,
  fetchAllVisitorSessions,
  fetchVisitorSessionDetail,
  fetchVisitorStats,
  formatSessionDuration,
  isKnownVisitor,
  peekVisitorSessions,
  type VisitorActivityFilter,
  type VisitorDeviceType,
  type VisitorIdentityFilter,
  type VisitorSessionDetail,
  type VisitorSessionRow,
  type VisitorStats,
  type VisitorTimelineEvent,
} from "../../services/visitorTrackingService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

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

const IDENTITY_OPTIONS: { label: string; value: IdentityFilter }[] = [
  { label: "All visitors", value: "all" },
  { label: "Known customers", value: "known" },
  { label: "Anonymous", value: "anonymous" },
];

/** The list header's title for each Visitor Type. */
const IDENTITY_TITLE: Record<IdentityFilter, string> = {
  all: "All Sessions",
  known: "Known Customers",
  anonymous: "Anonymous Visitors",
};

const DEVICE_OPTIONS: { label: string; value: DeviceFilter }[] = [
  { label: "All devices", value: "all" },
  { label: "Mobile", value: "mobile" },
  { label: "Desktop", value: "desktop" },
  { label: "Tablet", value: "tablet" },
];

const ACTIVITY_OPTIONS: { label: string; value: ActivityFilter }[] = [
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
 * One session in the Cards layout — the Manage Attractions card: who and when,
 * how to reach them, the entry page, and a Pages / Clicks / Purchases / Time
 * strip. Tapping it opens the same timeline as the table's eye action.
 */
const SessionCard = ({
  session,
  onPress,
}: {
  session: VisitorSessionRow;
  onPress: () => void;
}) => {
  const known = isKnownVisitor(session);
  const contact = [session.guestPhone, session.guestEmail]
    .filter(Boolean)
    .join(" · ");
  const sms = smsConsentLabel(session);
  const device = [session.deviceType, session.browser]
    .filter(Boolean)
    .join(" · ");
  const entry = session.entryTitle || session.entryPage;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Session for ${session.guestName || "anonymous visitor"}`}
      className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white active:opacity-80 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              {session.guestName || "Anonymous visitor"}
            </Text>
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
            >
              {session.dateLabel} · {session.firstSeenLabel} –{" "}
              {session.lastSeenLabel} ET
            </Text>
          </View>
          <ToneDotBadge
            tone={known ? "green" : "gray"}
            label={known ? "Known" : "Anonymous"}
          />
        </View>
        {!!contact && (
          <Text
            numberOfLines={1}
            className="mt-2 text-xs text-gray-600 dark:text-gray-300"
          >
            {contact}
            {sms ? ` · SMS: ${sms}` : ""}
          </Text>
        )}
        {(!!entry || !!device) && (
          <Text
            numberOfLines={1}
            className="mt-1 text-[11px] text-gray-400 dark:text-gray-500"
          >
            {[entry ? `Entry: ${entry}` : "", device].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      <View className="flex-row border-t border-gray-200 dark:border-neutral-800">
        <SpecCell label="Pages" value={String(session.pageViews)} />
        <SpecCell divider label="Clicks" value={String(session.clicks)} />
        <SpecCell
          divider
          label="Purchases"
          value={String(session.conversions)}
          valueClassName={
            session.conversions > 0
              ? "text-green-600 dark:text-green-400"
              : undefined
          }
        />
        <SpecCell
          divider
          label="Time"
          value={formatSessionDuration(session.durationMs)}
        />
      </View>
    </Pressable>
  );
};

/**
 * Visitor Tracking — every customer visit as its own session (one visitor, one
 * day, Michigan time). Reads the same `/api/visitor-sessions` endpoints as the
 * web admin page: the grouped list (loaded in one request so the filters below
 * run over the whole set), the statistics behind the four counters, the
 * server-side export, and one session's timeline behind the eye action.
 */
const VisitorTracking = () => {
  const insets = useSafeAreaInsets();

  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const [sessions, setSessions] = useState<VisitorSessionRow[]>([]);
  const [capped, setCapped] = useState(false);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(true);
  /** Counters only. Separate from `loading` so the tiles are never gated on the
   *  table's much slower paged load. */
  const [statsLoading, setStatsLoading] = useState(true);
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
  const [perPage, setPerPage] = useState(5);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showFilters, setShowFilters] = useState(false);

  // Only the newest load of each may write state — a location switch or a
  // refresh can leave an older request in flight behind it.
  const loadSeq = useRef(0);
  const statsSeq = useRef(0);

  // Session timeline sheet.
  const [detail, setDetail] = useState<VisitorSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Sessions and counters are two separate endpoints and load independently, the
  // way the web page's `loadSessions` / `loadStats` do. They used to share one
  // `Promise.all`, which is what held the counters behind the table.
  const loadSessions = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const seq = ++loadSeq.current;
      const isCurrent = () => seq === loadSeq.current;

      const token = getToken();
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      // Cached rows paint straight away and refresh behind; a pull-to-refresh
      // asks for fresh data, so it skips the cache and keeps its spinner.
      const cached = force ? null : peekVisitorSessions(activeLocationId);
      if (cached) {
        setSessions(cached.rows);
        setCapped(cached.capped);
        setError(null);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const list = await fetchAllVisitorSessions({
          token,
          locationId: activeLocationId,
        });
        if (!isCurrent()) return;
        setSessions(list.rows);
        setCapped(list.capped);
        setError(null);
      } catch (err) {
        if (!isCurrent()) return;
        // A failed revalidation keeps the cached rows rather than replacing
        // them with the error state; a pull-to-refresh always surfaces it.
        if (!cached)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load visitor sessions — you may not have permission.",
          );
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [activeLocationId],
  );

  // Best-effort, and deliberately kept out of `error`: the web swallows a stats
  // failure as well, so the tiles fall back to 0 and the table is unaffected —
  // and a table failure leaves whatever the counters already showed in place.
  const loadStats = useCallback(async () => {
    const seq = ++statsSeq.current;
    const isCurrent = () => seq === statsSeq.current;

    const token = getToken();
    if (!token) {
      setStatsLoading(false);
      return;
    }
    setStatsLoading(true);
    try {
      const next = await fetchVisitorStats(token, activeLocationId);
      if (isCurrent()) setStats(next);
    } catch {
      if (isCurrent()) setStats(null);
    } finally {
      if (isCurrent()) setStatsLoading(false);
    }
  }, [activeLocationId]);

  useEffect(() => {
    loadSessions();
    loadStats();
  }, [loadSessions, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Both settle before the spinner retracts, but neither waits on the other
      // to *render* — and neither rejects, both handle their own failure.
      await Promise.all([loadSessions({ force: true }), loadStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadSessions, loadStats]);

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

  // The Filters sheet's applied count — Visitor Type starts on "Known
  // customers", so the badge honestly shows 1 on open, like the web default.
  const activeFilterCount =
    (identity !== "all" ? 1 : 0) +
    (device !== "all" ? 1 : 0) +
    (activity !== "all" ? 1 : 0);

  const clearFilters = useCallback(() => {
    setIdentity("all");
    setDevice("all");
    setActivity("all");
  }, []);

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
        "SMS",
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
          smsConsentLabel(s),
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

  // Sibling customer screens plus Export CSV (the old header icon), as
  // module-hub shortcuts.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: exporting ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
    { label: "Manage Customers", icon: "users", route: "/customers/customers" },
    {
      label: "Customer Analytics",
      icon: "pie-chart",
      route: "/customers/analytics",
    },
    {
      label: "Customer Concerns",
      icon: "message-circle",
      route: "/customers/customer-concerns",
    },
  ];

  const showInitialLoader = loading && sessions.length === 0;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader title="Visitor Tracking" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
        <View className="mt-4 px-4">
          {/* Same copy as the web page's intro. */}
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Every customer visit as its own session — one visitor, one day,
            Michigan time
          </Text>

          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state (nothing cached to show). */}
          {!showInitialLoader && !!error && (
            <ListErrorBanner
              title="Could not load visitor sessions"
              message={error}
              onRetry={() => void loadSessions({ force: true })}
            />
          )}

          {/* Counters — gated on their own request, not the table's. Skeleton
              only while there is nothing to show, so a refresh updates the
              figures in place instead of dropping back to the skeleton. */}
          {statsLoading && !stats ? (
            <AttractionsSummarySkeleton />
          ) : (
            <SummaryPanel
              figures={[
                {
                  icon: "activity",
                  title: "Sessions Today",
                  value: String(stats?.sessionsToday ?? 0),
                  hint: "One row per visitor per day",
                },
                {
                  icon: "calendar",
                  title: "Sessions This Week",
                  value: String(stats?.sessionsWeek ?? 0),
                  hint: "Last 7 days",
                },
                {
                  icon: "user-check",
                  title: "Identified Today",
                  value: String(stats?.identifiedToday ?? 0),
                  hint: "Gave a name and number",
                },
                {
                  icon: "users",
                  title: "Known Visitors",
                  value: String(stats?.identifiedTotal ?? 0),
                  hint: "All-time identified",
                },
              ]}
            />
          )}

          {/* More — Export CSV and the sibling customer screens. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters (Visitor Type · Device · Activity). */}
          <View className="mb-3 mt-4 flex-row items-center gap-2">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, phone, email or page"
            />
            <FiltersButton
              count={activeFilterCount}
              onPress={() => setShowFilters(true)}
            />
          </View>

          <AppliedFiltersHint count={activeFilterCount} onClear={clearFilters} />

          {/* Time frame chips — the web's TIME FRAME button row. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="-mx-1 mb-4 px-1"
          >
            {TIMEFRAMES.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={timeframe === option.value}
                onPress={() => setTimeframe(option.value)}
              />
            ))}
          </ScrollView>

          {/* Load cap notice, same wording as the web banner. */}
          {capped && (
            <View className="mb-4 flex-row gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900/40 dark:bg-amber-900/20">
              <Feather name="info" size={16} color="#D97706" />
              <Text className="flex-1 text-sm text-amber-800 dark:text-amber-200">
                Showing the {MAX_LOADED_SESSIONS.toLocaleString()} most recent
                sessions — use Export CSV or the time frame for older activity.
              </Text>
            </View>
          )}

          {/* List header — title + count, layout toggle. */}
          {!showInitialLoader && !error && (
            <>
              <ListHeader title={IDENTITY_TITLE[identity]} count={filtered.length}>
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </ListHeader>
              {sessions.length !== filtered.length && (
                <Text className="-mt-1.5 mb-3 text-xs text-gray-400 dark:text-gray-500">
                  {filtered.length} of {sessions.length} loaded{" "}
                  {sessions.length === 1 ? "session" : "sessions"}
                </Text>
              )}
            </>
          )}

          {/* List / states — each keyed so switching remounts cleanly. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? (
                <AttractionsTableSkeleton />
              ) : (
                <AttractionsListSkeleton />
              )}
            </View>
          ) : error ? null : filtered.length === 0 ? (
            identity === "known" && sessions.length > 0 ? (
              <View key="s-no-known">
                <ListEmptyState
                  icon="user-check"
                  title="No known customers yet"
                  message={`Guests appear here once they enter their name and number in the welcome popup. There ${
                    sessions.length === 1 ? "is" : "are"
                  } ${sessions.length} anonymous session${
                    sessions.length === 1 ? "" : "s"
                  } behind this filter.`}
                  actionLabel="Show all visitors"
                  actionIcon="users"
                  onAction={() => setIdentity("all")}
                />
              </View>
            ) : (
              <View key="s-empty">
                <ListEmptyState
                  icon={filtersActive ? "search" : "users"}
                  title="No visits recorded"
                  message={
                    filtersActive
                      ? "Try adjusting your search or filters."
                      : "Customer visits will appear here as they browse the booking site."
                  }
                  actionLabel={
                    filtersActive ? "Clear search & filters" : undefined
                  }
                  onAction={
                    filtersActive
                      ? () => {
                          setSearch("");
                          setTimeframe("all");
                          clearFilters();
                        }
                      : undefined
                  }
                />
              </View>
            )
          ) : (
            <View key="s-list">
              {/* Table (default) and Cards render from the same `paged`
                  slice — switching is instant and keeps the page. */}
              {viewMode === "table" ? (
                <VisitorSessionsTable
                  sessions={paged}
                  onViewSession={openDetail}
                />
              ) : (
                paged.map((session) => (
                  <SessionCard
                    key={`${session.visitorId}-${session.sessionDate}`}
                    session={session}
                    onPress={() => void openDetail(session)}
                  />
                ))
              )}
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

      {/* Filters — Visitor Type · Device · Activity, applied as tapped. */}
      <BottomSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
      >
        <ScrollView
          className="px-5 pb-6"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <FilterChipGroup
            label="Visitor Type"
            options={IDENTITY_OPTIONS}
            value={identity}
            onChange={setIdentity}
          />
          <FilterChipGroup
            label="Device"
            options={DEVICE_OPTIONS}
            value={device}
            onChange={setDevice}
          />
          <FilterChipGroup
            label="Activity"
            options={ACTIVITY_OPTIONS}
            value={activity}
            onChange={setActivity}
          />
          <FilterSheetFooter
            canReset={activeFilterCount > 0}
            onReset={clearFilters}
            onDone={() => setShowFilters(false)}
            doneLabel={`Show ${filtered.length} ${
              filtered.length === 1 ? "session" : "sessions"
            }`}
          />
        </ScrollView>
      </BottomSheet>

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
                {!!smsOptInLine(detail) && (
                  <Text className="text-xs font-medium text-green-600 dark:text-green-400">
                    {smsOptInLine(detail)}
                  </Text>
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
