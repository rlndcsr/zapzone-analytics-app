import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { ModuleHeader, SearchField } from "../../components/ui/ModuleHeader";
import { PaginationControls } from "../../components/ui/PaginationControls";
import {
  AttractionsTableSkeleton,
} from "../../components/ui/skeleton/AttractionsSkeleton";
import {
  AppliedFiltersHint,
  FilterChip,
  FiltersButton,
  ListEmptyState,
  ListErrorBanner,
  ListHeader,
  SummaryPanel,
  ToolbarIconButton,
} from "../../components/ui/SummaryPanel";
import {
  countActiveWaiverFilters,
  EMPTY_WAIVER_FILTERS,
  WaiverFiltersSheet,
  type WaiverFilterValues,
} from "../../components/ui/WaiverFiltersSheet";
import {
  DEFAULT_WAIVER_COLS,
  WAIVER_COLUMN_META,
  WaiversTable,
  type WColKey,
  type WCols,
} from "../../components/ui/WaiversTable";
import { WaiverDeleteSheet } from "../../components/ui/WaiverDeleteConfirm";
import { WaiverDetailSheet } from "../../components/ui/WaiverDetailSheet";
import { LaunchKioskSheet } from "../../components/ui/LaunchKioskSheet";
import {
  clearWaiverCache,
  consumeWaiversStale,
  useWaiverPeriodSummary,
  useWaivers,
  useWaiverStats,
} from "../../lib/hooks/useWaivers";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { useWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { apiUrl } from "../../lib/api";
import { formatDateET, venueDateKey } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import { isEscapeRoomTemplate, standardTemplatesOnly } from "../../lib/waivers/templateDisplay";
import { canDeleteWaivers } from "../../lib/waivers/waiverDeletion";
import {
  checkInWaiver,
  fetchTemplates,
  SOURCE_LABELS,
  type WaiverTemplate,
  type MarketingConsentStatus,
  type Waiver,
  type WaiverSearchFilters,
  type WaiverSource,
  type WaiverStatus,
  VISIT_PERIOD_OPTIONS,
  visitPeriodScope,
  type WaiverTimeframe,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

type StatusFilter = WaiverStatus | "all";

// The web Records page's Status select: Completed is the default (the backend's
// own default), "All statuses" sends status=all.
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "Completed", value: "completed" },
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Expired", value: "expired" },
  { label: "Replaced", value: "replaced" },
];

