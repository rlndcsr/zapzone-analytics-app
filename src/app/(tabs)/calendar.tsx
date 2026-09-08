import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { CalendarCategoryTabs } from "../../components/ui/CalendarCategoryTabs";
import { DashboardHeader } from "../../components/ui/DashboardHeader";
import { ScreenTitleCard } from "../../components/ui/ScreenTitleCard";
import {
  CalendarDaySkeleton,
  CalendarSkeleton,
  CalendarWeekSkeleton,
} from "../../components/ui/skeleton/CalendarSkeleton";
import {
  buildCalendarCategories,
  categoryKeyOf,
  useCategoryFilter,
} from "../../lib/calendar/categoryFilter";
import {
  buildColumns,
  timeToMinutes,
} from "../../lib/bookings/spaceScheduleGrid";
import {
  computeSlotWindow,
  distinctStartMinutes,
  placeByColumn,
  SLOT_MINUTES,
  type SlotPlacement,
} from "../../lib/calendar/dayGrid";
import { packageColor } from "../../lib/calendar/packageColors";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { useAttractionPurchases } from "../../lib/hooks/useAttractionPurchases";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { useNotifications } from "../../lib/hooks/useNotifications";
import { useSpaces } from "../../lib/hooks/useSpaceSchedule";
import type { CalendarBooking } from "../../services/bookingsService";
import type { PurchaseRow } from "../../services/attractionPurchasesService";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Users,
  MapPin,
  Clock,
  CheckCircle,
  Clock as ClockIcon,
  XCircle,
  CalendarDays,
  CalendarRange,
  Calendar as CalendarDay,
  CircleDot,
  BadgeCheck,
  Package,
  Ticket,
} from "lucide-react-native";

type ViewMode = "month" | "week" | "day";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WEEKDAY_ABBR = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Geometry of the day / week grids. Both put a fixed time gutter on the left
// and scroll their columns sideways, so the widths below are what one column
// costs the reader in horizontal scrolling.
const TIME_COL_WIDTH = 72;
const DAY_COL_WIDTH = 148;
const WEEK_COL_WIDTH = 200;
const GRID_HEADER_HEIGHT = 48;
/** One 15-minute row of the day grid. */
const SLOT_HEIGHT = 44;
/** A week card is a fixed height so every column's rows stay aligned. */
const WEEK_CARD_HEIGHT = 104;
const WEEK_ROW_MIN_HEIGHT = 64;

// Accent colors for the two per-day activity types (match the web calendar).
const BOOKING_TINT = "#2563EB";
const ATTRACTION_TINT = "#9333EA";

const STATUS_STYLE: Record<
  string,
  { label: string; text: string; color: string; icon: any }
> = {
  confirmed: {
    label: "Confirmed",
    text: "text-green-700 dark:text-green-400",
    color: "#22C55E",
    icon: CheckCircle,
  },
  pending: {
    label: "Pending",
    text: "text-amber-700 dark:text-amber-400",
    color: "#F59E0B",
    icon: ClockIcon,
  },
  cancelled: {
    label: "Cancelled",
    text: "text-red-700 dark:text-red-400",
    color: "#EF4444",
    icon: XCircle,
  },
  "checked-in": {
    label: "Checked In",
    text: "text-indigo-700 dark:text-indigo-400",
    color: "#6366F1",
    icon: CircleDot,
  },
  completed: {
    label: "Completed",
    text: "text-[#0644C7]",
    color: "#0644C7",
    icon: BadgeCheck,
  },
  refunded: {
    label: "Refunded",
    text: "text-purple-700 dark:text-purple-400",
    color: "#9333EA",
    icon: XCircle,
  },
  voided: {
    label: "Voided",
    text: "text-red-700 dark:text-red-400",
    color: "#EF4444",
    icon: XCircle,
  },
};

const statusStyle = (status: string) =>
  STATUS_STYLE[status] ?? STATUS_STYLE.pending;

// Soft border + background tint for a booking card, keyed by status (mirrors the
// colored day-detail cards on the web calendar).
const BOOKING_TONE: Record<string, string> = {
  confirmed: "bg-green-50/70 dark:bg-green-900/10 border-green-200 dark:border-green-900/40",
  pending: "bg-amber-50/70 dark:bg-amber-900/10 border-amber-300 dark:border-amber-900/40",
  "checked-in": "bg-indigo-50/70 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-900/40",
  completed: "bg-blue-50/70 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/40",
  cancelled: "bg-red-50/70 dark:bg-red-900/10 border-red-200 dark:border-red-900/40",
};
const bookingTone = (status: string) => BOOKING_TONE[status] ?? BOOKING_TONE.pending;

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "checked-in": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400",
  refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  voided: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const prettyStatus = (status: string) =>
  status === "checked-in"
    ? "checked-in"
    : status.charAt(0).toUpperCase() + status.slice(1);

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Monday that starts the week containing `d` (week view runs Mon→Sun). */
const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** A minute-of-day as a wall-clock label, e.g. 1110 → "6:30 PM". */
const slotLabel = (mins: number): string => {
  const h24 = Math.floor(mins / 60) % 24;
  const m = ((mins % 60) + 60) % 60;
  const meridian = h24 >= 12 ? "PM" : "AM";
  return `${h24 % 12 || 12}:${pad2(m)} ${meridian}`;
};

