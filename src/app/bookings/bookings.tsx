import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useColorScheme } from "nativewind";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingActionsSheet } from "../../components/ui/BookingActionsSheet";
import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { BookingsImportSheet } from "../../components/ui/BookingsImportSheet";
import { BookingsMoreSheet } from "../../components/ui/BookingsMoreSheet";
import { BookingsReportSheet } from "../../components/ui/BookingsReportSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { FilterPill, PillSegment } from "../../components/ui/FilterPill";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { AttractionsKpiSkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { BookingsListSkeleton } from "../../components/ui/skeleton/BookingsSkeleton";
import { consumeBookingsStale, useBookings } from "../../lib/hooks/useBookings";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  exportBookings,
  fetchTrashedBookings,
  type BookingStatus,
  type CalendarBooking,
  type TrashedBooking,
} from "../../services/bookingsService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

type ComponentIconName = ComponentProps<typeof Feather>["name"];

type StatusFilter = "all" | BookingStatus;
type DateFilter = "all" | "upcoming" | "today" | "past";

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All Statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Checked In", value: "checked-in" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: "All Dates", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Today", value: "today" },
  { label: "Past", value: "past" },
];

const PER_PAGE_OPTIONS = [5, 10, 15];

/** Raw booking shape returned by GET /api/bookings/export (subset we render). */
type ExportRow = {
  reference_number?: string | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  package?: { name?: string | null } | null;
  room?: { name?: string | null } | null;
  location?: { name?: string | null } | null;
  booking_date?: string | null;
  booking_time?: string | null;
  participants?: number | string | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  status?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  attractions?:
    | { name?: string | null; pivot?: { quantity?: number | null } | null }[]
    | null;
  add_ons?:
    | { name?: string | null; pivot?: { quantity?: number | null } | null }[]
    | null;
  notes?: string | null;
  created_at?: string | null;
};