/** The web Records page's Visit Period dropdown, defined once in lib/waivers. */
type DateFilter = WaiverTimeframe;
const DATE_OPTIONS = VISIT_PERIOD_OPTIONS;

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const Waivers = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  // assign is admin/manager only (attendant is read-only) — matches the backend
  // guardManager on POST /waivers/assign, and the web hides the button too.
  const canAssign = isCompanyAdmin || role === "location_manager";
  // Sub-module links: attendants only get Waiver Records on the web sidebar.
  const canManageSubModules = canAssign;

  const { settings } = useWaiverSettings();
  // Admin-only delete, honoring the company's admin_delete_enabled UI hint.
  const canDelete = canDeleteWaivers(role, settings?.adminDeleteEnabled);
  // Inline table actions mirror the web Records row: check-in follows the same
  // admin/manager rule as assign; print/export honors the company setting.
  const canCheckIn = canAssign;
  const canPrint =
    isCompanyAdmin ||
    (role === "location_manager" && (settings?.managerPrintExportEnabled ?? false));

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("completed");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  /** Endpoints for "Custom Range"; both default to today, as on the web. */
  const [customFrom, setCustomFrom] = useState(() => todayKey());
  const [customTo, setCustomTo] = useState(() => todayKey());
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showPeriodSheet, setShowPeriodSheet] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Which row has an inline table action (check-in / print / delete) in flight.
  const [busyRowId, setBusyRowId] = useState<number | null>(null);

  // Kiosk launcher. Templates are fetched on tap, not on mount — the desk should
  // not pay for a list it may never open — and kept, so a second tap reopens the
  // sheet without asking the API again (same as Check-In's).
  const [kioskTemplates, setKioskTemplates] = useState<WaiverTemplate[]>([]);
  const [kioskLoading, setKioskLoading] = useState(false);
  const [kioskOpen, setKioskOpen] = useState(false);

  const openKiosk = useCallback(async () => {
    if (kioskTemplates.length > 0) {
      setKioskOpen(true);
      return;
    }
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Sign in again to open the waiver kiosk.");
      return;
    }
    setKioskLoading(true);
    try {
      const all = await fetchTemplates(token);
      // Escape-room waivers are signed from the escape-room check-in, so the
      // web leaves them out of this kiosk (and says where they live instead).
      const list = standardTemplatesOnly(all);
      if (list.length === 0) {
        if (all.some(isEscapeRoomTemplate)) {
          Alert.alert(
            "No standard waiver templates",
            "Escape-room waivers are signed from Photos › Escape Rooms › Guest check-in. Create a standard waiver to use this kiosk.",
          );
        } else {
          Alert.alert(
            "No waiver templates",
            "No waiver templates exist yet — create one first.",
          );
        }
        return;
      }
      setKioskTemplates(list);
      setKioskOpen(true);
    } catch {
      Alert.alert("Unable to open kiosk", "Could not load waiver templates.");
    } finally {
      setKioskLoading(false);
    }
  }, [kioskTemplates.length]);

  // Global workspace location (company_admin). Waivers has no backend location
  // field, so — as before — location is applied client-side over the current
  // page, now sourced from the shared store instead of a per-screen filter.
  const activeLocation = useActiveLocation();

  // Auto-open a waiver's detail sheet when navigated here from a
  // notification (e.g. /waivers/waivers?openId=123).
  const { openId } = useLocalSearchParams<{ openId?: string }>();
  useEffect(() => {
    if (!openId) return;
    const id = Number(openId);
    if (!Number.isNaN(id)) setSelectedId(id);
    router.setParams({ openId: undefined });
  }, [openId]);

  // Every filter from the web page's Filters dropdown, in one sheet. Source and
  // Marketing go to the backend as query params; Check-In, Template, Location
  // and the Submitted range are applied client-side over the current page.
  const [showFilters, setShowFilters] = useState(false);
  const [showSubmittedRange, setShowSubmittedRange] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [filters, setFilters] = useState<WaiverFilterValues>(
    EMPTY_WAIVER_FILTERS,
  );
  const [cols, setCols] = useState<WCols>(DEFAULT_WAIVER_COLS);
  const [exporting, setExporting] = useState(false);
  const toggleCol = (key: WColKey) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  /**
   * The date half of a request. Shared by the list and the summary panel so the
   * two always count the same period — they are shown side by side, and a
   * mismatch reads as a bug in the data rather than in the filter.
   */
  const dateScope = useMemo(
    () => visitPeriodScope(dateFilter, customFrom, customTo),
    [dateFilter, customFrom, customTo],
  );

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateScope, debouncedSearch, perPage, filters]);

  const searchFilters = useMemo<WaiverSearchFilters>(
    () => ({
      status: statusFilter,
      ...dateScope,
      // The backend's Records search — name, email, phone (any format),
      // reference number and waiver id — the fields the web search box covers.
      search: debouncedSearch || undefined,
      source:
        filters.source === "all" ? undefined : (filters.source as WaiverSource),
      marketingConsentStatus:
        filters.marketing === "all"
          ? undefined
          : (filters.marketing as MarketingConsentStatus),
    }),
    [
      statusFilter,
      dateScope,
      debouncedSearch,
      filters.source,
      filters.marketing,
    ],
  );

  const { waivers, total, lastPage, loading, error, refetch } = useWaivers({
    filters: searchFilters,
    page,
    perPage,
  });
  useWaiverStats(statsNonce);
  // Dashboard-shaped figures for the same period as the list request, fetched
  // separately because they must ignore the status filter — that filter is
  // exactly why the counts and the dashboard looked like they disagreed.
  // Narrowed to the same location the dashboard's waiver card uses — a company
  // admin's workspace location (web parity: effectiveLocationId); everyone else
  // is held to their own location server-side — so its total matches the card.
  const periodLocationId =
    isCompanyAdmin && activeLocation.id !== "all" ? activeLocation.id : undefined;
  const periodScope = useMemo(
    () => ({ ...dateScope, locationId: periodLocationId }),
    [dateScope, periodLocationId],
  );
  const { summary: periodSummary } = useWaiverPeriodSummary(
    periodScope,
    statsNonce,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      setStatsNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Refetch on return after a mutation (assign / delete).
  useFocusEffect(
    useCallback(() => {
      if (consumeWaiversStale()) {
        refetch();
        setStatsNonce((n) => n + 1);
      }
    }, [refetch]),
  );

  // A custom range names its own dates — "Custom Range" alone would not tell
  // the user which period they are looking at.
  const dateLabel =
    dateFilter === "custom"
      ? `${formatShortDate(customFrom)} – ${formatShortDate(customTo)}`
      : (DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "Today");

  // Template + location choices derived from the loaded page, exactly as the
  // web builds its Template / Location filter options.
  const templateNames = useMemo(
    () =>
      Array.from(
        new Set(
          waivers
            .map((w) => w.templateTitle)
            .filter((t): t is string => !!t),
        ),
      ).sort(),
    [waivers],
  );
  const locationNames = useMemo(
    () =>
      Array.from(
        new Set(
          waivers.map((w) => w.locationName).filter((l): l is string => !!l),
        ),
      ).sort(),
    [waivers],
  );

  // The client-side half of the filters — Check-In, Template, Location and the
  // Submitted range — plus the global workspace location, over the fetched page.
  const displayed = useMemo(
    () =>
      waivers.filter((w) => {
        if (filters.checkIn === "checked_in" && !w.checkedInAt) return false;
        if (filters.checkIn === "not_checked_in" && w.checkedInAt) return false;
        if (filters.template !== "all" && w.templateTitle !== filters.template)
          return false;
        if (filters.location !== "all" && w.locationName !== filters.location)
          return false;
        if (filters.submittedStart || filters.submittedEnd) {
          // submittedAt is an instant; compare on its venue calendar day so the
          // range means the same day the Signed column shows.
          const day = venueDateKey(w.submittedAt);
          if (!day) return false;
          if (filters.submittedStart && day < filters.submittedStart)
            return false;
          if (filters.submittedEnd && day > filters.submittedEnd) return false;
        }
        if (
          activeLocation.id !== "all" &&
          w.locationName !== activeLocation.name
        )
          return false;
        return true;
      }),
    [waivers, filters, activeLocation],
  );

  const activeFilterCount = countActiveWaiverFilters(filters);
  // Everything that narrows the list, for the hint: the sheet's filters plus a
  // non-default status or period.
  const appliedCount =
    activeFilterCount +
    (statusFilter !== "completed" ? 1 : 0) +
    (dateFilter !== "today" ? 1 : 0);

  /** The web page's Reset: status, period, custom dates, filters and search. */
  const resetAll = useCallback(() => {
    setStatusFilter("completed");
    setDateFilter("today");
    setCustomFrom(todayKey());
    setCustomTo(todayKey());
    setFilters(EMPTY_WAIVER_FILTERS);
    setSearch("");
  }, []);

  // The calendar and the filter sheet are both native sheets, so close one fully
  // before opening the other (two stacked sheets crash Android).
  const openSubmittedRange = useCallback(() => {
    setShowFilters(false);
    setTimeout(() => setShowSubmittedRange(true), 280);
  }, []);
  const closeSubmittedRange = useCallback(() => {
    setShowSubmittedRange(false);
    setTimeout(() => setShowFilters(true), 280);
  }, []);
  const applySubmittedRange = useCallback((start: string, end: string) => {
    setFilters((f) => ({ ...f, submittedStart: start, submittedEnd: end }));
    setShowSubmittedRange(false);
    setTimeout(() => setShowFilters(true), 280);
  }, []);

  const exportCsv = useCallback(async () => {
    if (displayed.length === 0) {
      Alert.alert("Nothing to export", "There are no waivers to export.");
      return;
    }
    setExporting(true);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const header = [
        "ID", "Name", "Email", "Phone", "Template", "Location",
        "Source", "Minors", "Marketing", "Date", "Submitted", "Status",
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = displayed.map((w) =>
        [
          w.id, w.adultName, w.adultEmail, w.adultPhone,
          w.templateTitle, w.locationName,
          SOURCE_LABELS[w.source] ?? w.source, w.minorsCount,
          w.marketingConsentStatus, formatDate(w.selectedDate),
          w.submittedAt ? formatDateET(w.submittedAt, { month: "short" }) : "", w.status,
        ]
          .map(esc)
          .join(","),
      );
      const csv = [header.map(esc).join(","), ...lines].join("\n");
      const date = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}waivers-export-${date}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Waivers",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("Sharing unavailable", "Sharing isn't available on this device.");
      }
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Could not export.",
      );
    } finally {
      setExporting(false);
    }
  }, [displayed]);

  // Inline table row actions — mirror the web Records "Actions" cell.
  const handleCheckIn = useCallback(
    async (w: Waiver) => {
      const token = getToken();
      if (!token) {
        Alert.alert("Not signed in", "Please sign in again to check in.");
        return;
      }
      setBusyRowId(w.id);
      try {
        await checkInWaiver(token, w.id);
        clearWaiverCache();
        await refetch();
        setStatsNonce((n) => n + 1);
      } catch (err) {
        Alert.alert(
          "Check-in failed",
          err instanceof Error ? err.message : "Could not check in this waiver.",
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [refetch],
  );

  // Downloads the exact server-generated PDF (GET /waivers/{id}/print) with the
  // bearer token, then opens the native print dialog — same flow as the detail
  // sheet's Print button.
  const handlePrint = useCallback(async (w: Waiver) => {
    const token = getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in again to print.");
      return;
    }
    setBusyRowId(w.id);
    try {
      const FileSystem = await import("expo-file-system/legacy");
      const Print = await import("expo-print");
      const dest = `${FileSystem.cacheDirectory}waiver-${w.id}.pdf`;
      const { uri, status } = await FileSystem.downloadAsync(
        apiUrl(`/api/waivers/${w.id}/print`),
        dest,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (status !== 200) {
        Alert.alert(
          "Print unavailable",
          status === 403
            ? "You don't have permission to print this waiver."
            : `Could not generate the waiver PDF (error ${status}).`,
        );
        return;
      }
      await Print.printAsync({ uri });
    } catch (err) {
      Alert.alert(
        "Print failed",
        err instanceof Error ? err.message : "Could not open the print dialog.",
      );
    } finally {
      setBusyRowId(null);
    }
  }, []);

  // Row Delete opens the same confirmation the detail sheet uses (optional
  // reason included); the sheet runs the request and reports the result.
  const [deleteTarget, setDeleteTarget] = useState<Waiver | null>(null);
  const handleDelete = useCallback(
    (w: Waiver) => {
      if (canDelete) setDeleteTarget(w);
    },
    [canDelete],
  );
  const onWaiverDeleted = useCallback(() => {
    clearWaiverCache();
    void refetch();
    setStatsNonce((n) => n + 1);
  }, [refetch]);

  // The web page's Launch Kiosk and Manage menu (Templates, Group Invites,
  // Returning Customers, Reports, Deletion Log, Settings) plus Export and
  // Refresh, as module-hub shortcuts. Role rules are the ones this screen's
  // Manage sheet already applied; Group Invites and Reports follow the web's.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: kioskLoading ? "Loading…" : "Launch Kiosk",
      icon: "tablet",
      onPress: () => {
        if (!kioskLoading) void openKiosk();
      },
    },
    ...(canManageSubModules
      ? ([
          { label: "Templates", icon: "layout", route: "/waivers/templates" },
          { label: "Group Invites", icon: "users", route: "/waivers/group-invites" },
          { label: "Returning Customers", icon: "user-check", route: "/waivers/returning-customers" },
        ] as HubQuickLink[])
      : []),
    { label: "Reports", icon: "bar-chart-2", route: "/waivers/reports" },
    { label: "Deletion Log", icon: "trash-2", route: "/waivers/deletion-log" },
    ...(isCompanyAdmin
      ? ([{ label: "Settings", icon: "settings", route: "/waivers/waiver-settings" }] as HubQuickLink[])
      : []),
    {
      label: exporting ? "Exporting…" : "Export CSV",
      icon: "download",
      onPress: () => {
        if (!exporting) void exportCsv();
      },
    },
    { label: "Refresh", icon: "refresh-cw", onPress: onRefresh },
  ];

  const listTitle =
    statusFilter === "all"
      ? "All Waivers"
      : `${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "Completed"} Waivers`;
  const periodActive = dateFilter !== "today";
  const periodIcon = periodActive
    ? colorScheme === "dark"
      ? "#111827"
      : "#FFFFFF"
    : "#6B7280";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ModuleHeader
        title="Waiver Records"
        action={
          canAssign
            ? {
                onPress: () => router.push("/waivers/create-waiver"),
                accessibilityLabel: "Assign waiver",
                label: "Assign",
              }
            : undefined
        }
      />

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
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Look up signed waivers, assign new ones, and manage records.
          </Text>

          {/* This period, all statuses — counted the way the company dashboard
              counts, so Total reconciles with its waiver card. Hidden when the
              request fails, as on the web. */}
          {periodSummary && (
            <View className="mb-5">
              <SummaryPanel
                figures={[
                  {
                    icon: "file-text",
                    title: "Total",
                    value: String(periodSummary.total),
                    hint: "This period, all statuses",
                  },
                  {
                    icon: "check-circle",
                    title: "Signed",
                    value: String(periodSummary.completed),
                    hint: plural(periodSummary.completed, "Waiver form", "Waiver forms"),
                  },
                  {
                    icon: "users",
                    title: "Participants",
                    value: String(periodSummary.peopleCovered),
                    hint: "Covered",
                  },
                  {
                    icon: "clock",
                    title: "Pending",
                    value: String(periodSummary.pending),
                    hint: "Awaiting signature",
                  },
                  {
                    icon: "user-check",
                    title: "Checked In",
                    value: String(periodSummary.checkedIn),
                    hint: plural(periodSummary.checkedIn, "Form", "Forms"),
                  },
                  {
                    icon: "smile",
                    title: "Minors",
                    value: String(periodSummary.minorsCovered),
                    hint: "Covered",
                  },
                ]}
              />
              {periodSummary.minorAgeBrackets.length > 0 && (
                <Text className="mt-2 text-xs leading-4 text-gray-500 dark:text-gray-400">
                  Minors by age (at signing):{" "}
                  {periodSummary.minorAgeBrackets
                    .map((b) => `${b.bracket}: ${b.count}`)
                    .join(" · ")}
                </Text>
              )}
              <Text className="mt-1 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
                Counted the same way the company dashboard counts, for the same
                period and location — so Total should equal the dashboard&apos;s
                waiver card.
              </Text>
            </View>
          )}

          {/* More — kiosk, related Waivers screens and export as shortcuts. */}
          <View>
            <HubShortcuts title="More" links={moreShortcuts} gutter={SCREEN_GUTTER} />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Name, email, phone or reference"
            />
            <FiltersButton count={activeFilterCount} onPress={() => setShowFilters(true)} />
          </View>

          <AppliedFiltersHint count={appliedCount} onClear={resetAll} />

          {/* Visit period + status — the web page's two server-side selects. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 4, gap: 8 }}
            className="mb-4 -mx-1 px-1"
          >
            <Pressable
              key={periodActive ? "period-on" : "period-off"}
              onPress={() => setShowPeriodSheet(true)}
              accessibilityRole="button"
              accessibilityLabel={`Visit period: ${dateLabel}`}
              className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-1.5 active:opacity-70 ${
                periodActive
                  ? "bg-gray-900 border-gray-900 dark:bg-white dark:border-white"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Feather name="calendar" size={13} color={periodIcon} />
              <Text
                className={`text-sm font-medium ${
                  periodActive ? "text-white dark:text-gray-900" : "text-gray-700 dark:text-gray-200"
                }`}
              >
                {dateLabel}
              </Text>
              <Feather name="chevron-down" size={13} color={periodIcon} />
            </Pressable>
            <View className="w-px bg-gray-200 dark:bg-neutral-800 my-1" />
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip
                key={opt.value}
                label={opt.label}
                selected={statusFilter === opt.value}
                onPress={() => setStatusFilter(opt.value)}
              />
            ))}
          </ScrollView>

          {!loading && error && (
            <ListErrorBanner
              title="Could not load waivers"
              message={error}
              onRetry={onRefresh}
            />
          )}

          {!loading && !error && (
            <ListHeader title={listTitle} count={total}>
              <ToolbarIconButton
                icon="columns"
                label="Toggle columns"
                active={showColumns}
                onPress={() => setShowColumns(true)}
              />
            </ListHeader>
          )}

          {/* List / states — each keyed so switching remounts cleanly. */}
          {loading ? (
            <View key="s-loading">
              <AttractionsTableSkeleton />
            </View>
          ) : error ? null : displayed.length === 0 ? (
            <View key="s-empty">
              <ListEmptyState
                icon="file-text"
                title="No waivers found"
                message="No waivers found for this filter."
                actionLabel={appliedCount > 0 || search ? "Reset filters" : undefined}
                onAction={appliedCount > 0 || search ? resetAll : undefined}
              />
            </View>
          ) : (
            <View key="s-list">
              <WaiversTable
                waivers={displayed}
                cols={cols}
                showLocation={isCompanyAdmin}
                canCheckIn={canCheckIn}
                canPrint={canPrint}
                canDelete={canDelete}
                busyId={busyRowId}
                onRowPress={(w) => setSelectedId(w.id)}
                onCheckIn={handleCheckIn}
                onPrint={handlePrint}
                onDelete={handleDelete}
              />

              {/* Pagination (server-side) */}
              <PaginationControls
                page={page}
                lastPage={lastPage}
                perPage={perPage}
                perPageOptions={PER_PAGE_OPTIONS}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Every filter from the web page's Filters dropdown, in one sheet. */}
      <WaiverFiltersSheet
        visible={showFilters}
        values={filters}
        templates={templateNames}
        locations={locationNames}
        pinnedLocationName={
          activeLocation.id === "all" ? null : activeLocation.name
        }
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_WAIVER_FILTERS)}
        onClose={() => setShowFilters(false)}
        onOpenSubmittedRange={openSubmittedRange}
      />

      {/* Shared calendar for the Submitted range, opened once the filter sheet
          is closed so two sheets are never stacked. */}
      <DateRangeSheet
        visible={showSubmittedRange}
        initialStart={filters.submittedStart || undefined}
        initialEnd={filters.submittedEnd || undefined}
        onClose={closeSubmittedRange}
        onApply={applySubmittedRange}
      />

      {/* Visit period */}
      <BottomSheet
        visible={showPeriodSheet}
        onClose={() => setShowPeriodSheet(false)}
        title="Visit Period"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {DATE_OPTIONS.map((option) => {
            const isSelected = dateFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setShowPeriodSheet(false);
                  // A custom range is not a period until both ends are picked,
                  // so the calendar opens before the filter is applied.
                  if (option.value === "custom") setTimeout(() => setShowRangePicker(true), 280);
                  else setDateFilter(option.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Custom range calendar — the mobile stand-in for the web's two date
          inputs. Applying it is what commits the "custom" period; closing
          without applying leaves the previous period in place. */}
      <DateRangeSheet
        visible={showRangePicker}
        initialStart={customFrom}
        initialEnd={customTo}
        onClose={() => setShowRangePicker(false)}
        onApply={(start, end) => {
          setCustomFrom(start);
          setCustomTo(end);
          setDateFilter("custom");
          setShowRangePicker(false);
        }}
      />

      {/* Toggle Columns — the web Columns menu, Show All and Reset included. */}
      <BottomSheet
        visible={showColumns}
        onClose={() => setShowColumns(false)}
        title="Toggle Columns"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {WAIVER_COLUMN_META.map((col) => {
            const on = cols[col.key];
            return (
              <Pressable
                key={col.key}
                onPress={() => toggleCol(col.key)}
                className="flex-row items-center gap-3 px-2 py-3.5"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center border ${
                    on
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "border-gray-300 dark:border-neutral-600"
                  }`}
                >
                  {on && (
                    <Feather name="check" size={14} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
                <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
                  {col.label}
                </Text>
              </Pressable>
            );
          })}
          <View className="flex-row items-center gap-6 mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800 px-2">
            <Pressable
              onPress={() =>
                setCols(
                  Object.fromEntries(
                    WAIVER_COLUMN_META.map((c) => [c.key, true]),
                  ) as WCols,
                )
              }
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Show All
              </Text>
            </Pressable>
            <Pressable onPress={() => setCols(DEFAULT_WAIVER_COLS)} accessibilityRole="button">
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Reset
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Waiver detail */}
      <WaiverDetailSheet
        waiverId={selectedId}
        visible={selectedId !== null}
        onClose={() => setSelectedId(null)}
        canDelete={canDelete}
        canCheckIn={canCheckIn}
        // The web modal hides Print from attendants only (the server still
        // refuses anyone it should); managers keep it whatever the setting.
        canPrint={role !== "attendant"}
        onChanged={() => {
          clearWaiverCache();
          refetch();
          setStatsNonce((n) => n + 1);
        }}
      />

      {/* Table-row delete — the detail sheet's confirmation, in its own sheet. */}
      <WaiverDeleteSheet
        waiver={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={onWaiverDeleted}
        onBusyChange={setBusyRowId}
      />

      {/* No template in hand here, so the sheet asks which waiver it is. */}
      <LaunchKioskSheet
        template={null}
        templates={kioskTemplates}
        visible={kioskOpen}
        onClose={() => setKioskOpen(false)}
      />
    </View>
  );
};

export default Waivers;