function formatTime(time: string | null): string {
  if (!time) return "Any time";
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  if (Number.isNaN(hour)) return "Any time";
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

/** The scheduled calendar day for a purchase (scheduled date, else created). */
const purchaseDateKey = (p: PurchaseRow): string =>
  (p.scheduledDate ?? p.createdAt ?? "").substring(0, 10);

/** One thing shown in a week cell — a booking or an attraction purchase. */
type WeekEntry = { key: string; time: string | null; dateKey: string } & (
  | { kind: "booking"; booking: CalendarBooking }
  | { kind: "attraction"; purchase: PurchaseRow }
);

/** One row of the week grid: a start time, and what starts then, per day. */
type WeekRow = {
  minutes: number;
  height: number;
  byDay: Record<string, WeekEntry[]>;
};

type DayGroup = {
  bookings: CalendarBooking[];
  attractions: PurchaseRow[];
  /** Total attraction tickets (sum of quantities) scheduled that day. */
  attractionTickets: number;
};

/* --------------------------------------------------------------- pills --- */

/** Compact per-day count pill (icon + count) used inside month/week cells. */
const CountPill = ({
  icon: Icon,
  count,
  tint,
  bg,
}: {
  icon: any;
  count: number;
  tint: string;
  bg: string;
}) => (
  <View className={`flex-row items-center gap-1 rounded-md px-1 py-0.5 mb-0.5 ${bg}`}>
    <Icon size={9} color={tint} />
    <Text className="text-[10px] font-bold" style={{ color: tint }} numberOfLines={1}>
      {count}
    </Text>
  </View>
);

/* ------------------------------------------------------------- cards --- */

/** Colored, status-tinted booking card shown in the day detail. */
const DayBookingCard = ({
  booking,
  onPress,
}: {
  booking: CalendarBooking;
  onPress: () => void;
}) => {
  const style = statusStyle(booking.status);
  const StatusIcon = style.icon;
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl p-4 mb-3 border ${bookingTone(booking.status)} active:opacity-80`}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} color="#6b7280" />
          <Text className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {formatTime(booking.time)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <StatusIcon size={13} color={style.color} />
          <Text className="text-xs font-semibold" style={{ color: style.color }}>
            {style.label}
          </Text>
        </View>
      </View>

      <View className="flex-row items-start justify-between">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2"
          numberOfLines={2}
        >
          {booking.packageName}
        </Text>
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {formatMoney(booking.totalAmount)}
        </Text>
      </View>

      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5" numberOfLines={1}>
        {booking.customerName}
      </Text>

      <View className="flex-row items-center gap-4 mt-2">
        {!!booking.locationName && (
          <View className="flex-row items-center gap-1 flex-1">
            <MapPin size={13} color="#9ca3af" />
            <Text
              className="text-xs text-gray-500 dark:text-gray-400 flex-1"
              numberOfLines={1}
            >
              {booking.locationName}
            </Text>
          </View>
        )}
        <View className="flex-row items-center gap-1">
          <Users size={13} color="#9ca3af" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {booking.participants} participants
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

/** Attraction-purchase card shown in the day detail. */
const AttractionCard = ({
  purchase,
  onPress,
}: {
  purchase: PurchaseRow;
  onPress: () => void;
}) => {
  const badge = STATUS_BADGE[purchase.status] ?? STATUS_BADGE.pending;
  const [bg1, bg2, fg1, fg2] = badge.split(" ");
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 mb-3 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 active:opacity-80"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-start gap-2 flex-1 mr-2">
          <Ticket size={16} color={ATTRACTION_TINT} />
          <View className="flex-1">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {purchase.attractionName}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
              {purchase.customerName}
            </Text>
          </View>
        </View>
        <View className="items-end gap-1">
          <View className={`px-2.5 py-1 rounded-full ${bg1} ${bg2}`}>
            <Text className={`text-[11px] font-semibold ${fg1} ${fg2}`}>
              {prettyStatus(purchase.status)}
            </Text>
          </View>
          <View className="px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20">
            <Text className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
              Attraction
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row items-center gap-5 mt-3">
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} color="#9ca3af" />
          <Text className="text-sm text-gray-600 dark:text-gray-300">
            {formatTime(purchase.scheduledTime)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Ticket size={13} color="#9ca3af" />
          <Text className="text-sm text-gray-600 dark:text-gray-300">
            {purchase.quantity} ticket{purchase.quantity === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          Scheduled {purchaseDateKey(purchase) || "—"}
        </Text>
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {formatMoney(purchase.totalAmount)}
        </Text>
      </View>
    </Pressable>
  );
};

/**
 * A booking laid over its space column, sized by its duration and narrowed to
 * a lane when it clashes with another booking in the same space.
 */
const DayBookingBlock = ({
  placement,
  onPress,
}: {
  placement: SlotPlacement<CalendarBooking>;
  onPress: () => void;
}) => {
  const booking = placement.item;
  const tone = packageColor(booking.packageName);
  const status = statusStyle(booking.status);
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        top: placement.slotIndex * SLOT_HEIGHT + 2,
        height: placement.slotSpan * SLOT_HEIGHT - 4,
        left: `${(100 / placement.laneCount) * placement.lane}%`,
        width: `${100 / placement.laneCount}%`,
        backgroundColor: tone.bg,
        borderLeftColor: status.color,
      }}
      className="rounded-md border-l-4 px-1.5 py-1 overflow-hidden active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${booking.customerName}, ${booking.packageName}, ${formatTime(booking.time)}`}
    >
      <Text
        className="text-[10px] font-semibold"
        style={{ color: tone.text }}
        numberOfLines={1}
      >
        {slotLabel(placement.startMin)}–{slotLabel(placement.endMin)}
        {placement.clipped ? "+" : ""}
      </Text>
      <Text className="text-xs font-bold text-gray-900" numberOfLines={1}>
        {booking.customerName}
      </Text>
      <Text
        className="text-[10px]"
        style={{ color: tone.text }}
        numberOfLines={1}
      >
        {booking.roomName || booking.packageName}
      </Text>
      <Text
        className="text-[10px] font-semibold mt-auto"
        style={{ color: status.color }}
        numberOfLines={1}
      >
        {status.label}
      </Text>
    </Pressable>
  );
};

