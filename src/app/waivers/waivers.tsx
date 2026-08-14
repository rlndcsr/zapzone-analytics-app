import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
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
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { DateRangeSheet } from "../../components/ui/DateRangeSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { PaginationControls } from "../../components/ui/PaginationControls";
import {
  countActiveWaiverFilters,
  EMPTY_WAIVER_FILTERS,
  WaiverFiltersSheet,
  type WaiverFilterValues,
} from "../../components/ui/WaiverFiltersSheet";
import { WaiversTable } from "../../components/ui/WaiversTable";
import { WaiverDetailSheet } from "../../components/ui/WaiverDetailSheet";
import {
  WaiversKpiSkeleton,
  WaiversListSkeleton,
} from "../../components/ui/skeleton/WaiversSkeleton";
import {
  consumeWaiversStale,
  useWaivers,
  useWaiverStats,
} from "../../lib/hooks/useWaivers";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { useWaiverSettings } from "../../lib/hooks/useWaiverSettings";
import { apiUrl } from "../../lib/api";
import { formatDateET, venueDateKey } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  checkInWaiver,
  deleteWaiver,
  SOURCE_LABELS,
  type MarketingConsentStatus,
  type Waiver,
  type WaiverSearchFilters,
  type WaiverSource,
  type WaiverStatus,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

type NavItem = {
  label: string;
  desc: string;
  cta: string;
  icon: ComponentIconName;
  route: string;
};

/** Sub-page shortcuts, rendered as a 2-column grid of square cards (the same
 *  design the Packages / Attractions / Events / Bookings modules use). */
const NAV_ITEMS: NavItem[] = [
  {
    label: "Templates",
    desc: "Waiver templates",
    cta: "View Templates",
    icon: "file-text",
    route: "/waivers/templates",
  },
  {
    label: "Groups Invite",
    desc: "Invite groups to your space",
    cta: "Invite Groups",
    icon: "users",
    route: "/waivers/group-invites",
  },
  {
    label: "Reports",
    desc: "View waiver reports",
    cta: "View Reports",
    icon: "bar-chart-2",
    route: "/waivers/reports",
  },
  {
    label: "Deletion Log",
    desc: "View deletion log",
    cta: "View Log",
    icon: "trash-2",
    route: "/waivers/deletion-log",
  },
];

/** Appended to the grid for company admins only. */
const SETTINGS_NAV_ITEM: NavItem = {
  label: "Settings",
  desc: "Company-wide waiver defaults",
  cta: "Open Settings",
  icon: "settings",
  route: "/waivers/waiver-settings",
};

const NAV_CARD_SHADOW = {
  shadowColor: "#424242",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

/** One square shortcut tile in the grid above the waiver records. */
const NavSquareCard = ({
  icon,
  title,
  desc,
  cta,
  onPress,
}: {
  icon: ComponentIconName;
  title: string;
  desc: string;
  cta: string;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="aspect-square bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
    style={NAV_CARD_SHADOW}
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
      <Feather name={icon} size={20} color={PRIMARY} />
    </View>
    <Text
      numberOfLines={1}
      className="text-sm font-bold text-gray-900 dark:text-white mb-1"
    >
      {title}
    </Text>
    <Text
      numberOfLines={2}
      style={{ minHeight: 28 }}
      className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
    >
      {desc}
    </Text>
    <View className="flex-row items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
      <Text
        numberOfLines={1}
        className="flex-1 mr-1 text-xs font-medium text-blue-600 dark:text-blue-400"
      >
        {cta}
      </Text>
      <Feather name="chevron-right" size={16} color={PRIMARY} />
    </View>
  </Pressable>
);

// Statuses the backend supports on the Records filter (mirrors the web select;
// there is no "all statuses" fetch, so one status is always active).
const STATUS_OPTIONS: { label: string; value: WaiverStatus }[] = [
  { label: "Completed", value: "completed" },
  { label: "Pending", value: "pending" },
  { label: "Expired", value: "expired" },
  { label: "Replaced", value: "replaced" },
];

type DateFilter = "all" | "today";
const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: "All Dates", value: "all" },
  { label: "Today", value: "today" },
];

const PER_PAGE_OPTIONS = [5, 10, 25, 50];

/** Toggleable card fields (mirrors the web "Columns" menu). */
type WColKey =
  | "linked"
  | "minors"
  | "template"
  | "location"
  | "source"
  | "date"
  | "submitted"
  | "checkin"
  | "status"
  | "marketing";
type WCols = Record<WColKey, boolean>;
const DEFAULT_WCOLS: WCols = {
  linked: true,
  minors: true,
  template: true,
  location: true,
  source: true,
  date: true,
  submitted: true,
  checkin: true,
  status: true,
  marketing: true,
};
const WCOLUMN_META: { key: WColKey; label: string }[] = [
  { key: "linked", label: "Linked to" },
  { key: "minors", label: "Minors" },
  { key: "template", label: "Template" },
  { key: "location", label: "Location" },
  { key: "source", label: "Source" },
  { key: "date", label: "Date" },
  { key: "submitted", label: "Submitted" },
  { key: "checkin", label: "Check-in" },
  { key: "status", label: "Status" },
  { key: "marketing", label: "Marketing" },
];

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

