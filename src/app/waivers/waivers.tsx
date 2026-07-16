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
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { StatusBadge } from "../../components/ui/StatusBadge";
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
import { getCurrentUser } from "../../lib/session";
import {
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

// Quick-nav cards all derive their sizing from this single source so every card
// is identical in height, padding, radius, icon box, and footer alignment.
const NAV_CARD_HEIGHT = 176;
const NAV_CARD_SHADOW = {
  shadowColor: "#424242",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

const NAV_ITEMS: {
  label: string;
  desc: string;
  icon: ComponentIconName;
  route: string;
}[] = [
  {
    label: "Templates",
    desc: "Waiver templates",
    icon: "file-text",
    route: "/waivers/templates",
  },
  {
    label: "Groups Invite",
    desc: "Invite groups to your space",
    icon: "users",
    route: "/waivers/groups",
  },
  {
    label: "Reports",
    desc: "View waiver reports",
    icon: "bar-chart-2",
    route: "/waivers/reports",
  },
  {
    label: "Deletion Log",
    desc: "View deletion log",
    icon: "trash-2",
    route: "/waivers/deletion-log",
  },
];

/** Fixed-size quick-navigation card. Every card shares NAV_CARD_HEIGHT and the
 *  same internal layout; a flex spacer pins the "View" footer to the bottom so
 *  cards stay identical regardless of description length. */
const NavCard = ({ item }: { item: (typeof NAV_ITEMS)[number] }) => (
  <View className="w-1/2 px-1.5 mb-3" style={{ height: NAV_CARD_HEIGHT }}>
    <Pressable
      onPress={() => router.push(item.route as never)}
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
      style={NAV_CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
        <Feather name={item.icon} size={20} color="#0644C7" />
      </View>
      <Text
        className="text-sm font-bold text-gray-900 dark:text-white mb-0.5"
        numberOfLines={1}
      >
        {item.label}
      </Text>
      <Text
        className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
        numberOfLines={2}
      >
        {item.desc}
      </Text>
      <View className="flex-1" />
      <View className="flex-row items-center pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
          View
        </Text>
        <Feather name="chevron-right" size={16} color="#0644C7" />
      </View>
    </Pressable>
  </View>
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

const PER_PAGE_OPTIONS = [10, 25, 50];

type SourceFilter = "all" | WaiverSource;
type MarketingFilter = "all" | MarketingConsentStatus;

const SOURCE_OPTIONS: { label: string; value: SourceFilter }[] = [
  { label: "Any source", value: "all" },
  { label: "Checkout", value: "checkout" },
  { label: "Email link", value: "confirmation_email" },
  { label: "SMS link", value: "sms_link" },
  { label: "Kiosk", value: "kiosk" },
  { label: "Staff sent", value: "staff_sent" },
  { label: "Group invite", value: "bulk_invite" },
];
const MARKETING_OPTIONS: { label: string; value: MarketingFilter }[] = [
  { label: "Any marketing consent", value: "all" },
  { label: "Opted in", value: "opted_in" },
  { label: "Not opted in", value: "not_opted_in" },
  { label: "Withdrawn", value: "withdrawn" },
];

/** Toggleable card fields (mirrors the web "Columns" menu). */
type WColKey =
  | "linked"
  | "minors"
  | "template"
  | "location"
  | "source"
  | "date"
  | "submitted"
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
  { key: "status", label: "Status" },
  { key: "marketing", label: "Marketing" },
];

/** A row of chip choices used inside the collapsible Filters panel. */
function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`px-3.5 py-2 rounded-lg border ${
                on
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  on ? "text-white" : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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

const WaiverCard = ({
  waiver,
  showLocation,
  cols,
  onPress,
}: {
  waiver: Waiver;
  showLocation: boolean;
  cols: WCols;
  onPress: () => void;
}) => {
  const linkedTo = waiver.bookingReference
    ? `#${waiver.bookingReference}`
    : waiver.eventName
      ? waiver.eventName
      : waiver.attractionPurchaseId
        ? `AP-${waiver.attractionPurchaseId}`
        : null;

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`View waiver for ${waiver.adultName}`}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {waiver.adultName}
          </Text>
          {!!waiver.adultEmail && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              {waiver.adultEmail}
            </Text>
          )}
        </View>
        {cols.status && <StatusBadge status={waiver.status} />}
      </View>

      {cols.template && (
        <View className="flex-row items-center gap-1.5">
          <Feather name="file-text" size={12} color="#9CA3AF" />
          <Text
            className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1"
            numberOfLines={1}
          >
            {waiver.templateTitle ?? "—"}
          </Text>
        </View>
      )}

      {(cols.date || cols.source) && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Feather name="calendar" size={12} color="#9CA3AF" />
          <Text
            className="text-xs text-gray-500 dark:text-gray-400"
            numberOfLines={1}
          >
            {[
              cols.date ? formatDate(waiver.selectedDate) : null,
              cols.source ? SOURCE_LABELS[waiver.source] ?? waiver.source : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      )}

      {cols.submitted && !!waiver.submittedAt && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Feather name="clock" size={12} color="#9CA3AF" />
          <Text
            className="text-xs text-gray-500 dark:text-gray-400"
            numberOfLines={1}
          >
            Submitted {formatDate(waiver.submittedAt)}
          </Text>
        </View>
      )}

      {cols.location && showLocation && !!waiver.locationName && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Feather name="map-pin" size={12} color="#9CA3AF" />
          <Text
            className="text-xs text-gray-500 dark:text-gray-400"
            numberOfLines={1}
          >
            {waiver.locationName}
          </Text>
        </View>
      )}

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-1.5">
          {cols.minors && (
            <>
              <Feather name="users" size={12} color="#9CA3AF" />
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {waiver.minorsCount} minor{waiver.minorsCount === 1 ? "" : "s"}
              </Text>
            </>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          {cols.marketing && waiver.marketingConsentStatus === "opted_in" && (
            <View className="bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                Opted in
              </Text>
            </View>
          )}
          {cols.linked && !!linkedTo && (
            <View className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">
              <Text
                className="text-[10px] font-medium text-blue-700 dark:text-blue-400"
                numberOfLines={1}
              >
                {linkedTo}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

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

  const [statusFilter, setStatusFilter] = useState<WaiverStatus>("completed");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheet, setSheet] = useState<null | "status" | "date" | "manage">(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [refreshing, setRefreshing] = useState(false);
  const [statsNonce, setStatsNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  // Extra filters (Source + Marketing are server-side; Template + Location are
  // applied client-side over the current page) + column visibility.
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [marketingFilter, setMarketingFilter] = useState<MarketingFilter>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
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
  }, [
    statusFilter,
    dateFilter,
    debouncedSearch,
    perPage,
    sourceFilter,
    marketingFilter,
  ]);

  const filters = useMemo<WaiverSearchFilters>(
    () => ({
      status: statusFilter,
      all: dateFilter === "all",
      date: dateFilter === "today" ? todayKey() : undefined,
      adultName: debouncedSearch || undefined,
      source: sourceFilter === "all" ? undefined : sourceFilter,
      marketingConsentStatus:
        marketingFilter === "all" ? undefined : marketingFilter,
    }),
    [statusFilter, dateFilter, debouncedSearch, sourceFilter, marketingFilter],
  );

  const { waivers, total, lastPage, loading, error, refetch } = useWaivers({
    filters,
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
    DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "All Dates";

  // Template + location options derived from the current page (client-side).
  const templateOptions = useMemo(() => {
    const set = new Map<string, string>();
    waivers.forEach((w) => {
      if (w.templateTitle) set.set(w.templateTitle, w.templateTitle);
    });
    return [
      { label: "Any template", value: "all" },
      ...Array.from(set.keys()).map((t) => ({ label: t, value: t })),
    ];
  }, [waivers]);
  // Apply the client-side Template filter + the global location over the page.
  const displayed = useMemo(
    () =>
      waivers.filter((w) => {
        if (templateFilter !== "all" && w.templateTitle !== templateFilter)
          return false;
        if (
          activeLocation.id !== "all" &&
          w.locationName !== activeLocation.name
        )
          return false;
        return true;
      }),
    [waivers, templateFilter, activeLocation],
  );

  const filtersActive =
    sourceFilter !== "all" ||
    marketingFilter !== "all" ||
    templateFilter !== "all";

  const clearFilters = () => {
    setSourceFilter("all");
    setMarketingFilter("all");
    setTemplateFilter("all");
  };

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
          w.submittedAt ? formatDate(w.submittedAt) : "", w.status,
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
          <View className="flex-row flex-wrap -mx-1.5 mb-2">
            {NAV_ITEMS.map((item) => (
              <NavCard key={item.route} item={item} />
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
              label="Filters"
              active={showFilters || filtersActive}
              onPress={() => setShowFilters((v) => !v)}
              renderIcon={(c) => <Feather name="filter" size={15} color={c} />}
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

          {/* Filters panel */}
          {showFilters && (
            <View
              className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-neutral-800"
              style={CARD_SHADOW}
            >
              <ChipRow
                label="Source"
                options={SOURCE_OPTIONS}
                value={sourceFilter}
                onChange={setSourceFilter}
              />
              <ChipRow
                label="Marketing Consent"
                options={MARKETING_OPTIONS}
                value={marketingFilter}
                onChange={setMarketingFilter}
              />
              <ChipRow
                label="Template"
                options={templateOptions}
                value={templateFilter}
                onChange={setTemplateFilter}
              />
              {filtersActive && (
                <Pressable onPress={clearFilters} className="self-end mt-1">
                  <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    Clear Filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}

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

          {/* List header */}
          {!loading && !error && (
            <View className="flex-row items-center gap-2 mb-4">
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
                {displayed.map((w) => (
                  <WaiverCard
                    key={w.id}
                    waiver={w}
                    showLocation={isCompanyAdmin}
                    cols={cols}
                    onPress={() => setSelectedId(w.id)}
                  />
                ))}

                {/* Pagination (server-side) */}
                <View className="mt-1 mb-4">
                  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800">
                    <View className="flex-row items-center justify-between mb-4">
                      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        Items per page
                      </Text>
                      <View className="flex-row gap-1.5">
                        {PER_PAGE_OPTIONS.map((option) => {
                          const isActive = perPage === option;
                          return (
                            <Pressable
                              key={option}
                              onPress={() => setPerPage(option)}
                              className={`px-3 py-1.5 rounded-lg border ${
                                isActive
                                  ? "bg-[#0644C7] border-[#0644C7]"
                                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                              }`}
                            >
                              <Text
                                className={`text-xs font-medium ${
                                  isActive
                                    ? "text-white"
                                    : "text-gray-600 dark:text-gray-300"
                                }`}
                              >
                                {option}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
                      <Pressable
                        onPress={() => setPage(page - 1)}
                        disabled={page === 1}
                        className={`px-4 py-2 rounded-lg border ${
                          page === 1
                            ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            page === 1
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          Previous
                        </Text>
                      </Pressable>

                      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Page {page} of {lastPage}
                      </Text>

                      <Pressable
                        onPress={() => setPage(page + 1)}
                        disabled={page >= lastPage}
                        className={`px-4 py-2 rounded-lg border ${
                          page >= lastPage
                            ? "bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50"
                            : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            page >= lastPage
                              ? "text-gray-400 dark:text-gray-500"
                              : "text-gray-700 dark:text-gray-200"
                          }`}
                        >
                          Next
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </>
            )
          )}
        </View>
      </ScrollView>

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
