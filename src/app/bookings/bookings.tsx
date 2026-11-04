import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { InternalNotesLog } from "../../components/ui/InternalNotesLog";
import {
  BookingsBulkBar,
  type BookingBulkAction,
} from "../../components/ui/BookingsBulkBar";
import { BookingsImportSheet } from "../../components/ui/BookingsImportSheet";
import { BookingsReportSheet } from "../../components/ui/BookingsReportSheet";
import {
  BookingStatusBadge,
  BookingsTable,
  allBookingColumnKeys,
  bookingColumns,
  bookingStatusLabel,
  bookingStatusTone,
  defaultBookingColumnKeys,
  type BookingRowHandlers,
} from "../../components/ui/BookingsTable";
import { ChangeLocationSheet } from "../../components/ui/ChangeLocationSheet";
import { EditDurationSheet } from "../../components/ui/EditDurationSheet";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  ALL_CATEGORIES,
  buildCategoryOptions,
  CategoryChips,
} from "../../components/ui/CategoryChips";
import { ColumnsSheet } from "../../components/ui/ColumnsSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { HubShortcuts, type HubQuickLink } from "../../components/ui/ModuleHub";
import { PaginationControls } from "../../components/ui/PaginationControls";
import { ProcessPaymentSheet } from "../../components/ui/ProcessPaymentSheet";
import { ViewToggle, type ViewMode } from "../../components/ui/ViewToggle";
import { AttractionsSummarySkeleton } from "../../components/ui/skeleton/AttractionsSkeleton";
import { BookingsListSkeleton } from "../../components/ui/skeleton/BookingsSkeleton";
import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";
import { categoryKeyOf } from "../../lib/calendar/categoryFilter";
import {
  changeReasonPromptAvailable,
  requestChangeReason,
} from "../../lib/changeReasonPrompt";
import { consumeBookingsStale, useBookings } from "../../lib/hooks/useBookings";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { cardLabelFromPayments, type CardBearingPayment } from "../../lib/payments/cardLabel";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  bulkCompleteBookingsNotice,
  bulkCompleteConfirmMessage,
  describeFollowUp,
} from "../../lib/visitFollowUp/visitFollowUp";
import {
  bulkSetBookingStatus,
  checkInBooking,
  deleteBooking,
  exportBookings,
  fetchBookingDetail,
  fetchTrashedBookings,
  updateBookingStatus,
  type BookingDetail,
  type BookingStatus,
  type CalendarBooking,
  type TrashedBooking,
} from "../../services/bookingsService";

const PRIMARY = "#0644C7";

/** Horizontal page padding (`px-4`) — the More shortcuts row bleeds past it. */
const SCREEN_GUTTER = 16;

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

