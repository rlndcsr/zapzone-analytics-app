import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { ConcernCard } from "../../components/ui/ConcernCard";
import {
  ConcernsTable,
  STATUS_META,
  describeWanted,
  formatReceived,
} from "../../components/ui/ConcernsTable";
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
  SummaryPanel,
} from "../../components/ui/SummaryPanel";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import {
  AttractionsListSkeleton,
  AttractionsSummarySkeleton,
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  LEAD_FILTER_OPTIONS,
  bookedLabel,
  matchesLeadFilter,
  type LeadFilter,
} from "../../lib/concerns/leadFilter";
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

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

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

/** The Status chips — the web's status select, as the screen's chip row. */
const STATUS_OPTIONS: { label: string; value: ConcernStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Needs a call", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Resolved", value: "resolved" },
];

const KIND_OPTIONS: { label: string; value: string }[] = [
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
  const [lead, setLead] = useState<LeadFilter | "all">("all");
  const [status, setStatus] = useState<ConcernStatus | "all">("new");
  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showFilters, setShowFilters] = useState(false);

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
  }, [timeframe, lead, status, kind, search, perPage, activeLocationId]);

  // Timeframe · lead · status · kind · search, all client-side over the loaded
  // set — the same predicates the web table applies.
  // Everything but Status first, so the Status chips can count each status
  // within the other filters.
  const beforeStatus = useMemo(() => {
    const window = timeframeWindow(timeframe);
    const term = search.trim().toLowerCase();

    return concerns.filter((c) => {
      if (window) {
        const day = venueDateKey(c.createdAt);
        if (!day || day < window.from || day > window.to) return false;
      }
      if (!matchesLeadFilter(c, lead)) return false;
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
  }, [concerns, timeframe, lead, kind, search]);

  const filtered = useMemo(
    () =>
      status === "all"
        ? beforeStatus
        : beforeStatus.filter((c) => c.status === status),
    [beforeStatus, status],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    beforeStatus.forEach((c) =>
      counts.set(c.status, (counts.get(c.status) ?? 0) + 1),
    );
    return counts;
  }, [beforeStatus]);

  /** Filters held in the sheet (Received · Lead · Why) — status has chips. */
  const sheetFilterCount =
    (timeframe !== "all" ? 1 : 0) +
    (lead !== "all" ? 1 : 0) +
    (kind !== "all" ? 1 : 0);

  const clearSheetFilters = useCallback(() => {
    setTimeframe("all");
    setLead("all");
    setKind("all");
  }, []);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  const filtersActive =
    timeframe !== "all" ||
    lead !== "all" ||
    status !== "all" ||
    kind !== "all" ||
    !!search.trim();

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
              ? // The PUT response lacks the list-only booked flag, so keep the
                // row's own; fall back to a local flip if no row came back.
                {
                  ...(updated ?? { ...row, status: next }),
                  completedBooking: row.completedBooking,
                }
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
    // The More shortcut has no disabled state, so a second tap is ignored here.
    if (exporting) return;
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
        "Booked?",
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
          bookedLabel(c),
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
  }, [exporting, filtered]);

  const showInitialLoader = loading && concerns.length === 0;
  const showError = !!error && !loading;

  const clearAll = () => {
    clearSheetFilters();
    setStatus("all");
    setSearch("");
  };

  // Export, plus the sibling Customers screens, as module-hub shortcuts.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: exporting ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => void exportCsv(),
    },
    { label: "Manage Customers", icon: "users", route: "/customers/customers" },
    {
      label: "Customer Analytics",
      icon: "pie-chart",
      route: "/customers/analytics",
    },
    {
      label: "Visitor Tracking",
      icon: "activity",
      route: "/customers/visitor-tracking",
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader title="Customer Concerns" />

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
        <View className="px-4 mt-4">
          {/* Same copy as the web page's intro. */}
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Guests who asked for schedule help, want to book by phone, or left
            checkout with their details filled in
          </Text>

          {/* Global workspace location selector (company-admin only) — the
              list is scoped to it. */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {showError && (
            <ListErrorBanner
              title="Could not load customer concerns"
              message={error ?? ""}
              onRetry={load}
            />
          )}

          {/* Summary — the web's five counters in one panel. */}
          {showInitialLoader ? (
            <AttractionsSummarySkeleton />
          ) : (
            <SummaryPanel
              figures={[
                {
                  icon: "phone-call",
                  title: "Waiting on a Call",
                  value: String(stats?.open ?? 0),
                  hint: "Open concerns",
                },
                {
                  icon: "calendar",
                  title: "Schedule Help",
                  value: String(stats?.scheduleHelp ?? 0),
                  hint: "Calendar did not work",
                },
                {
                  icon: "phone",
                  title: "Call to Book",
                  value: String(stats?.callToBook ?? 0),
                  hint: "No online schedule",
                },
                {
                  icon: "shopping-cart",
                  title: "Left Unfinished",
                  value: String(stats?.abandonedCheckout ?? 0),
                  hint: "Closed checkout mid-way",
                },
                {
                  icon: "inbox",
                  title: "Today",
                  value: String(stats?.today ?? 0),
                  hint: "Received today",
                },
              ]}
            />
          )}

          {/* More — export and the other Customers screens. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters (Received · Lead · Why). */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, phone, email, item…"
            />
            <FiltersButton
              count={sheetFilterCount}
              onPress={() => setShowFilters(true)}
            />
          </View>

          <AppliedFiltersHint
            count={sheetFilterCount}
            onClear={clearSheetFilters}
          />

          {/* Status chips — "Needs a call" starts selected, as on the web. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.value === "all" ? "All" : opt.label}
                count={
                  showInitialLoader
                    ? undefined
                    : opt.value === "all"
                      ? beforeStatus.length
                      : (statusCounts.get(opt.value) ?? 0)
                }
                selected={status === opt.value}
                onPress={() => setStatus(opt.value)}
              />
            ))}
          </ScrollView>

          {/* List header — title + count and the layout toggle, then the cap
              notice when the server holds more than the screen loaded (so a
              filtered count is never read as the total). */}
          {!showInitialLoader && !showError && (
            <>
              <ListHeader title="All Concerns" count={filtered.length}>
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              </ListHeader>
              {(concerns.length !== filtered.length ||
                serverTotal > concerns.length) && (
                <Text className="text-xs text-gray-400 dark:text-gray-500 -mt-1.5 mb-3">
                  {[
                    concerns.length !== filtered.length
                      ? `${filtered.length} of ${concerns.length} loaded`
                      : null,
                    serverTotal > concerns.length
                      ? `Newest ${concerns.length} of ${serverTotal} — older ones aren’t loaded on mobile.`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              )}
            </>
          )}

          {/* List — Table (default) or Cards over the same paged slice. */}
          {showInitialLoader ? (
            <View key="s-loading">
              {viewMode === "table" ? (
                <AttractionsTableSkeleton />
              ) : (
                <AttractionsListSkeleton />
              )}
            </View>
          ) : showError ? null : filtered.length === 0 ? (
            <View key="s-empty">
              {filtersActive ? (
                <ListEmptyState
                  icon="search"
                  title="No concerns found"
                  message="Try adjusting your search or filters."
                  actionLabel="Clear search & filters"
                  onAction={clearAll}
                />
              ) : (
                <ListEmptyState
                  icon="inbox"
                  title="Nothing here"
                  message="No guest is waiting on a call."
                />
              )}
            </View>
          ) : (
            <View key="s-list">
              {viewMode === "table" ? (
                <ConcernsTable
                  concerns={paged}
                  busyId={busyId}
                  onSetStatus={setConcernStatus}
                />
              ) : (
                paged.map((concern) => (
                  <ConcernCard
                    key={concern.id}
                    concern={concern}
                    busy={busyId === concern.id}
                    onSetStatus={setConcernStatus}
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

      {/* Filters — Received · Lead · Why (status lives in the chips). */}
      <BottomSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          <FilterChipGroup
            label="Received"
            options={TIMEFRAMES}
            value={timeframe}
            onChange={setTimeframe}
          />
          <FilterChipGroup
            label="Lead"
            options={LEAD_FILTER_OPTIONS}
            value={lead}
            onChange={setLead}
          />
          <FilterChipGroup
            label="Why"
            options={KIND_OPTIONS}
            value={kind}
            onChange={setKind}
          />
          <FilterSheetFooter
            canReset={sheetFilterCount > 0}
            onReset={clearSheetFilters}
            onDone={() => setShowFilters(false)}
            doneLabel={`Show ${filtered.length} concern${filtered.length === 1 ? "" : "s"}`}
          />
        </ScrollView>
      </BottomSheet>
    </View>
  );
};

export default CustomerConcerns;
