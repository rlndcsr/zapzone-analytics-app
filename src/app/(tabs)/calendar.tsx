import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { DashboardHeader } from "../../components/ui/DashboardHeader";
import { ScreenTitleCard } from "../../components/ui/ScreenTitleCard";
import {
  CalendarDaySkeleton,
  CalendarSkeleton,
  CalendarWeekSkeleton,
} from "../../components/ui/skeleton/CalendarSkeleton";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { useAttractionPurchases } from "../../lib/hooks/useAttractionPurchases";
import { useNotifications } from "../../lib/hooks/useNotifications";
import type { CalendarBooking } from "../../services/bookingsService";
import type { PurchaseRow } from "../../services/attractionPurchasesService";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchBookings(),
        refetchPurchases(),
        refreshNotifications(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchBookings, refetchPurchases, refreshNotifications]);

  // Attraction purchases within the visible window, keyed by scheduled day.
  const purchasesInWindow = useMemo(
    () =>
      purchases.filter((p) => {
        const key = purchaseDateKey(p);
        return key >= startDate && key <= endDate;
      }),
    [purchases, startDate, endDate],
  );

  // Group the window's bookings + attraction purchases by day.
  const byDate = useMemo(() => {
    const map: Record<string, DayGroup> = {};
    const ensure = (key: string) =>
      map[key] ??
      (map[key] = { bookings: [], attractions: [], attractionTickets: 0 });

    for (const b of bookings) ensure(b.date).bookings.push(b);
    for (const p of purchasesInWindow) {
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
  }, [bookings, purchasesInWindow]);

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

  const step = (dir: number) => {
    const next = new Date(anchor);
    if (viewMode === "month") next.setMonth(anchor.getMonth() + dir);
    else if (viewMode === "week") next.setDate(anchor.getDate() + dir * 7);
    else next.setDate(anchor.getDate() + dir);
    setAnchor(next);
  };

  const goToToday = () => {
    setAnchor(new Date());
    setViewMode("day");
  };

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
          <View className="flex-row bg-white dark:bg-neutral-900 rounded-xl p-1.5 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => {
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
            <Pressable
              onPress={goToToday}
              className="flex-1 py-2.5 rounded-lg items-center bg-[#0644C7]/10 dark:bg-[#0644C7]/20"
            >
              <Text className="text-sm font-semibold text-[#0644C7]">Today</Text>
            </Pressable>
          </View>

          {/* Period navigation */}
          <View className="flex-row items-center justify-between mb-5">
            <Pressable
              onPress={() => step(-1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
            >
              <ChevronLeft size={20} color="#6b7280" />
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center mx-2">
              {headerLabel}
            </Text>
            <Pressable
              onPress={() => step(1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
            >
              <ChevronRight size={20} color="#6b7280" />
            </Pressable>
          </View>

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

          {/* ---- WEEK ---- */}
          {viewMode === "week" &&
            !loading &&
            weekDays.map((d) => {
              const key = dateKey(d);
              const group = byDate[key];
              const isToday = key === todayKey;
              const hasActivity =
                (group?.bookings.length ?? 0) > 0 ||
                (group?.attractionTickets ?? 0) > 0;
              return (
                <Pressable
                  key={key}
                  disabled={!hasActivity}
                  onPress={() => hasActivity && setSelectedDayKey(key)}
                  className={`mb-3 rounded-2xl p-4 bg-white dark:bg-neutral-900 border ${
                    isToday
                      ? "border-[#0644C7]/40"
                      : "border-gray-100 dark:border-neutral-800"
                  } ${hasActivity ? "active:opacity-80" : ""}`}
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className={`w-10 h-10 rounded-full items-center justify-center ${
                        isToday
                          ? "bg-[#0644C7]"
                          : "bg-gray-100 dark:bg-neutral-800"
                      }`}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          isToday
                            ? "text-white"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`text-sm font-semibold ${
                          isToday
                            ? "text-[#0644C7]"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {WEEKDAY_FULL[d.getDay()]}
                      </Text>
                      <Text className="text-xs text-gray-400 dark:text-gray-500">
                        {hasActivity ? summaryText(group) : "No activity"}
                      </Text>
                    </View>
                    {hasActivity && <ChevronRight size={18} color="#9ca3af" />}
                  </View>
                </Pressable>
              );
            })}

          {/* ---- DAY ---- */}
          {viewMode === "day" && !loading && (
            <>
              <View className="flex-row items-center gap-3 mb-4">
                <View className="w-10 h-10 rounded-full bg-[#0644C7] items-center justify-center">
                  <Text className="text-white font-bold text-sm">
                    {anchor.getDate()}
                  </Text>
                </View>
                <View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                    {WEEKDAY_FULL[anchor.getDay()]}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-gray-500">
                    {summaryText(byDate[startDate]) || "No activity"}
                  </Text>
                </View>
              </View>
              <DaySections
                group={byDate[startDate]}
                onBooking={openBooking}
                onAttraction={openAttraction}
              />
            </>
          )}

          {/* Empty month */}
          {!loading &&
            !error &&
            viewMode === "month" &&
            bookings.length === 0 &&
            purchasesInWindow.length === 0 && (
              <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 mt-4 items-center border border-gray-100 dark:border-neutral-800">
                <CalendarIcon size={32} color="#9ca3af" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                  No activity
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                  There are no bookings or attraction purchases in{" "}
                  {MONTH_NAMES[anchor.getMonth()]} {anchor.getFullYear()}.
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