/** One card in a week cell. */
const WeekEntryCard = ({
  entry,
  onBooking,
  onAttraction,
}: {
  entry: WeekEntry;
  onBooking: (id: number) => void;
  onAttraction: (id: number) => void;
}) => {
  if (entry.kind === "attraction") {
    const purchase = entry.purchase;
    return (
      <Pressable
        onPress={() => onAttraction(purchase.id)}
        style={{ height: WEEK_CARD_HEIGHT }}
        className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/70 dark:bg-purple-900/10 p-2 mb-1.5 active:opacity-80"
      >
        <Text
          className="text-xs font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
        <Text
          className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mt-0.5"
          numberOfLines={1}
        >
          {purchase.attractionName}
        </Text>
        <View className="flex-row items-center gap-1 mt-1">
          <Ticket size={10} color="#9ca3af" />
          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
            {purchase.quantity} ticket{purchase.quantity === 1 ? "" : "s"}
          </Text>
        </View>
        <Text className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 mt-auto">
          View details
        </Text>
      </Pressable>
    );
  }

  const booking = entry.booking;
  const tone = packageColor(booking.packageName);
  return (
    <Pressable
      onPress={() => onBooking(booking.id)}
      style={{ height: WEEK_CARD_HEIGHT, backgroundColor: tone.bg }}
      className="rounded-xl p-2 mb-1.5 active:opacity-80"
    >
      <Text className="text-xs font-bold text-gray-900" numberOfLines={1}>
        {booking.customerName}
      </Text>
      <Text
        className="text-[10px] font-semibold uppercase tracking-wide mt-0.5"
        style={{ color: tone.text }}
        numberOfLines={1}
      >
        {booking.packageName}
      </Text>
      {!!booking.locationName && (
        <View className="flex-row items-center gap-1 mt-1">
          <MapPin size={10} color="#6b7280" />
          <Text className="text-[10px] text-gray-600 flex-1" numberOfLines={1}>
            {booking.locationName}
          </Text>
        </View>
      )}
      <View className="flex-row items-center gap-1 mt-0.5">
        <Users size={10} color="#6b7280" />
        <Text className="text-[10px] text-gray-600">
          {booking.participants}
        </Text>
      </View>
      <Text
        className="text-[10px] font-semibold mt-auto"
        style={{ color: tone.text }}
      >
        View details
      </Text>
    </Pressable>
  );
};

/** The two-section day body (Package Bookings + Attraction Purchases). */
const DaySections = ({
  group,
  onBooking,
  onAttraction,
}: {
  group: DayGroup | undefined;
  onBooking: (id: number) => void;
  onAttraction: (id: number) => void;
}) => {
  const bookings = group?.bookings ?? [];
  const attractions = group?.attractions ?? [];

  if (bookings.length === 0 && attractions.length === 0) {
    return (
      <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
        <CalendarIcon size={30} color="#9ca3af" />
        <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
          No scheduled activity
        </Text>
        <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
          There are no bookings or attraction purchases for this day.
        </Text>
      </View>
    );
  }

  return (
    <>
      {bookings.length > 0 && (
        <View className="mb-2">
          <View className="flex-row items-center gap-2 mb-3">
            <Package size={16} color={BOOKING_TINT} />
            <Text className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Package Bookings ({bookings.length})
            </Text>
          </View>
          {bookings.map((b) => (
            <DayBookingCard key={b.id} booking={b} onPress={() => onBooking(b.id)} />
          ))}
        </View>
      )}

      {attractions.length > 0 && (
        <View className="mb-2">
          <View className="flex-row items-center gap-2 mb-3 mt-1">
            <Ticket size={16} color={ATTRACTION_TINT} />
            <Text className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Attraction Purchases ({attractions.length})
            </Text>
          </View>
          {attractions.map((p) => (
            <AttractionCard key={p.id} purchase={p} onPress={() => onAttraction(p.id)} />
          ))}
        </View>
      )}
    </>
  );
};