type KpiTone = { bg: string; tint: string };

const KpiCard = ({
  icon,
  tone,
  title,
  value,
  change,
}: {
  icon: ComponentIconName;
  tone: KpiTone;
  title: string;
  value: string;
  change: string;
}) => (
  <View
    className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 m-1.5 shadow-sm"
    style={CARD_SHADOW}
  >
    <View
      className="w-9 h-9 rounded-xl items-center justify-center"
      style={{ backgroundColor: tone.bg }}
    >
      <Feather name={icon} size={18} color={tone.tint} />
    </View>
    <Text className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3">
      {title}
    </Text>
    <Text
      className="text-2xl font-bold text-gray-900 dark:text-white mt-1"
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {value}
    </Text>
    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
      {change}
    </Text>
  </View>
);

const Waivers = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const role = currentUser?.role;
  const isCompanyAdmin = role === "company_admin";
  // assign is admin/manager only (attendant is read-only) — matches the backend
  // guardManager on POST /waivers/assign.
  const canAssign = isCompanyAdmin || role === "location_manager";
  // Sub-module links: attendants only get Waiver Records on the web sidebar.
  const canManageSubModules = canAssign;

  const { settings } = useWaiverSettings();
  // Admin-only delete, honoring the company's admin_delete_enabled UI hint.
  const canDelete = isCompanyAdmin && (settings?.adminDeleteEnabled ?? true);
  // Inline table actions mirror the web Records row: check-in follows the same
  // admin/manager rule as assign; print/export honors the company setting.
  const canCheckIn = canAssign;
  const canPrint =
    isCompanyAdmin ||
    (role === "location_manager" && (settings?.managerPrintExportEnabled ?? false));

  const [statusFilter, setStatusFilter] = useState<WaiverStatus>("completed");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "status" | "date" | "manage">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Which row has an inline table action (check-in / print / delete) in flight.
  const [busyRowId, setBusyRowId] = useState<number | null>(null);

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
  const [cols, setCols] = useState<WCols>(DEFAULT_WCOLS);
  const [exporting, setExporting] = useState(false);
  const toggleCol = (key: WColKey) =>
    setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFilter, debouncedSearch, perPage, filters]);

  const searchFilters = useMemo<WaiverSearchFilters>(
    () => ({
      status: statusFilter,
      all: dateFilter === "all",
      date: dateFilter === "today" ? todayKey() : undefined,
      adultName: debouncedSearch || undefined,
      source:
        filters.source === "all" ? undefined : (filters.source as WaiverSource),
      marketingConsentStatus:
        filters.marketing === "all"
          ? undefined
          : (filters.marketing as MarketingConsentStatus),
    }),
    [
      statusFilter,
      dateFilter,
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
  const { stats } = useWaiverStats(statsNonce);

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

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? "Completed";
  const dateLabel =
    DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "Today";

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
          // range means the same day the Submitted column shows.
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

  const handleDelete = useCallback(
    (w: Waiver) => {
      Alert.alert(
        "Delete waiver",
        `Delete the waiver for ${w.adultName}? This is recorded in the deletion log and can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) {
                Alert.alert("Not signed in", "Please sign in again to delete.");
                return;
              }
              setBusyRowId(w.id);
              try {
                await deleteWaiver(token, w.id);
                await refetch();
                setStatsNonce((n) => n + 1);
              } catch (err) {
                Alert.alert(
                  "Delete failed",
                  err instanceof Error
                    ? err.message
                    : "Could not delete this waiver.",
                );
              } finally {
                setBusyRowId(null);
              }
            },
          },
        ],
      );
    },
    [refetch],
  );

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
            Waivers
          </Text>
          {canManageSubModules ? (
            <Pressable
              onPress={() => setSheet("manage")}
              className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
              accessibilityRole="button"
              accessibilityLabel="Manage waivers"
            >
              <Feather name="more-horizontal" size={20} color={headerIcon} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
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
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5 mt-5">
          {/* Sub-page shortcuts — a 2-column grid of square cards. Settings is
              company-admin only, so the grid is 4 or 5 cards long. */}
          <View className="flex-row flex-wrap -mx-1.5">
            {(isCompanyAdmin
              ? [...NAV_ITEMS, SETTINGS_NAV_ITEM]
              : NAV_ITEMS
            ).map((item) => (
              <View key={item.route} className="w-1/2 px-1.5 mb-3">
                <NavSquareCard
                  icon={item.icon}
                  title={item.label}
                  desc={item.desc}
                  cta={item.cta}
                  onPress={() => router.push(item.route as never)}
                />
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => router.push("/waivers/create-waiver")}
            className="flex-row mb-5 items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text
              className="text-sm font-semibold text-white"
              numberOfLines={1}
            >
              Assign Waiver
            </Text>
          </Pressable>

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          

          {/* Status · Date pill */}
          <FilterPill>
            <PillSegment
              label={statusLabel}
              active={sheet === "status"}
              onPress={() => setSheet("status")}
              renderIcon={(c) => <Feather name="check-circle" size={15} color={c} />}
            />
            <PillSegment
              label={dateLabel}
              active={sheet === "date"}
              onPress={() => setSheet("date")}
              renderIcon={(c) => <Feather name="calendar" size={15} color={c} />}
            />
          </FilterPill>

          {/* Filters · Columns · Export pill */}
          <FilterPill>
            <PillSegment
              label={
                activeFilterCount > 0
                  ? `Filters (${activeFilterCount})`
                  : "Filters"
              }
              active={showFilters || activeFilterCount > 0}
              onPress={() => setShowFilters(true)}
              renderIcon={(c) => <Feather name="sliders" size={15} color={c} />}
            />
            <PillSegment
              label="Columns"
              active={showColumns}
              onPress={() => setShowColumns(true)}
              renderIcon={(c) => <Feather name="columns" size={15} color={c} />}
            />
            <PillSegment
              label="Export"
              onPress={exportCsv}
              renderIcon={(c) =>
                exporting ? (
                  <ActivityIndicator size="small" color={c} />
                ) : (
                  <Feather name="download" size={15} color={c} />
                )
              }
            />
          </FilterPill>

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by guardian name..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* List header + top pagination (below the title, same state as bottom) */}
          {!loading && !error && (
            <View className="mb-4">
              <View className="flex-row items-center gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-lg font-bold text-gray-900 dark:text-white"
                >
                  Waivers
                </Text>
                <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                  <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {total}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* List / states */}
          {loading ? (
            <WaiversListSkeleton />
          ) : !error && displayed.length === 0 ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather name="file-text" size={26} color="#9CA3AF" />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No waivers found
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                Try a different status, date, or search term.
              </Text>
            </View>
          ) : (
            !error && (
              <>
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

                {/* Pagination (bottom, server-side) — same state as the top */}
                <PaginationControls
                  page={page}
                  lastPage={lastPage}
                  perPage={perPage}
                  perPageOptions={PER_PAGE_OPTIONS}
                  onPageChange={setPage}
                  onPerPageChange={setPerPage}
                />
              </>
            )
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

      {/* Status filter */}
      <BottomSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        title="Filter by Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setStatusFilter(option.value);
                  setSheet(null);
                }}
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

      {/* Date filter */}
      <BottomSheet
        visible={sheet === "date"}
        onClose={() => setSheet(null)}
        title="Filter by Date"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {DATE_OPTIONS.map((option) => {
            const isSelected = dateFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setDateFilter(option.value);
                  setSheet(null);
                }}
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

      {/* Manage (sub-module navigation) */}
      <BottomSheet
        visible={sheet === "manage"}
        onClose={() => setSheet(null)}
        title="Manage Waivers"
      >
        <View className="px-4 pb-8">
          <Pressable
            onPress={() => {
              setSheet(null);
              router.push("/waivers/templates" as never);
            }}
            className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
          >
            <Feather name="layout" size={18} color={PRIMARY} />
            <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
              Waiver Templates
            </Text>
            <Feather name="chevron-right" size={16} color="#9CA3AF" />
          </Pressable>
          <Pressable
            onPress={() => {
              setSheet(null);
              router.push("/waivers/group-invites" as never);
            }}
            className="flex-row items-center gap-3 px-4 py-4 rounded-xl active:bg-gray-50 dark:active:bg-neutral-800"
          >
            <Feather name="users" size={18} color={PRIMARY} />
            <Text className="text-base font-medium text-gray-800 dark:text-gray-100 flex-1">
              Group Invites
            </Text>
            <Feather name="chevron-right" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      </BottomSheet>

      {/* Toggle Columns */}
      <BottomSheet
        visible={showColumns}
        onClose={() => setShowColumns(false)}
        title="Toggle Columns"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {WCOLUMN_META.map((col) => {
            const on = cols[col.key];
            return (
              <Pressable
                key={col.key}
                onPress={() => toggleCol(col.key)}
                className="flex-row items-center gap-3 px-2 py-3.5"
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
          <Pressable
            onPress={() => setCols(DEFAULT_WCOLS)}
            className="mt-2 pt-4 border-t border-gray-100 dark:border-neutral-800 px-2"
          >
            <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Show All
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Waiver detail */}
      <WaiverDetailSheet
        waiverId={selectedId}
        visible={selectedId !== null}
        onClose={() => setSelectedId(null)}
        canDelete={canDelete}
        onChanged={() => {
          refetch();
          setStatsNonce((n) => n + 1);
        }}
      />
    </View>
  );
};

export default Waivers;