/** Statuses the row's status pill can switch between (web select options). */
const ROW_STATUS_OPTIONS: BookingStatus[] = [
  "pending",
  "confirmed",
  "checked-in",
  "completed",
  "cancelled",
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
  payments?: CardBearingPayment[] | null;
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
    "Card",
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
      cardLabelFromPayments(b.payments) ?? "",
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

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own shadowed tile — the same panel as Manage Attractions.
 */
const SummaryCell = ({
  icon,
  title,
  value,
  hint,
  divideLeft = false,
  divideTop = false,
}: {
  icon: FeatherIconName;
  title: string;
  value: string;
  hint: string;
  divideLeft?: boolean;
  divideTop?: boolean;
}) => (
  <View
    className={`flex-1 p-4 ${
      divideLeft ? "border-l border-gray-100 dark:border-neutral-800" : ""
    } ${divideTop ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
  >
    <View className="flex-row items-center gap-1.5">
      <Feather name={icon} size={13} color="#9CA3AF" />
      <Text
        numberOfLines={1}
        className="shrink text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        {title}
      </Text>
    </View>
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      className="text-2xl font-semibold text-gray-900 dark:text-white mt-1.5"
    >
      {value}
    </Text>
    <Text
      numberOfLines={1}
      className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
    >
      {hint}
    </Text>
  </View>
);

/** Square icon button used in the list header (Columns). */
const ToolbarIconButton = ({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`w-9 h-9 rounded-xl items-center justify-center active:opacity-70 ${
      active
        ? "bg-blue-50 dark:bg-blue-900/30"
        : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Feather name={icon} size={16} color={active ? PRIMARY : "#6B7280"} />
  </Pressable>
);

/** One labelled cell in the card's Date / Guests / Total strip. */
const Spec = ({
  label,
  value,
  hint,
  divider = false,
}: {
  label: string;
  value: string;
  hint?: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    <Text
      numberOfLines={1}
      className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5"
    >
      {value}
    </Text>
    {!!hint && (
      <Text
        numberOfLines={1}
        className="text-[11px] text-gray-400 dark:text-gray-500"
      >
        {hint}
      </Text>
    )}
  </View>
);

/**
 * Card layout for a single booking, matching the Manage Attractions card:
 * customer + status, a reference · package line, a Date / Guests / Total
 * strip and a quiet footer. Tapping the card opens the full details; the
 * three-dot opens the per-booking actions sheet (restore for deleted rows).
 */
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
  const subtitle = [
    booking.referenceNumber ? `#${booking.referenceNumber}` : "",
    booking.packageName,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3 active:bg-gray-50 dark:active:bg-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`View booking for ${booking.customerName}`}
    >
      {/* Customer + status */}
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="flex-1 text-base font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {booking.customerName}
        </Text>
        <BookingStatusBadge status={booking.status} />
      </View>

      {/* Reference · package */}
      {!!subtitle && (
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-1"
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      )}

      {/* Date / Guests / Total */}
      <View className="flex-row mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800">
        <Spec
          label="Date"
          value={formatDate(booking.date)}
          hint={formatTime(booking.time) || undefined}
        />
        <Spec divider label="Guests" value={String(booking.participants)} />
        <Spec divider label="Total" value={formatMoney(booking.totalAmount)} />
      </View>

      {/* Location + actions */}
      <View className="flex-row items-center justify-between gap-3 mt-3">
        <View className="shrink flex-row items-center gap-1.5">
          {showLocation && !!booking.locationName && (
            <>
              <Feather name="map-pin" size={12} color="#9CA3AF" />
              <Text
                numberOfLines={1}
                className="shrink text-xs text-gray-400 dark:text-gray-500"
              >
                {booking.locationName}
              </Text>
            </>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-0.5">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Details
            </Text>
            <Feather name="chevron-right" size={14} color="#9CA3AF" />
          </View>
          <Pressable
            onPress={onMore}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${booking.customerName}`}
            className="w-8 h-8 rounded-lg items-center justify-center border border-gray-200 dark:border-neutral-700 active:bg-gray-100 dark:active:bg-neutral-800"
          >
            <Feather name="more-horizontal" size={16} color="#6B7280" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

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

  // Scope to the global workspace location (company_admin); "all"/managers stay
  // company-wide / backend-scoped. Reactive so switching location refetches.
  const activeLocation = useActiveLocation();
  const activeLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;

  const { bookings, loading, error, refetch } = useBookings({
    locationId: activeLocationId,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  // One Filters sheet (Status + Date) beside the search, like Manage
  // Attractions. Picks apply immediately, as the two separate sheets did.
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  // Presentation layout for the active list — table by default (card view via
  // toggle). Both render the same `paged` slice, so switching never refetches.
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // Bulk-selection (active list, table view). Single source of truth for which
  // rows are selected; `bulkBusy` marks the in-flight bulk action.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<BookingBulkAction | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  // Which content the detail sheet opens on: a card tap goes straight to the
  // full "details"; the three-dot's "View Details" opens the "hub" (summary +
  // Edit / Payment). Mirrors the Packages / Attractions card-tap pattern.
  const [detailMode, setDetailMode] = useState<"hub" | "details">("details");

  // Table column visibility (table layout only), starting at the web defaults.
  const [showColumnsSheet, setShowColumnsSheet] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() =>
    defaultBookingColumnKeys(true),
  );

  // Row whose "Set Status" picker is open, and the Internal Notes editor.
  const [statusBooking, setStatusBooking] = useState<CalendarBooking | null>(
    null,
  );
  const [statusSaving, setStatusSaving] = useState(false);
  // Rows whose inline Location / Duration editors are open (the web opens the
  // same two modals from those cells).
  const [locationBooking, setLocationBooking] =
    useState<CalendarBooking | null>(null);
  // Venues for the Change Location picker. Fetched the first time that sheet
  // opens rather than on mount — every other row action works without it, and
  // this screen already pays for a full bookings walk on load.
  const [venues, setVenues] = useState<LocationOption[]>([]);
  const venuesLoadedRef = useRef(false);
  useEffect(() => {
    if (!locationBooking || venuesLoadedRef.current) return;
    const token = getToken();
    if (!token) return;
    venuesLoadedRef.current = true;
    fetchLocations(token)
      .then(setVenues)
      .catch(() => {
        // Let the next open retry rather than stranding the picker empty.
        venuesLoadedRef.current = false;
      });
  }, [locationBooking]);
  const [durationBooking, setDurationBooking] =
    useState<CalendarBooking | null>(null);
  const [notesBooking, setNotesBooking] = useState<CalendarBooking | null>(null);

  // Process Payment — the row's `$` action. `payDetail` carries the location /
  // customer ids the payments endpoint needs, which the list row doesn't have.
  const [payBooking, setPayBooking] = useState<CalendarBooking | null>(null);
  const [payDetail, setPayDetail] = useState<BookingDetail | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  // Amounts shown in the Process Payment summary — prefer the freshly fetched
  // detail, falling back to the list row while it loads.
  const payTotal = payDetail?.totalAmount ?? payBooking?.totalAmount ?? 0;
  const payPaid = payDetail?.amountPaid ?? payBooking?.amountPaid ?? 0;

  // Auto-open a booking's detail sheet when navigated here from a
  // notification (e.g. /bookings/bookings?openId=123).
  const { openId } = useLocalSearchParams<{ openId?: string }>();
  useEffect(() => {
    if (!openId) return;
    const id = Number(openId);
    if (!Number.isNaN(id)) {
      setDetailMode("details");
      setSelectedBookingId(id);
    }
    router.setParams({ openId: undefined });
  }, [openId]);
  // The booking whose "More" actions sheet is open (null = closed).
  const [actionsBooking, setActionsBooking] = useState<CalendarBooking | null>(
    null,
  );

  // The web header ActionMenu's flows, reached from the "More" shortcuts.
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

  const locationScoped = bookings;

  const kpis = useMemo(() => {
    const active = locationScoped.filter((b) => b.status !== "cancelled");
    return {
      total: locationScoped.length,
      confirmed: locationScoped.filter((b) => b.status === "confirmed").length,
      cancelled: locationScoped.length - active.length,
      participants: locationScoped.reduce((s, b) => s + b.participants, 0),
      revenue: active.reduce((s, b) => s + b.amountPaid, 0),
      possibleRevenue: active.reduce((s, b) => s + b.totalAmount, 0),
    };
  }, [locationScoped]);

  const deletedScoped = useMemo(
    () =>
      activeLocation.id === "all"
        ? deletedItems
        : deletedItems.filter((b) => b.locationName === activeLocation.name),
    [deletedItems, activeLocation],
  );
  const listBase = showDeleted ? deletedScoped : locationScoped;
  const listLoading = showDeleted ? deletedLoading : loading;
  const listError = showDeleted ? deletedError : error;

  // Chip counts come from the same location-scoped set the list draws from, so
  // a category never leaks in from a location the workspace is not showing.
  const categoryOptions = useMemo(
    () => buildCategoryOptions(listBase.map((b) => b.packageCategory)),
    [listBase],
  );

  // Drop a selection the visible set no longer holds (switching location or the
  // deleted view), so the list can never be filtered down to nothing by a key
  // that has no chip to clear it — the same rule the calendar tabs follow.
  useEffect(() => {
    if (
      categoryFilter !== ALL_CATEGORIES &&
      !categoryOptions.some((o) => o.value === categoryFilter)
    ) {
      setCategoryFilter(ALL_CATEGORIES);
    }
  }, [categoryOptions, categoryFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = todayKey();
    const result = listBase.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (
        categoryFilter !== ALL_CATEGORIES &&
        categoryKeyOf(b.packageCategory) !== categoryFilter
      )
        return false;
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
    return showDeleted ? result : result.sort(compareBookingsDefault);
  }, [listBase, search, statusFilter, dateFilter, categoryFilter, showDeleted]);

  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => {
    setPage(1);
  }, [
    search,
    statusFilter,
    dateFilter,
    categoryFilter,
    activeLocationId,
    perPage,
    showDeleted,
  ]);

  // Keep the current page valid after the list shrinks (e.g. a bulk delete).
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);

  // Selection is scoped to the visible active-list page: clear it whenever the
  // visible set changes or we leave the table, so a bulk action never touches
  // off-screen (or deleted) rows.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    search,
    statusFilter,
    dateFilter,
    categoryFilter,
    activeLocationId,
    perPage,
    page,
    viewMode,
    showDeleted,
  ]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Header checkbox — select / deselect every booking on the current page.
  const toggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const all = paged.length > 0 && paged.every((b) => prev.has(b.id));
      return all ? new Set() : new Set(paged.map((b) => b.id));
    });
  }, [paged]);

  // Bulk status change — mirrors the web bulk bar (per-id; a "checked-in"
  // change routes through the check-in endpoint). Refetches + clears selection;
  // filters, search and the current page are preserved.
  const runBulkStatus = useCallback(
    async (
      status: Exclude<BookingBulkAction, "delete">,
      confirmed = false,
    ): Promise<void> => {
      const token = getToken();
      if (!token || selectedIds.size === 0) return;
      const chosen = paged.filter((b) => selectedIds.has(b.id));
      if (status === "completed" && !confirmed) {
        // Completing emails guests, so ask first (web parity) and re-enter on OK.
        Alert.alert(
          "Complete",
          bulkCompleteConfirmMessage(chosen.length, "booking"),
          [
            { text: "Cancel", style: "cancel" },
            { text: "OK", onPress: () => void runBulkStatus(status, true) },
          ],
        );
        return;
      }
      setBulkBusy(status);
      try {
        const followUps = await bulkSetBookingStatus(
          token,
          chosen.map((b) => ({
            id: b.id,
            referenceNumber: b.referenceNumber,
          })),
          status,
          currentUser?.id,
        );
        setSelectedIds(new Set());
        await refetch();
        const notice =
          status === "completed"
            ? bulkCompleteBookingsNotice(followUps, chosen.length)
            : null;
        if (notice) Alert.alert(notice);
      } catch (e) {
        Alert.alert(
          "Update failed",
          e instanceof Error
            ? e.message
            : "Could not update the selected bookings.",
        );
      } finally {
        setBulkBusy(null);
      }
    },
    [selectedIds, paged, currentUser?.id, refetch],
  );

  // Bulk delete — same confirmation as the web, then the reason asked once and
  // each booking soft-deleted to trash with it, so every booking's history
  // records why (web Bookings `handleBulkDelete`). The bulk-delete endpoint
  // would log the reason only once, against the batch.
  const confirmBulkDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      "Delete bookings",
      `Are you sure you want to delete ${count} booking(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) return;
            const ids = [...selectedIds];
            // Without a mounted prompt the server's own 422 explains what is missing.
            let changeReason: string | undefined;
            if (changeReasonPromptAvailable()) {
              const reason = await requestChangeReason({
                summary: `Deleting ${ids.length} booking(s)`,
                destructive: true,
              });
              if (!reason) return;
              changeReason = reason;
            }
            setBulkBusy("delete");
            try {
              const results = await Promise.allSettled(
                ids.map((id) => deleteBooking(token, id, { changeReason })),
              );
              const failures = results.filter(
                (r): r is PromiseRejectedResult => r.status === "rejected",
              );
              setSelectedIds(new Set());
              await refetch();
              if (failures.length > 0) {
                const first = failures[0].reason;
                Alert.alert(
                  "Delete failed",
                  `${failures.length} of ${ids.length} booking(s) could not be deleted.${
                    first instanceof Error && first.message ? `\n${first.message}` : ""
                  }`,
                );
              }
            } catch (e) {
              Alert.alert(
                "Delete failed",
                e instanceof Error
                  ? e.message
                  : "Could not delete the selected bookings.",
              );
            } finally {
              setBulkBusy(null);
            }
          },
        },
      ],
    );
  }, [selectedIds, refetch]);

  // Status + Date live in the Filters sheet; category has its own visible chips.
  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (dateFilter !== "all" ? 1 : 0);
  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setDateFilter("all");
  }, []);
  const hasResults = filtered.length > 0;

  /**
   * Inline table row actions, mirroring the web's per-row buttons. `$` and the
   * eye both open the detail sheet — the hub exposes Record Payment, "details"
   * jumps straight to the full record. Edit routes to the edit screen; Delete
   * confirms then soft-deletes to trash, like the actions sheet.
   */
  const rowHandlers: BookingRowHandlers = useMemo(
    () => ({
      onPayment: (booking) => {
        setPayBooking(booking);
        setPayDetail(null);
        // The sheet seeds from the row's amounts, then re-seeds once the detail
        // lands (it carries the authoritative amounts + the location/customer ids).
        const token = getToken();
        if (!token) return;
        setPayLoading(true);
        fetchBookingDetail(token, booking.id)
          .then(setPayDetail)
          .catch(() => {})
          .finally(() => setPayLoading(false));
      },
      // The log fetches itself, and reads nothing from the cache — so there is
      // nothing to prime here.
      onNotes: (booking) => setNotesBooking(booking),
      onStatusPress: (booking) => setStatusBooking(booking),
      onLocationPress: (booking) => setLocationBooking(booking),
      onDurationPress: (booking) => setDurationBooking(booking),
      onCheckIn: (booking) => {
        if (!booking.referenceNumber) {
          Alert.alert(
            "Can't check in",
            "This booking has no reference number to check in against.",
          );
          return;
        }
        Alert.alert(
          "Check in this booking?",
          "This marks the party as arrived.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Confirm",
              onPress: async () => {
                const token = getToken();
                if (!token) return;
                try {
                  await checkInBooking(
                    token,
                    booking.referenceNumber!,
                    currentUser?.id,
                  );
                  refetch();
                } catch (err) {
                  Alert.alert(
                    "Check-in failed",
                    err instanceof Error
                      ? err.message
                      : "Could not check in this booking.",
                  );
                }
              },
            },
          ],
        );
      },
      onView: (booking) => {
        setDetailMode("details");
        setSelectedBookingId(booking.id);
      },
      onEdit: (booking) => {
        router.push(`/bookings/edit-booking?id=${booking.id}` as never);
      },
      onDelete: (booking) => {
        Alert.alert(
          "Delete booking",
          `Delete booking #${booking.id} for ${booking.customerName}? It moves to trash and can be restored.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                const token = getToken();
                if (!token) return;
                try {
                  await deleteBooking(token, booking.id);
                  refetch();
                } catch (err) {
                  Alert.alert(
                    "Delete failed",
                    err instanceof Error
                      ? err.message
                      : "Could not delete the booking.",
                  );
                }
              },
            },
          ],
        );
      },
    }),
    [refetch, currentUser?.id],
  );

  // The web header ActionMenu, laid out as module-hub shortcuts like the
  // Manage Attractions "More" row. Create Booking (the step-by-step wizard)
  // leads, since the header's New opens Manual Booking.
  const moreShortcuts: HubQuickLink[] = [
    {
      label: "Create Booking",
      icon: "plus-circle",
      route: "/bookings/create-booking",
    },
    { label: "Bulk Import", icon: "upload", onPress: () => setShowImport(true) },
    {
      label: exporting ? "Exporting…" : "Export Bookings",
      icon: "download",
      onPress: () => {
        if (!exporting) void runExport();
      },
    },
    {
      label: "Generate Report",
      icon: "file-text",
      onPress: () => setShowReport(true),
    },
    {
      label: showDeleted ? "Active Bookings" : "Deleted Bookings",
      icon: showDeleted ? "rotate-ccw" : "archive",
      onPress: () => setShowDeleted((v) => !v),
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header — back, title, and the primary New action (Manual Booking,
          the web's lead CTA; the step-by-step wizard is in More). */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-3 px-4 w-full z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-9 h-9 items-center justify-center bg-gray-100 dark:bg-neutral-800 rounded-full active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text
            numberOfLines={1}
            className="flex-1 text-gray-900 dark:text-white text-lg font-semibold"
          >
            Manage Bookings
          </Text>
          <Pressable
            onPress={() => router.push("/bookings/manual-booking")}
            className="flex-row items-center gap-1 h-9 pl-2.5 pr-3.5 rounded-full bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel="New manual booking"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">New</Text>
          </Pressable>
        </View>
      </View>

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
          {/* Global workspace location selector (company-admin only). */}
          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Error state — the active list's, or the deleted list's while
              that view is on. */}
          {!listLoading && listError && (
            <View className="flex-row gap-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-2xl p-4 mb-4">
              <Feather name="alert-circle" size={18} color="#DC2626" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {showDeleted
                    ? "Could not load deleted bookings"
                    : "Could not load bookings"}
                </Text>
                <Text className="text-sm text-red-600/90 dark:text-red-400/80 mt-0.5">
                  {listError}
                </Text>
                <Pressable
                  onPress={onRefresh}
                  className="self-start mt-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                    Try again
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Summary — one panel, five figures, divided by hairlines. */}
          {loading ? (
            <AttractionsSummarySkeleton />
          ) : (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <View className="flex-row">
                <SummaryCell
                  icon="calendar"
                  title="Total Bookings"
                  value={String(kpis.total)}
                  hint={`${kpis.total} total bookings`}
                />
                <SummaryCell
                  divideLeft
                  icon="package"
                  title="Package Bookings"
                  value={String(kpis.total)}
                  hint={`${kpis.confirmed} confirmed`}
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="users"
                  title="Participants"
                  value={String(kpis.participants)}
                  hint={`${kpis.total} bookings`}
                />
                <SummaryCell
                  divideTop
                  divideLeft
                  icon="dollar-sign"
                  title="Revenue"
                  value={formatMoney(kpis.revenue)}
                  hint={`Excludes ${kpis.cancelled} cancelled`}
                />
              </View>
              <View className="flex-row">
                <SummaryCell
                  divideTop
                  icon="trending-up"
                  title="Possible Revenue"
                  value={formatMoney(kpis.possibleRevenue)}
                  hint="Total if all bookings fully paid"
                />
              </View>
            </View>
          )}

          {/* More — the page's secondary actions as module-hub shortcuts. */}
          <View className="mt-5">
            <HubShortcuts
              title="More"
              links={moreShortcuts}
              gutter={SCREEN_GUTTER}
            />
          </View>

          {/* Search + Filters */}
          <View className="flex-row items-center gap-2 mt-4 mb-3">
            <View className="flex-1 flex-row items-center gap-2 h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search bookings"
                placeholderTextColor="#9CA3AF"
                returnKeyType="search"
                className="flex-1 text-sm text-gray-900 dark:text-white"
              />
              {search.length > 0 && (
                <Pressable
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Feather name="x-circle" size={16} color="#9CA3AF" />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => setShowFilters(true)}
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0
                  ? `Filters, ${activeFilterCount} applied`
                  : "Filters"
              }
              className={`flex-row items-center gap-1.5 h-11 px-3.5 rounded-xl border active:opacity-70 ${
                activeFilterCount > 0
                  ? "bg-blue-50 dark:bg-blue-900/30 border-[#0644C7]/40"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
              }`}
            >
              <Feather
                name="sliders"
                size={15}
                color={activeFilterCount > 0 ? PRIMARY : "#6B7280"}
              />
              <Text
                className={`text-sm font-medium ${
                  activeFilterCount > 0
                    ? "text-[#0644C7] dark:text-blue-300"
                    : "text-gray-700 dark:text-gray-200"
                }`}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Applied-filters hint with a one-tap reset. */}
          {activeFilterCount > 0 && (
            <View className="flex-row items-center justify-between mb-3 -mt-1">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {activeFilterCount}{" "}
                {activeFilterCount === 1 ? "filter" : "filters"} applied
              </Text>
              <Pressable
                onPress={clearFilters}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Clear all
                </Text>
              </Pressable>
            </View>
          )}

          {/* Deleted-view hint — the More shortcut switched the list to the
              trashed bookings; this is the one-tap way back. */}
          {showDeleted && (
            <View className="flex-row items-center gap-2 mb-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
              <Feather name="archive" size={14} color="#6B7280" />
              <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
                Showing deleted bookings
              </Text>
              <Pressable
                onPress={() => setShowDeleted(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to active bookings"
              >
                <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                  Back to active
                </Text>
              </Pressable>
            </View>
          )}

          {/* Category chips — reads the package's display label, so escape
              rooms group under one chip instead of splitting by difficulty. */}
          <CategoryChips
            options={categoryOptions}
            value={categoryFilter}
            onChange={setCategoryFilter}
            totalCount={listBase.length}
            allLabel="All Categories"
          />

          {/* List header — title + count, Columns (table only), layout toggle
              (active list only; the deleted list keeps cards). */}
          {!listLoading && !listError && (
            <View className="flex-row items-center justify-between gap-2 mb-3">
              <View className="flex-row items-baseline gap-2 shrink">
                <Text
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-gray-900 dark:text-white"
                >
                  {showDeleted ? "Deleted Bookings" : "All Bookings"}
                </Text>
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {filtered.length}
                </Text>
              </View>
              {!showDeleted && (
                <View className="flex-row items-center gap-2">
                  {viewMode === "table" && (
                    <ToolbarIconButton
                      icon="columns"
                      label="Toggle columns"
                      active={showColumnsSheet}
                      onPress={() => setShowColumnsSheet(true)}
                    />
                  )}
                  <ViewToggle mode={viewMode} onChange={setViewMode} />
                </View>
              )}
            </View>
          )}

          {/* Bulk-action toolbar — table view of the active list, shown while a
              selection exists; disappears when selection is cleared. */}
          {!showDeleted && viewMode === "table" && selectedIds.size > 0 && (
            <BookingsBulkBar
              flat
              count={selectedIds.size}
              busy={bulkBusy}
              onStatus={runBulkStatus}
              onDelete={confirmBulkDelete}
              onClear={clearSelection}
            />
          )}

          {/* List / states */}
          {listLoading ? (
            <BookingsListSkeleton view={showDeleted ? "cards" : viewMode} />
          ) : !listError && !hasResults ? (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 px-6 py-10 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                <Feather
                  name={
                    showDeleted
                      ? "archive"
                      : bookings.length === 0
                        ? "calendar"
                        : "search"
                  }
                  size={20}
                  color="#9CA3AF"
                />
              </View>
              <Text className="text-base font-semibold text-gray-900 dark:text-white">
                {showDeleted ? "No deleted bookings" : "No bookings found"}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1 max-w-xs">
                {showDeleted
                  ? "Deleted bookings will appear here."
                  : bookings.length === 0
                    ? "There are no bookings for this account yet."
                    : "Try adjusting your search or filters."}
              </Text>
              {!showDeleted &&
                (bookings.length === 0 ? (
                  <Pressable
                    onPress={() => router.push("/bookings/manual-booking")}
                    className="flex-row items-center gap-1.5 mt-4 px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={15} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Manual Booking
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      setSearch("");
                      clearFilters();
                      setCategoryFilter(ALL_CATEGORIES);
                    }}
                    className="mt-4 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
                    accessibilityRole="button"
                  >
                    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Clear search & filters
                    </Text>
                  </Pressable>
                ))}
            </View>
          ) : (
            !listError && (
              <>
                {/* Table (default) and card layouts render from the same
                    `paged` slice — switching is instant and never refetches.
                    The deleted list keeps cards (its own restore actions).
                    Table rows are inert: Details / Edit are reached from the
                    Actions cell, so a stray tap can't open a booking. */}
                {!showDeleted && viewMode === "table" ? (
                  <BookingsTable
                    bookings={paged}
                    showLocation={isCompanyAdmin}
                    selectedIds={selectedIds}
                    onToggleRow={toggleRow}
                    onToggleAll={toggleAllVisible}
                    handlers={rowHandlers}
                    visibleColumns={visibleColumns}
                  />
                ) : (
                  paged.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      showLocation={isCompanyAdmin}
                      onPress={() => {
                        setDetailMode("details");
                        setSelectedBookingId(booking.id);
                      }}
                      onMore={() => setActionsBooking(booking)}
                    />
                  ))
                )}

                {/* Pagination — shared control (same as Attractions/Purchases). */}
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

      {/* Filters — Status and Date in one sheet. A pick applies at once (as
          the two separate sheets did); Done closes, Clear resets both. */}
      <BottomSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
      >
        <ScrollView className="px-4" showsVerticalScrollIndicator={false}>
          <Text className="px-1 mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Status
          </Text>
          {STATUS_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setStatusFilter(option.value)}
                className={`flex-row items-center justify-between px-4 py-3 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <View className="flex-row items-center gap-2.5">
                  {option.value !== "all" && (
                    <View
                      className={`w-2 h-2 rounded-full ${
                        bookingStatusTone(option.value).dot
                      }`}
                    />
                  )}
                  <Text
                    className={`text-base font-medium ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {option.label}
                  </Text>
                </View>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <Feather name="check" size={14} color="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}

          <Text className="px-1 mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Date
          </Text>
          {DATE_OPTIONS.map((option) => {
            const isSelected = dateFilter === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setDateFilter(option.value)}
                className={`flex-row items-center justify-between px-4 py-3 rounded-xl mb-1 ${
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

          <View className="flex-row gap-3 mt-4 mb-6">
            <Pressable
              onPress={clearFilters}
              className="flex-1 items-center py-3 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Clear
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowFilters(false)}
              className="flex-1 items-center py-3 rounded-xl bg-[#0644C7] active:opacity-90"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Toggle Columns — mirrors the web table toolbar's Columns dropdown. */}
      <ColumnsSheet
        visible={showColumnsSheet}
        columns={bookingColumns(isCompanyAdmin)}
        visibleKeys={visibleColumns}
        onToggle={(key) =>
          setVisibleColumns((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onShowAll={() => setVisibleColumns(allBookingColumnKeys(true))}
        onReset={() => setVisibleColumns(defaultBookingColumnKeys(true))}
        onClose={() => setShowColumnsSheet(false)}
      />

      {/* Set Status — the mobile stand-in for the table cell's inline select. */}
      <BottomSheet
        visible={statusBooking !== null}
        onClose={() => !statusSaving && setStatusBooking(null)}
        title="Set Status"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {ROW_STATUS_OPTIONS.map((option) => {
            const isCurrent = statusBooking?.status === option;
            return (
              <Pressable
                key={option}
                disabled={statusSaving}
                onPress={async () => {
                  if (!statusBooking || isCurrent) {
                    setStatusBooking(null);
                    return;
                  }
                  const token = getToken();
                  if (!token) return;
                  setStatusSaving(true);
                  try {
                    const followUp = await updateBookingStatus(
                      token,
                      statusBooking.id,
                      option,
                    );
                    setStatusBooking(null);
                    refetch();
                    const notice =
                      option === "completed" ? describeFollowUp(followUp) : null;
                    if (notice) Alert.alert(notice);
                  } catch (err) {
                    Alert.alert(
                      "Couldn't update status",
                      err instanceof Error ? err.message : "Please try again.",
                    );
                  } finally {
                    setStatusSaving(false);
                  }
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-lg mb-1 ${
                  isCurrent ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <View className="flex-row items-center gap-2.5">
                  <View
                    className={`w-2 h-2 rounded-full ${
                      bookingStatusTone(option).dot
                    }`}
                  />
                  <Text
                    className={`text-base font-medium ${
                      isCurrent
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {bookingStatusLabel(option)}
                  </Text>
                </View>
                {isCurrent && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      {/* Process Payment — the row's `$` action. */}
      <ProcessPaymentSheet
        visible={payBooking !== null}
        bookingId={payBooking?.id ?? null}
        referenceNumber={payBooking?.referenceNumber ?? null}
        totalAmount={payTotal}
        amountPaid={payPaid}
        locationId={payDetail?.locationId ?? null}
        customerId={payDetail?.customerId ?? null}
        status={payDetail?.status ?? payBooking?.status ?? null}
        loading={payLoading}
        onClose={() => setPayBooking(null)}
        onProcessed={refetch}
      />

      {/* Change Location / Edit Duration — opened from those table cells. */}
      <ChangeLocationSheet
        visible={locationBooking !== null}
        booking={locationBooking}
        locations={venues}
        onClose={() => setLocationBooking(null)}
        onSaved={refetch}
      />
      <EditDurationSheet
        visible={durationBooking !== null}
        booking={durationBooking}
        onClose={() => setDurationBooking(null)}
        onSaved={refetch}
      />

      {/* Internal Notes — the booking's staff-only log. */}
      <BottomSheet
        visible={notesBooking !== null}
        onClose={() => setNotesBooking(null)}
        title="Internal Notes"
      >
        <View className="px-5 pb-6">
          <View className="flex-row items-start justify-between gap-2 rounded-lg bg-amber-50 p-3 mb-4 dark:bg-amber-900/20">
            <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
              Booking: {notesBooking?.referenceNumber ?? `#${notesBooking?.id}`}
              {notesBooking?.customerName ? ` — ${notesBooking.customerName}` : ""}
            </Text>
            <View className="rounded bg-amber-200 px-2 py-0.5 dark:bg-amber-900/50">
              <Text className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                Staff Only
              </Text>
            </View>
          </View>

          {notesBooking && <InternalNotesLog bookingId={notesBooking.id} />}
        </View>
      </BottomSheet>

      {/* Full booking detail (view / edit / status / payment) */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        initialMode={detailMode}
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
          if (actionsBooking) {
            // The three-dot's View Details opens the hub (summary + Edit /
            // Payment), unlike a card tap which jumps to the full details.
            setDetailMode("hub");
            setSelectedBookingId(actionsBooking.id);
          }
        }}
        onChanged={showDeleted ? loadDeleted : refetch}
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