/** Build the same CSV the web admin exports (identical column order). */
function buildBookingsCsv(rows: ExportRow[]): string {
  const headers = [
    "Reference Number",
    "Customer Name",
    "Email",
    "Phone",
    "Package",
    "Room",
    "Location",
    "Date",
    "Time",
    "Participants",
    "Duration",
    "Status",
    "Payment Method",
    "Payment Status",
    "Total Amount",
    "Amount Paid",
    "Attractions",
    "Add-ons",
    "Notes",
    "Created At",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const items = (list: ExportRow["attractions"]) =>
    (list ?? [])
      .map((a) => `${a.name ?? ""} (${a.pivot?.quantity ?? 1})`)
      .join("; ");
  const line = (b: ExportRow) =>
    [
      b.reference_number ?? "",
      b.customer
        ? `${b.customer.first_name ?? ""} ${b.customer.last_name ?? ""}`.trim()
        : (b.guest_name ?? ""),
      b.customer?.email ?? b.guest_email ?? "",
      b.customer?.phone ?? b.guest_phone ?? "",
      b.package?.name ?? "",
      b.room?.name ?? "",
      b.location?.name ?? "",
      b.booking_date ?? "",
      b.booking_time ? formatTime(b.booking_time.substring(0, 5)) : "",
      b.participants ?? 0,
      b.duration && b.duration_unit ? `${b.duration} ${b.duration_unit}` : "",
      b.status ?? "",
      b.payment_method ?? "",
      b.payment_status ?? "",
      b.total_amount ?? 0,
      b.amount_paid ?? 0,
      items(b.attractions),
      items(b.add_ons),
      b.notes ?? "",
      b.created_at ?? "",
    ]
      .map(esc)
      .join(",");
  return [headers.map(esc).join(","), ...rows.map(line)].join("\n");
}

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Local calendar date as YYYY-MM-DD (lexically comparable to booking.date). */
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

function formatTime(time: string | null): string {
  if (!time) return "";
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

/** Minutes since midnight for an "HH:MM" time; null/blank → 0 (matches the web's
 *  '00:00' fallback). */
function timeToMinutes(time: string | null): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Default booking order, identical to the web admin's applyDefaultSort
 * (Bookings.tsx): checked-in bookings sink to the bottom, then by date
 * descending (newest first — booking.date is YYYY-MM-DD, so a lexical compare is
 * chronological), then by time descending (latest first).
 */
function compareBookingsDefault(
  a: CalendarBooking,
  b: CalendarBooking,
): number {
  const aChecked = a.status === "checked-in";
  const bChecked = b.status === "checked-in";
  if (aChecked && !bChecked) return 1;
  if (!aChecked && bChecked) return -1;
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return timeToMinutes(b.time) - timeToMinutes(a.time);
}

const Stat = ({ icon, label }: { icon: ComponentIconName; label: string }) => (
  <View className="flex-row items-center gap-1.5">
    <Feather name={icon} size={12} color="#9CA3AF" />
    <Text
      className="text-xs text-gray-500 dark:text-gray-400"
      numberOfLines={1}
    >
      {label}
    </Text>
  </View>
);

const BookingCard = ({
  booking,
  showLocation,
  onPress,
  onMore,
}: {
  booking: CalendarBooking;
  showLocation: boolean;
  onPress: () => void;
  onMore: () => void;
}) => {
  const dateTime = [formatDate(booking.date), formatTime(booking.time)]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm active:opacity-90"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={`View booking for ${booking.customerName}`}
    >
      {/* Header: customer + ref (left), status (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {booking.customerName}
          </Text>
          {!!booking.referenceNumber && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              #{booking.referenceNumber}
            </Text>
          )}
        </View>
        <StatusBadge status={booking.status} />
      </View>

      {/* Package */}
      <View className="flex-row items-center gap-1.5">
        <Feather name="package" size={12} color="#9CA3AF" />
        <Text
          className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {booking.packageName}
        </Text>
      </View>

      {/* Date / time */}
      <View className="flex-row items-center gap-1.5 mt-1">
        <Feather name="calendar" size={12} color="#9CA3AF" />
        <Text
          className="text-xs text-gray-500 dark:text-gray-400"
          numberOfLines={1}
        >
          {dateTime}
        </Text>
      </View>

      {/* Location */}
      {showLocation && !!booking.locationName && (
        <View className="flex-row items-center gap-1.5 mt-1">
          <Feather name="map-pin" size={12} color="#9CA3AF" />
          <Text
            className="text-xs text-gray-500 dark:text-gray-400"
            numberOfLines={1}
          >
            {booking.locationName}
          </Text>
        </View>
      )}

      {/* Footer: guests + total + More */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Stat icon="users" label={`${booking.participants} guests`} />
        <View className="flex-row items-center gap-1">
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            {formatMoney(booking.totalAmount)}
          </Text>
          <Pressable
            onPress={onMore}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${booking.customerName}`}
            className="ml-1 p-1.5 rounded-full active:bg-gray-100 dark:active:bg-neutral-800"
          >
            <Feather name="more-vertical" size={18} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

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

const Bookings = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";
  // Location scope for export / report / import. Managers carry their own
  // location_id; company admins have none here (the list scopes by name, not id),
  // so those flows run unscoped / all-locations for them, like the backend allows.
  const scopeLocationId = currentUser?.location_id ?? null;

  const { bookings, loading, error, refetch } = useBookings();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [sheet, setSheet] = useState<null | "status" | "date" | "location">(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  // The booking whose "More" actions sheet is open (null = closed).
  const [actionsBooking, setActionsBooking] = useState<CalendarBooking | null>(
    null,
  );

  // Page-level "More" menu (mirrors the web header ActionMenu) + its flows.
  const [moreOpen, setMoreOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  // "View Deleted" — trashed bookings loaded lazily when toggled on.
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedItems, setDeletedItems] = useState<TrashedBooking[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);

  const loadDeleted = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setDeletedError("Not authenticated");
      return;
    }
    setDeletedLoading(true);
    setDeletedError(null);
    try {
      const items = await fetchTrashedBookings({
        token,
        locationId: scopeLocationId ?? undefined,
      });
      setDeletedItems(items);
    } catch (e) {
      setDeletedError(
        e instanceof Error ? e.message : "Failed to load deleted bookings",
      );
    } finally {
      setDeletedLoading(false);
    }
  }, [scopeLocationId]);

  // Load / reload the trashed list whenever it's shown.
  useEffect(() => {
    if (showDeleted) loadDeleted();
  }, [showDeleted, loadDeleted]);

  const runExport = useCallback(async () => {
    setExporting(true);
    try {
      const token = getToken();
      if (!token) {
        Alert.alert("Not authenticated");
        return;
      }
      const rows = await exportBookings(token, scopeLocationId);
      if (rows.length === 0) {
        Alert.alert("Nothing to export", "There are no bookings to export.");
        return;
      }
      const FileSystem = await import("expo-file-system/legacy");
      const Sharing = await import("expo-sharing");
      const csv = buildBookingsCsv(rows as unknown as ExportRow[]);
      const stamp = new Date().toISOString().split("T")[0];
      const uri = `${FileSystem.cacheDirectory}bookings-export-${stamp}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "text/csv",
          dialogTitle: "Export Bookings",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("Export ready", `Saved to ${uri}`);
      }
      setMoreOpen(false);
    } catch (e) {
      Alert.alert(
        "Export failed",
        e instanceof Error ? e.message : "Could not export bookings.",
      );
    } finally {
      setExporting(false);
    }
  }, [scopeLocationId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await (showDeleted ? loadDeleted() : refetch());
    } finally {
      setRefreshing(false);
    }
  }, [showDeleted, loadDeleted, refetch]);

  // Refetch on return after a mutation (e.g. a status/payment change from the
  // detail sheet) so the list + KPIs reflect it without a manual pull.
  useFocusEffect(
    useCallback(() => {
      if (consumeBookingsStale()) refetch();
    }, [refetch]),
  );

  // Location options derived from the loaded bookings — avoids the heavy
  // /api/locations endpoint (which OOM-crashes the app). Company admins load
  // every location's bookings; managers are scoped to their own by the backend.
  const locations = useMemo(() => {
    const names = new Set<string>();
    for (const b of bookings) {
      if (b.locationName) names.add(b.locationName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [bookings]);

  // Bookings scoped to the selected location. Drives the KPI cards and is the
  // base for the searchable list — mirrors the web location selector.
  const locationScoped = useMemo(
    () =>
      locationFilter === "all"
        ? bookings
        : bookings.filter((b) => b.locationName === locationFilter),
    [bookings, locationFilter],
  );

  // KPI values, computed client-side over the location-scoped set — mirroring
  // the web's `metrics` array exactly (Bookings.tsx:409-445). The web has no
  // stats endpoint; it derives all five cards from the loaded bookings array
  // (which is location-scoped when a location is selected). We do the same off
  // the same `/api/bookings` list feed, so there are no extra requests.
  const kpis = useMemo(() => {
    const active = locationScoped.filter((b) => b.status !== "cancelled");
    return {
      // Total Bookings — bookings.length
      total: locationScoped.length,
      // Package Bookings — same count as total (all bookings are packages);
      // the subtitle surfaces the confirmed count.
      confirmed: locationScoped.filter((b) => b.status === "confirmed").length,
      cancelled: locationScoped.length - active.length,
      // Participants — sum of participants
      participants: locationScoped.reduce((s, b) => s + b.participants, 0),
      // Revenue — sum of amountPaid, excluding cancelled
      revenue: active.reduce((s, b) => s + b.amountPaid, 0),
      // Possible Revenue — sum of totalAmount, excluding cancelled
      possibleRevenue: active.reduce((s, b) => s + b.totalAmount, 0),
    };
  }, [locationScoped]);

  // Deleted bookings, scoped to the selected location the same way active ones
  // are. The list uses this when "View Deleted" is on; KPIs always use active.
  const deletedScoped = useMemo(
    () =>
      locationFilter === "all"
        ? deletedItems
        : deletedItems.filter((b) => b.locationName === locationFilter),
    [deletedItems, locationFilter],
  );
  const listBase = showDeleted ? deletedScoped : locationScoped;
  const listLoading = showDeleted ? deletedLoading : loading;
  const listError = showDeleted ? deletedError : error;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = todayKey();
    const result = listBase.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (dateFilter === "upcoming" && b.date < today) return false;
      if (dateFilter === "today" && b.date !== today) return false;
      if (dateFilter === "past" && b.date >= today) return false;
      if (term) {
        const haystack =
          `${b.customerName} ${b.packageName} ${b.referenceNumber ?? ""} ${b.locationName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    // Default ordering identical to the web (applyDefaultSort). The deleted list
    // keeps its deleted_at-desc fetch order, matching the web's trashed view.
    return showDeleted ? result : result.sort(compareBookingsDefault);
  }, [listBase, search, statusFilter, dateFilter, showDeleted]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFilter, locationFilter, perPage, showDeleted]);

  const statusLabel =
    STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ??
    "All Statuses";
  const dateLabel =
    DATE_OPTIONS.find((o) => o.value === dateFilter)?.label ?? "All Dates";
  const locationLabel =
    locationFilter === "all" ? "All Locations" : locationFilter;
  const hasResults = filtered.length > 0;

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
            Bookings
          </Text>
          {/* Calendar View cross-link (mirrors the web list↔calendar toggle). */}
          <Pressable
            onPress={() => router.push("/bookings/calendar" as never)}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Open calendar view"
          >
            <Feather name="calendar" size={20} color={headerIcon} />
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
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5 mt-5">
          <View className="flex-row items-stretch gap-3 mb-5">
            {/* Space Schedule Card */}
            <Pressable
              onPress={() => router.push("/bookings/space-schedule")}
              className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
              style={{
                shadowColor: "#424242",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
                <Feather name="grid" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Space Schedule
              </Text>
              <Text
                numberOfLines={2}
                style={{ minHeight: 28 }}
                className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
              >
                View all customer bookings
              </Text>
              <View className="flex-row items-center mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  View All
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>

            {/* Onsite Purchase Card */}
            <Pressable
              onPress={() => router.push("/bookings/check-in")}
              className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800 active:opacity-70"
              style={{
                shadowColor: "#424242",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 6,
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-xl bg-[#0644C7]/10 items-center justify-center mb-3">
                <Feather name="camera" size={20} color="#0644C7" />
              </View>
              <Text className="text-sm font-bold text-gray-900 dark:text-white mb-1">
                Check-in
              </Text>
              <Text
                numberOfLines={2}
                style={{ minHeight: 28 }}
                className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight"
              >
                Checking in customers
              </Text>
              <View className="flex-row items-center mt-auto pt-3 border-t border-gray-100 dark:border-neutral-800">
                <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  Scan QR Code
                </Text>
                <Feather name="chevron-right" size={16} color="#0644C7" />
              </View>
            </Pressable>
          </View>

          {/* Location selector — company-admin only; managers are scoped to
              their own location by the backend. */}
          {isCompanyAdmin && (
            <FilterPill>
              <PillSegment
                label={locationLabel}
                active={sheet === "location"}
                onPress={() => setSheet("location")}
                renderIcon={(c) => (
                  <Feather name="map-pin" size={15} color={c} />
                )}
              />
            </FilterPill>
          )}

          {/* Secondary "More" + primary "Create New Booking" on one row, equal
              width. "More" stays outlined/secondary; "Create New Booking" is
              the primary filled CTA. */}
          <View className="flex-row items-center gap-3 mb-5">
            <Pressable
              onPress={() => setMoreOpen(true)}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
            >
              <Feather name="more-horizontal" size={16} color="#6B7280" />
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                More
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/bookings/create-booking")}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white">
                New Booking
              </Text>
            </Pressable>
          </View>

          {/* Error state */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* KPI cards */}
          {loading ? (
            <AttractionsKpiSkeleton />
          ) : (
            <View className="flex-row flex-wrap -mx-1.5 mb-3">
              <View className="w-1/2">
                <KpiCard
                  icon="calendar"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Total Bookings"
                  value={String(kpis.total)}
                  change={`${kpis.total} total bookings`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="package"
                  tone={{ bg: "#0644C720", tint: PRIMARY }}
                  title="Package Bookings"
                  value={String(kpis.total)}
                  change={`${kpis.confirmed} confirmed`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="users"
                  tone={{ bg: "#F59E0B20", tint: "#F59E0B" }}
                  title="Participants"
                  value={String(kpis.participants)}
                  change={`${kpis.total} bookings`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="dollar-sign"
                  tone={{ bg: "#10B98120", tint: "#10B981" }}
                  title="Revenue"
                  value={formatMoney(kpis.revenue)}
                  change={`Excludes ${kpis.cancelled} cancelled`}
                />
              </View>
              <View className="w-1/2">
                <KpiCard
                  icon="dollar-sign"
                  tone={{ bg: "#A78BFA20", tint: "#A78BFA" }}
                  title="Possible Revenue"
                  value={formatMoney(kpis.possibleRevenue)}
                  change="Total if all bookings fully paid"
                />
              </View>
            </View>
          )}

          {/* Search */}
          <View className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800 mt-2 mb-3">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search bookings..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Filters — full-width segmented pill (Status · Date) */}
          <FilterPill>
            <PillSegment
              label={statusLabel}
              active={sheet === "status"}
              onPress={() => setSheet("status")}
              renderIcon={(c) => (
                <Feather name="check-circle" size={15} color={c} />
              )}
            />
            <PillSegment
              label={dateLabel}
              active={sheet === "date"}
              onPress={() => setSheet("date")}
              renderIcon={(c) => (
                <Feather name="calendar" size={15} color={c} />
              )}
            />
          </FilterPill>

          {/* List header */}
          {!listLoading && !listError && (
            <View className="flex-row items-center gap-2 mb-4">
              <Text
                numberOfLines={1}
                className="shrink text-lg font-bold text-gray-900 dark:text-white"
              >
                {showDeleted ? "Deleted Bookings" : "All Bookings"}
              </Text>
              <View className="shrink-0 bg-gray-100 dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
                <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {filtered.length}
                </Text>
              </View>
            </View>
          )}

          {/* Deleted-list error (active-list error is shown above the KPIs) */}
          {showDeleted && !listLoading && listError && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{listError}</Text>
            </View>
          )}

          {/* List / states */}
          {listLoading ? (
            <BookingsListSkeleton />
          ) : !listError && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center shadow-sm">
              <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={showDeleted ? "archive" : "calendar"}
                  size={26}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                {showDeleted ? "No deleted bookings" : "No bookings found"}
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {showDeleted
                  ? "Deleted bookings will appear here."
                  : bookings.length === 0
                    ? "There are no bookings for this account yet."
                    : "Try adjusting your search or filters."}
              </Text>
            </View>
          ) : (
            !listError && (
              <>
                {paged.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    showLocation={isCompanyAdmin}
                    onPress={() => setSelectedBookingId(booking.id)}
                    onMore={() => setActionsBooking(booking)}
                  />
                ))}

                {/* Pagination */}
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

      {/* Location filter */}
      <BottomSheet
        visible={sheet === "location"}
        onClose={() => setSheet(null)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {["all", ...locations].map((name) => {
            const isSelected = locationFilter === name;
            return (
              <Pressable
                key={name}
                onPress={() => {
                  setLocationFilter(name);
                  setSheet(null);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
                >
                  {name === "all" ? "All Locations" : name}
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

      {/* Full booking detail (view / edit / status / payment) */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetch}
      />

      {/* Per-booking "More" actions (mirrors the web row actions) */}
      <BookingActionsSheet
        visible={actionsBooking !== null}
        booking={actionsBooking}
        deleted={showDeleted}
        onClose={() => setActionsBooking(null)}
        onViewDetails={() => {
          if (actionsBooking) setSelectedBookingId(actionsBooking.id);
        }}
        onChanged={showDeleted ? loadDeleted : refetch}
      />

      {/* Page-level "More" menu (mirrors the web header ActionMenu) */}
      <BookingsMoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        showDeleted={showDeleted}
        exporting={exporting}
        onBulkImport={() => setShowImport(true)}
        onExport={runExport}
        onGenerateReport={() => setShowReport(true)}
        onToggleDeleted={() => setShowDeleted((v) => !v)}
      />

      <BookingsReportSheet
        visible={showReport}
        onClose={() => setShowReport(false)}
        locationId={scopeLocationId}
      />

      <BookingsImportSheet
        visible={showImport}
        onClose={() => setShowImport(false)}
        locationId={scopeLocationId}
        onImported={() => {
          refetch();
          if (showDeleted) loadDeleted();
        }}
      />
    </View>
  );
};

export default Bookings;