/** One line of "N Bookings • N Attraction Tickets" summary text. */
const summaryText = (group: DayGroup | undefined): string => {
  if (!group) return "";
  const parts: string[] = [];
  if (group.bookings.length > 0) {
    parts.push(
      `${group.bookings.length} booking${group.bookings.length === 1 ? "" : "s"}`,
    );
  }
  if (group.attractionTickets > 0) {
    parts.push(
      `${group.attractionTickets} attraction ticket${group.attractionTickets === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" • ");
};

const Calendar = () => {
  const insets = useSafeAreaInsets();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(today);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  // Day whose detail sheet is open (YYYY-MM-DD), or null when closed.
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Day / week grid filters.
  const [search, setSearch] = useState("");
  const [hideEmptySpaces, setHideEmptySpaces] = useState(false);

  const {
    totalCount: unreadNotificationsCount,
    refresh: refreshNotifications,
  } = useNotifications("unread");

  // The visible window [start, end] depends on the active view mode.
  const { startDate, endDate } = useMemo(() => {
    if (viewMode === "month") {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      return { startDate: dateKey(first), endDate: dateKey(last) };
    }
    if (viewMode === "week") {
      const start = startOfWeek(anchor);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { startDate: dateKey(start), endDate: dateKey(end) };
    }
    return { startDate: dateKey(anchor), endDate: dateKey(anchor) };
  }, [viewMode, anchor]);

  const {
    bookings,
    loading,
    error,
    refetch: refetchBookings,
  } = useCalendarBookings({ startDate, endDate });

  const { purchases, refetch: refetchPurchases } = useAttractionPurchases();

  // Spaces are the day grid's columns; a space carries only a location id, so
  // the locations list supplies the label under each column head.
  const { spaces, refetch: refetchSpaces } = useSpaces();
  const { locations } = useLocationOptions();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchBookings(),
        refetchPurchases(),
        refetchSpaces(),
        refreshNotifications(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchBookings, refetchPurchases, refetchSpaces, refreshNotifications]);

  // Attraction purchases within the visible window, keyed by scheduled day.
  const purchasesInWindow = useMemo(
    () =>
      purchases.filter((p) => {
        const key = purchaseDateKey(p);
        return key >= startDate && key <= endDate;
      }),
    [purchases, startDate, endDate],
  );

  // Categories present in the visible window — bookings by package category,
  // tickets by attraction category. Built before the category filter is applied,
  // so a deselected tab keeps its place and its count (same as the web).
  const categories = useMemo(
    () =>
      buildCalendarCategories({
        bookings,
        attractions: purchasesInWindow,
      }),
    [bookings, purchasesInWindow],
  );

  const categoryFilter = useCategoryFilter(categories);
  const { shows: showsCategory } = categoryFilter;

  const visibleBookings = useMemo(
    () => bookings.filter((b) => showsCategory(categoryKeyOf(b.packageCategory))),
    [bookings, showsCategory],
  );
  const visiblePurchases = useMemo(
    () => purchasesInWindow.filter((p) => showsCategory(categoryKeyOf(p.category))),
    [purchasesInWindow, showsCategory],
  );

  // Group the window's bookings + attraction purchases by day.
  const byDate = useMemo(() => {
    const map: Record<string, DayGroup> = {};
    const ensure = (key: string) =>
      map[key] ??
      (map[key] = { bookings: [], attractions: [], attractionTickets: 0 });

    for (const b of visibleBookings) ensure(b.date).bookings.push(b);
    for (const p of visiblePurchases) {
      const entry = ensure(purchaseDateKey(p));
      entry.attractions.push(p);
      entry.attractionTickets += Number(p.quantity) || 0;
    }

    for (const key of Object.keys(map)) {
      map[key].bookings.sort((a, b) =>
        (a.time ?? "").localeCompare(b.time ?? ""),
      );
      map[key].attractions.sort((a, b) =>
        (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""),
      );
    }
    return map;
  }, [visibleBookings, visiblePurchases]);

  // Month grid cells (leading blanks + days, padded to whole weeks).
  const cells = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: { key: string | null; day: number }[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push({ key: null, day: 0 });
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({ key: `${year}-${pad2(month + 1)}-${pad2(day)}`, day });
    }
    while (out.length % 7 !== 0) out.push({ key: null, day: 0 });
    return out;
  }, [anchor]);

  // Days of the active week (Sun..Sat) for the week agenda.
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor]);

  /* ---------------------------------------------------------- day grid --- */

  const spaceById = useMemo(
    () => new Map(spaces.map((s) => [s.id, s])),
    [spaces],
  );
  const locationNameById = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  );
  const knownRoomIds = useMemo(
    () => new Set(spaces.map((s) => s.id)),
    [spaces],
  );

  /** Location label for a space column, or null for a company-wide space. */
  const spaceLocationLabel = useCallback(
    (roomId: number | null): string | null => {
      if (roomId == null) return null;
      const locationId = spaceById.get(roomId)?.locationId ?? null;
      if (locationId == null) return null;
      return locationNameById.get(locationId) ?? null;
    },
    [spaceById, locationNameById],
  );

  const matchesSearch = useCallback(
    (name: string, phone: string | null) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return `${name} ${phone ?? ""}`.toLowerCase().includes(term);
    },
    [search],
  );

  const dayBookings = useMemo(
    () =>
      (byDate[startDate]?.bookings ?? []).filter((b) =>
        matchesSearch(b.customerName, b.customerPhone),
      ),
    [byDate, startDate, matchesSearch],
  );
  const dayAttractions = useMemo(
    () =>
      (byDate[startDate]?.attractions ?? []).filter((p) =>
        matchesSearch(p.customerName, p.phone),
      ),
    [byDate, startDate, matchesSearch],
  );

  const dayColumns = useMemo(
    () =>
      buildColumns({
        spaces,
        bookings: dayBookings,
        hideEmptySpaces,
        knownRoomIds,
      }),
    [spaces, dayBookings, hideEmptySpaces, knownRoomIds],
  );
  const dayWindow = useMemo(() => computeSlotWindow(dayBookings), [dayBookings]);
  const daySlots = useMemo(
    () =>
      Array.from(
        { length: dayWindow.slots },
        (_, i) => dayWindow.start + i * SLOT_MINUTES,
      ),
    [dayWindow],
  );
  const dayPlacements = useMemo(
    () =>
      placeByColumn({
        columns: dayColumns,
        items: dayBookings,
        window: dayWindow,
        knownRoomIds,
      }),
    [dayColumns, dayBookings, dayWindow, knownRoomIds],
  );
  /** Room columns the "hide empty spaces" toggle is currently holding back. */
  const hiddenSpaceCount = hideEmptySpaces
    ? spaces.length - dayColumns.filter((c) => !c.virtual).length
    : 0;

  /* --------------------------------------------------------- week grid --- */

  const weekEntries = useMemo<WeekEntry[]>(() => {
    const out: WeekEntry[] = [];
    for (const day of weekDays) {
      const key = dateKey(day);
      const group = byDate[key];
      if (!group) continue;
      for (const booking of group.bookings) {
        if (!matchesSearch(booking.customerName, booking.customerPhone)) continue;
        out.push({
          kind: "booking",
          key: `b-${booking.id}`,
          time: booking.time,
          dateKey: key,
          booking,
        });
      }
      for (const purchase of group.attractions) {
        if (!matchesSearch(purchase.customerName, purchase.phone)) continue;
        out.push({
          kind: "attraction",
          key: `a-${purchase.id}`,
          time: purchase.scheduledTime,
          dateKey: key,
          purchase,
        });
      }
    }
    return out;
  }, [weekDays, byDate, matchesSearch]);

  const weekRows = useMemo<WeekRow[]>(
    () =>
      distinctStartMinutes(weekEntries).map((minutes) => {
        const byDay: Record<string, WeekEntry[]> = {};
        let tallest = 0;
        for (const entry of weekEntries) {
          if (timeToMinutes(entry.time) !== minutes) continue;
          const list = (byDay[entry.dateKey] ??= []);
          list.push(entry);
          tallest = Math.max(tallest, list.length);
        }
        return {
          minutes,
          byDay,
          height: Math.max(
            WEEK_ROW_MIN_HEIGHT,
            tallest * (WEEK_CARD_HEIGHT + 6) + 12,
          ),
        };
      }),
    [weekEntries],
  );
  const weekEntryCount = weekEntries.length;

  /* ------------------------------------------------- shared empty state --- */

  const isSearching = search.trim().length > 0;
  const emptyGridTitle = isSearching
    ? "No matching bookings"
    : categoryFilter.isAll
      ? "No activity"
      : "Nothing in the selected categories";
  const emptyGridHint = isSearching
    ? "Nothing here matches that customer name or phone."
    : "There is nothing scheduled in this period.";

  const step = (dir: number) => {
    const next = new Date(anchor);
    if (viewMode === "month") next.setMonth(anchor.getMonth() + dir);
    else if (viewMode === "week") next.setDate(anchor.getDate() + dir * 7);
    else next.setDate(anchor.getDate() + dir);
    setAnchor(next);
  };

  const goToToday = () => setAnchor(new Date());

  /** Whether the visible period already contains today (Today reads as on). */
  const isAnchoredOnToday = useMemo(() => {
    if (viewMode === "day") return dateKey(anchor) === todayKey;
    if (viewMode === "week") {
      return todayKey >= dateKey(weekDays[0]) && todayKey <= dateKey(weekDays[6]);
    }
    return (
      anchor.getFullYear() === today.getFullYear() &&
      anchor.getMonth() === today.getMonth()
    );
  }, [viewMode, anchor, weekDays, todayKey, today]);

  const headerLabel = useMemo(() => {
    if (viewMode === "month") {
      return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    if (viewMode === "week") {
      const s = weekDays[0];
      const e = weekDays[6];
      const left = `${MONTH_SHORT[s.getMonth()]} ${s.getDate()}`;
      const right =
        s.getMonth() === e.getMonth()
          ? `${e.getDate()}`
          : `${MONTH_SHORT[e.getMonth()]} ${e.getDate()}`;
      return `${left} – ${right}, ${e.getFullYear()}`;
    }
    return `${WEEKDAY_FULL[anchor.getDay()]}, ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`;
  }, [viewMode, anchor, weekDays]);

  const openBooking = (id: number) => setSelectedBookingId(id);
  const openAttraction = (id: number) => {
    // Close the day sheet first so navigating away doesn't leave it stacked.
    setSelectedDayKey(null);
    router.push({
      pathname: "/attractions/purchase-details",
      params: { id: String(id) },
    });
  };

  const getViewIcon = (mode: ViewMode) => {
    switch (mode) {
      case "month":
        return CalendarDays;
      case "week":
        return CalendarRange;
      case "day":
        return CalendarDay;
      default:
        return CalendarIcon;
    }
  };

  // Full-date label for the day-detail sheet title.
  const sheetTitle = useMemo(() => {
    if (!selectedDayKey) return "";
    const d = new Date(`${selectedDayKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return selectedDayKey;
    return `${WEEKDAY_FULL[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }, [selectedDayKey]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <DashboardHeader unreadCount={unreadNotificationsCount} />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 96,
          paddingTop: 0,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0644C7"
            colors={["#0644C7"]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        <View className="px-5 pt-0">
          {/* Welcome Section */}
          <ScreenTitleCard
            title="Calendar"
            subtitle="Bookings and attraction purchases at a glance"
          />

          {/* View-mode filter */}
          <View className="flex-row bg-white dark:bg-neutral-900 rounded-xl p-1.5 mb-4 shadow-sm border border-gray-100 dark:border-neutral-800">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => {
              const active = viewMode === mode;
              const IconComponent = getViewIcon(mode);
              return (
                <Pressable
                  key={mode}
                  onPress={() => setViewMode(mode)}
                  className={`flex-1 py-2.5 rounded-lg items-center flex-row justify-center gap-2 ${
                    active ? "bg-[#0644C7]" : ""
                  }`}
                >
                  <IconComponent
                    size={16}
                    color={active ? "#FFFFFF" : "#6b7280"}
                  />
                  <Text
                    className={`text-sm font-semibold capitalize ${
                      active ? "text-white" : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {mode}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Period navigation — arrows either side of the label, Today at the
              right so it reads as a jump rather than a fourth view mode. */}
          <View className="flex-row items-center gap-2 mb-4">
            <Pressable
              onPress={() => step(-1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
              accessibilityRole="button"
              accessibilityLabel="Previous"
            >
              <ChevronLeft size={20} color="#6b7280" />
            </Pressable>
            <Text
              className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center"
              numberOfLines={1}
            >
              {headerLabel}
            </Text>
            <Pressable
              onPress={() => step(1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
              accessibilityRole="button"
              accessibilityLabel="Next"
            >
              <ChevronRight size={20} color="#6b7280" />
            </Pressable>
            <Pressable
              onPress={goToToday}
              className={`px-4 h-10 rounded-full items-center justify-center border ${
                isAnchoredOnToday
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  isAnchoredOnToday ? "text-white" : "text-[#0644C7]"
                }`}
              >
                Today
              </Text>
            </Pressable>
          </View>

          {/* Search + space visibility — the day and week grids are filtered by
              customer, and the day grid can drop the spaces nothing is booked
              into (58 columns is a lot of scrolling for one booking). */}
          {viewMode !== "month" && (
            <View className="flex-row items-center gap-2 mb-4">
              <View className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl px-3 h-11">
                <Search size={16} color="#9ca3af" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search customer name or phone"
                  placeholderTextColor="#9ca3af"
                  className="flex-1 text-sm text-gray-900 dark:text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {search.length > 0 && (
                  <Pressable
                    onPress={() => setSearch("")}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                  >
                    <XCircle size={16} color="#9ca3af" />
                  </Pressable>
                )}
              </View>
              {viewMode === "day" && (
                <Pressable
                  onPress={() => setHideEmptySpaces((v) => !v)}
                  className={`flex-row items-center gap-1.5 px-3 h-11 rounded-xl border ${
                    hideEmptySpaces
                      ? "bg-[#0644C7]/10 dark:bg-[#0644C7]/20 border-[#0644C7]/40"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ checked: hideEmptySpaces }}
                >
                  {hideEmptySpaces ? (
                    <EyeOff size={16} color="#0644C7" />
                  ) : (
                    <Eye size={16} color="#6b7280" />
                  )}
                  <Text
                    className={`text-xs font-semibold ${
                      hideEmptySpaces
                        ? "text-[#0644C7]"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {hideEmptySpaces ? "Empty hidden" : "All spaces"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Category tabs — All / <package & attraction categories>, filtering
              bookings and attraction tickets together (web parity). Rendered
              outside the loading swap below so the tabs hold their place while
              the calendar shows its skeleton; a refresh keeps the cached
              bookings, so they keep their selection and counts throughout. On a
              cold load there is nothing to build categories from yet, so the
              tabs hold the row with placeholders. */}
          <CalendarCategoryTabs filter={categoryFilter} loading={loading} />

          {/* Error */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* ---- MONTH ---- */}
          {viewMode === "month" &&
            (loading ? (
              <CalendarSkeleton rows={cells.length / 7} />
            ) : (
              <>
                <View className="rounded-2xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
                  <View className="flex-row bg-gray-50 dark:bg-neutral-800/50">
                    {WEEKDAYS.map((d, i) => (
                      <View key={i} className="flex-1 items-center py-3">
                        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          {d}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {Array.from({ length: cells.length / 7 }).map((_, row) => (
                    <View key={row} className="flex-row">
                      {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                        const group = cell.key ? byDate[cell.key] : undefined;
                        const bookingCount = group?.bookings.length ?? 0;
                        const ticketCount = group?.attractionTickets ?? 0;
                        const hasActivity = bookingCount > 0 || ticketCount > 0;
                        const isToday = cell.key === todayKey;

                        return (
                          <Pressable
                            key={cell.key ?? `pad-${row}-${col}`}
                            disabled={!hasActivity}
                            onPress={() =>
                              hasActivity &&
                              cell.key &&
                              setSelectedDayKey(cell.key)
                            }
                            style={{ minHeight: 84 }}
                            className={`flex-1 p-1.5 ${
                              cell.key === null
                                ? "bg-gray-50/50 dark:bg-neutral-900/50"
                                : hasActivity
                                  ? "active:bg-blue-50 dark:active:bg-blue-900/20"
                                  : ""
                            } ${col < 6 ? "border-r border-gray-100 dark:border-neutral-800" : ""} ${
                              row < Math.ceil(cells.length / 7) - 1
                                ? "border-b border-gray-100 dark:border-neutral-800"
                                : ""
                            }`}
                          >
                            {cell.key !== null && (
                              <>
                                <View
                                  className={`w-7 h-7 rounded-full items-center justify-center mb-1 ${
                                    isToday ? "bg-[#0644C7]" : ""
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-semibold ${
                                      isToday
                                        ? "text-white"
                                        : hasActivity
                                          ? "text-gray-900 dark:text-white"
                                          : "text-gray-300 dark:text-neutral-600"
                                    }`}
                                  >
                                    {cell.day}
                                  </Text>
                                </View>

                                {bookingCount > 0 && (
                                  <CountPill
                                    icon={Package}
                                    count={bookingCount}
                                    tint={BOOKING_TINT}
                                    bg="bg-blue-50 dark:bg-blue-900/20"
                                  />
                                )}
                                {ticketCount > 0 && (
                                  <CountPill
                                    icon={Ticket}
                                    count={ticketCount}
                                    tint={ATTRACTION_TINT}
                                    bg="bg-purple-50 dark:bg-purple-900/20"
                                  />
                                )}
                              </>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* Legend */}
                <View className="flex-row items-center justify-center gap-5 mt-3 mb-1">
                  <View className="flex-row items-center gap-1.5">
                    <Package size={12} color={BOOKING_TINT} />
                    <Text className="text-xs text-gray-600 dark:text-gray-400">
                      Bookings
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Ticket size={12} color={ATTRACTION_TINT} />
                    <Text className="text-xs text-gray-600 dark:text-gray-400">
                      Attraction Tickets
                    </Text>
                  </View>
                </View>
              </>
            ))}

          {/* Week / Day loading */}
          {viewMode === "week" && loading && <CalendarWeekSkeleton />}
          {viewMode === "day" && loading && <CalendarDaySkeleton />}

          {/* ---- WEEK ----
              Time down the side, one column per day, a card per booking. Rows
              are the distinct start times in the week rather than a fixed
              hourly ruler, so a quiet week stays a few rows tall. */}
          {viewMode === "week" && !loading && (
            <View className="rounded-2xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
              {weekRows.length === 0 ? (
                <View className="p-8 items-center">
                  <CalendarIcon size={30} color="#9ca3af" />
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                    {emptyGridTitle}
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                    {emptyGridHint}
                  </Text>
                </View>
              ) : (
                <View className="flex-row">
                  {/* Fixed time gutter */}
                  <View
                    style={{ width: TIME_COL_WIDTH }}
                    className="border-r border-gray-100 dark:border-neutral-800"
                  >
                    <View
                      style={{ height: GRID_HEADER_HEIGHT }}
                      className="flex-row items-center gap-1 px-3 border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50"
                    >
                      <Clock size={12} color="#6b7280" />
                      <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        Time
                      </Text>
                    </View>
                    {weekRows.map((row) => (
                      <View
                        key={row.minutes}
                        style={{ height: row.height }}
                        className="px-3 pt-2 border-b border-gray-100 dark:border-neutral-800"
                      >
                        <Text className="text-xs font-semibold text-[#0644C7]">
                          {slotLabel(row.minutes)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row">
                      {weekDays.map((day) => {
                        const key = dateKey(day);
                        const isToday = key === todayKey;
                        return (
                          <View
                            key={key}
                            style={{ width: WEEK_COL_WIDTH }}
                            className="border-r border-gray-100 dark:border-neutral-800"
                          >
                            <Pressable
                              onPress={() => {
                                setAnchor(new Date(day));
                                setViewMode("day");
                              }}
                              style={{ height: GRID_HEADER_HEIGHT }}
                              className={`px-3 justify-center border-b border-gray-100 dark:border-neutral-800 ${
                                isToday
                                  ? "bg-[#0644C7]/10 dark:bg-[#0644C7]/20"
                                  : "bg-gray-50 dark:bg-neutral-800/50"
                              }`}
                            >
                              <Text
                                className={`text-[11px] font-bold tracking-wide ${
                                  isToday
                                    ? "text-[#0644C7]"
                                    : "text-gray-500 dark:text-gray-400"
                                }`}
                              >
                                {WEEKDAY_ABBR[day.getDay()]}
                              </Text>
                              <Text
                                className={`text-[11px] ${
                                  isToday
                                    ? "text-[#0644C7]"
                                    : "text-gray-400 dark:text-gray-500"
                                }`}
                              >
                                {MONTH_SHORT[day.getMonth()].toUpperCase()}{" "}
                                {day.getDate()}
                              </Text>
                            </Pressable>

                            {weekRows.map((row) => {
                              const entries = row.byDay[key] ?? [];
                              return (
                                <View
                                  key={row.minutes}
                                  style={{ height: row.height }}
                                  className="px-2 py-1.5 border-b border-gray-100 dark:border-neutral-800"
                                >
                                  {entries.length === 0 ? (
                                    <Text className="text-gray-300 dark:text-neutral-700 text-xs">
                                      –
                                    </Text>
                                  ) : (
                                    entries.map((entry) => (
                                      <WeekEntryCard
                                        key={entry.key}
                                        entry={entry}
                                        onBooking={openBooking}
                                        onAttraction={openAttraction}
                                      />
                                    ))
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              <View className="px-4 py-2.5 border-t border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  <Text className="font-semibold text-[#0644C7]">
                    {weekEntryCount}
                  </Text>{" "}
                  {weekEntryCount === 1 ? "entry" : "entries"} across 7 days
                </Text>
              </View>
            </View>
          )}

          {/* ---- DAY ----
              The space grid: one column per space, 15-minute slots down the
              side, bookings laid over their column. Same column model as the
              Space Schedule, so a booking with no room gets a virtual column
              of its own rather than being dropped. */}
          {viewMode === "day" && !loading && (
            <>
              <View className="rounded-2xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
                <View className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    {headerLabel}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <Text className="font-semibold text-[#0644C7]">
                      {dayBookings.length}
                    </Text>{" "}
                    {dayBookings.length === 1 ? "booking" : "bookings"}
                  </Text>
                </View>

                {dayColumns.length === 0 ? (
                  <View className="p-8 items-center">
                    <CalendarIcon size={30} color="#9ca3af" />
                    <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                      {emptyGridTitle}
                    </Text>
                    <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
                      {emptyGridHint}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row">
                    {/* Fixed time gutter */}
                    <View
                      style={{ width: TIME_COL_WIDTH }}
                      className="border-r border-gray-100 dark:border-neutral-800"
                    >
                      <View
                        style={{ height: GRID_HEADER_HEIGHT }}
                        className="flex-row items-center gap-1 px-3 border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50"
                      >
                        <Clock size={12} color="#6b7280" />
                        <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          Time
                        </Text>
                      </View>
                      {daySlots.map((minutes) => (
                        <View
                          key={minutes}
                          style={{ height: SLOT_HEIGHT }}
                          className="px-3 pt-1 border-b border-gray-100 dark:border-neutral-800"
                        >
                          <Text className="text-xs font-medium text-[#0644C7]">
                            {slotLabel(minutes)}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row">
                        {dayColumns.map((column) => (
                          <View
                            key={column.key}
                            style={{ width: DAY_COL_WIDTH }}
                            className="border-r border-gray-100 dark:border-neutral-800"
                          >
                            <View
                              style={{ height: GRID_HEADER_HEIGHT }}
                              className="px-2 items-center justify-center border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50"
                            >
                              <Text
                                className="text-xs font-bold text-gray-900 dark:text-white"
                                numberOfLines={1}
                              >
                                {column.name}
                              </Text>
                              {column.virtual ? (
                                <View className="flex-row items-center gap-1 mt-0.5">
                                  <AlertTriangle size={10} color="#F59E0B" />
                                  <Text className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                    No room
                                  </Text>
                                </View>
                              ) : (
                                !!spaceLocationLabel(column.roomId) && (
                                  <View className="flex-row items-center gap-1 mt-0.5">
                                    <MapPin size={10} color="#9ca3af" />
                                    <Text
                                      className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink"
                                      numberOfLines={1}
                                    >
                                      {spaceLocationLabel(column.roomId)}
                                    </Text>
                                  </View>
                                )
                              )}
                            </View>

                            <View
                              style={{ height: daySlots.length * SLOT_HEIGHT }}
                            >
                              {daySlots.map((minutes) => (
                                <View
                                  key={minutes}
                                  style={{ height: SLOT_HEIGHT }}
                                  className="items-center justify-center border-b border-gray-100 dark:border-neutral-800"
                                >
                                  <Text className="text-gray-300 dark:text-neutral-700 text-xs">
                                    –
                                  </Text>
                                </View>
                              ))}

                              {(dayPlacements.get(column.key) ?? []).map(
                                (placement) => (
                                  <DayBookingBlock
                                    key={placement.item.id}
                                    placement={placement}
                                    onPress={() =>
                                      openBooking(placement.item.id)
                                    }
                                  />
                                ),
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                <View className="px-4 py-2.5 border-t border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    <Text className="font-semibold text-[#0644C7]">
                      {dayBookings.length}
                    </Text>{" "}
                    {dayBookings.length === 1 ? "booking" : "bookings"} across{" "}
                    <Text className="font-semibold text-gray-700 dark:text-gray-200">
                      {dayColumns.length}
                    </Text>{" "}
                    {dayColumns.length === 1 ? "column" : "columns"}
                    {hiddenSpaceCount > 0
                      ? ` · ${hiddenSpaceCount} empty space${hiddenSpaceCount === 1 ? "" : "s"} hidden`
                      : ""}
                  </Text>
                </View>
              </View>

              {/* Attraction tickets have no space of their own, so they sit
                  under the grid rather than in it. */}
              {dayAttractions.length > 0 && (
                <View className="mt-5">
                  <View className="flex-row items-center gap-2 mb-3">
                    <Ticket size={16} color={ATTRACTION_TINT} />
                    <Text className="text-sm font-bold text-gray-700 dark:text-gray-200">
                      Attraction Purchases ({dayAttractions.length})
                    </Text>
                  </View>
                  {dayAttractions.map((purchase) => (
                    <AttractionCard
                      key={purchase.id}
                      purchase={purchase}
                      onPress={() => openAttraction(purchase.id)}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          {/* Empty month */}
          {!loading &&
            !error &&
            viewMode === "month" &&
            visibleBookings.length === 0 &&
            visiblePurchases.length === 0 && (
              <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 mt-4 items-center border border-gray-100 dark:border-neutral-800">
                <CalendarIcon size={32} color="#9ca3af" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                  {categoryFilter.isAll
                    ? "No activity"
                    : "Nothing in the selected categories"}
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                  {categoryFilter.isAll
                    ? `There are no bookings or attraction purchases in ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}.`
                    : `Nothing matches the selected categories in ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}.`}
                </Text>
              </View>
            )}
        </View>
      </ScrollView>

      {/* Day detail (month/week tap) */}
      <BottomSheet
        visible={selectedDayKey !== null}
        onClose={() => setSelectedDayKey(null)}
        title={sheetTitle}
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {!!selectedDayKey && (
            <>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {summaryText(byDate[selectedDayKey]) || "No activity"}
              </Text>
              <DaySections
                group={byDate[selectedDayKey]}
                onBooking={openBooking}
                onAttraction={openAttraction}
              />
            </>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Full booking detail */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetchBookings}
      />
    </View>
  );
};

export default Calendar;
