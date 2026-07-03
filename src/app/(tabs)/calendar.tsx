import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { DashboardHeader } from "../../components/ui/DashboardHeader";
import { ScreenTitleCard } from "../../components/ui/ScreenTitleCard";
import {
  CalendarDaySkeleton,
  CalendarSkeleton,
  CalendarWeekSkeleton,
} from "../../components/ui/skeleton/CalendarSkeleton";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { useNotifications } from "../../lib/hooks/useNotifications";
import type { CalendarBooking } from "../../services/bookingsService";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Users,
  User,
  MapPin,
  Clock,
  CheckCircle,
  Clock as ClockIcon,
  XCircle,
  AlertCircle,
  CalendarDays,
  CalendarRange,
  Calendar as CalendarDay,
  CircleDot,
  BadgeCheck,
  Circle,
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
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_ORDER = [
  "confirmed",
  "pending",
  "checked-in",
  "completed",
  "cancelled",
];

const STATUS_STYLE: Record<
  string,
  {
    label: string;
    dot: string;
    text: string;
    badge: string;
    card: string;
    color: string;
    icon: any;
  }
> = {
  confirmed: {
    label: "Confirmed",
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
    badge:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    card: "bg-white dark:bg-neutral-900",
    color: "#22C55E",
    icon: CheckCircle,
  },
  pending: {
    label: "Pending",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    card: "bg-white dark:bg-neutral-900",
    color: "#F59E0B",
    icon: ClockIcon,
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    card: "bg-white dark:bg-neutral-900",
    color: "#EF4444",
    icon: XCircle,
  },
  "checked-in": {
    label: "Checked In",
    dot: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
    badge:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    card: "bg-white dark:bg-neutral-900",
    color: "#6366F1",
    icon: CircleDot,
  },
  completed: {
    label: "Completed",
    dot: "bg-[#0644C7]",
    text: "text-[#0644C7]",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    card: "bg-white dark:bg-neutral-900",
    color: "#0644C7",
    icon: BadgeCheck,
  },
};

const statusStyle = (status: string) =>
  STATUS_STYLE[status] ?? STATUS_STYLE.pending;

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
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr} ${meridian}`;
}

type DayGroup = { bookings: CalendarBooking[]; counts: Record<string, number> };

/** Status Legend Component */
const StatusLegend = () => {
  const legendItems = [
    { key: "confirmed", label: "Confirmed", color: "#22C55E" },
    { key: "pending", label: "Pending", color: "#F59E0B" },
    { key: "cancelled", label: "Cancelled", color: "#EF4444" },
  ];

  return (
    <View className="flex-row items-center justify-center gap-4 mt-3 mb-1">
      {legendItems.map((item) => (
        <View key={item.key} className="flex-row items-center gap-1.5">
          <Circle size={8} fill={item.color} color={item.color} />
          <Text className="text-xs text-gray-600 dark:text-gray-400">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
};

/** Clean, minimal booking card. Tap opens the full detail sheet. */
const BookingCard = ({
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
      className="rounded-2xl p-4 mb-2.5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 active:opacity-80"
    >
      {/* Time + status */}
      <View className="flex-row items-center justify-between mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <Clock size={14} color="#9ca3af" />
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
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

      {/* Title + amount */}
      <View className="flex-row items-center justify-between">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2"
          numberOfLines={1}
        >
          {booking.packageName}
        </Text>
        <Text className="text-base font-bold text-[#0644C7]">
          {formatMoney(booking.totalAmount)}
        </Text>
      </View>

      {/* Meta: customer + participants */}
      <View className="flex-row items-center gap-4 mt-1.5">
        <View className="flex-row items-center gap-1 flex-1">
          <User size={13} color="#9ca3af" />
          <Text
            className="text-sm text-gray-500 dark:text-gray-400 flex-1"
            numberOfLines={1}
          >
            {booking.customerName}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Users size={13} color="#9ca3af" />
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {booking.participants}
          </Text>
        </View>
      </View>

      {!!booking.locationName && (
        <View className="flex-row items-center gap-1 mt-1">
          <MapPin size={12} color="#9ca3af" />
          <Text
            className="text-xs text-gray-400 dark:text-gray-500 flex-1"
            numberOfLines={1}
          >
            {booking.locationName}
          </Text>
        </View>
      )}
    </Pressable>
  );
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
  const [refreshing, setRefreshing] = useState(false);

  /** Jump to a specific date in single-day view (used by month-grid taps). */
  const openDay = (key: string) => {
    setAnchor(new Date(`${key}T00:00:00`));
    setViewMode("day");
  };

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

  const { bookings, loading, error, refetch } = useCalendarBookings({
    startDate,
    endDate,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refreshNotifications()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refreshNotifications]);

  // Group the window's bookings by day with per-status tallies.
  const byDate = useMemo(() => {
    const map: Record<string, DayGroup> = {};
    for (const b of bookings) {
      const entry = map[b.date] ?? (map[b.date] = { bookings: [], counts: {} });
      entry.bookings.push(b);
      entry.counts[b.status] = (entry.counts[b.status] ?? 0) + 1;
    }
    for (const key of Object.keys(map)) {
      map[key].bookings.sort((a, b) =>
        (a.time ?? "").localeCompare(b.time ?? ""),
      );
    }
    return map;
  }, [bookings]);

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

  // Days of the active week (Mon..Sun) for the week agenda — matches the web.
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

  const getViewIcon = (mode: ViewMode) => {
    switch (mode) {
      case 'month': return CalendarDays;
      case 'week': return CalendarRange;
      case 'day': return CalendarDay;
      default: return CalendarIcon;
    }
  };

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
            subtitle="Manage and track all your bookings"
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
              <Text className="text-sm font-semibold text-[#0644C7]">
                Today
              </Text>
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
                        const count = group?.bookings.length ?? 0;
                        const hasBookings = count > 0;
                        const isToday = cell.key === todayKey;
                        const shown = group
                          ? STATUS_ORDER.filter(
                              (s) => (group.counts[s] ?? 0) > 0,
                            )
                          : [];

                        return (
                          <Pressable
                            key={cell.key ?? `pad-${row}-${col}`}
                            disabled={!hasBookings}
                            onPress={() =>
                              hasBookings && cell.key && openDay(cell.key)
                            }
                            style={{ minHeight: 80 }}
                            className={`flex-1 p-1.5 ${
                              cell.key === null
                                ? "bg-gray-50/50 dark:bg-neutral-900/50"
                                : hasBookings
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
                                  className={`w-8 h-8 rounded-full items-center justify-center mb-1 ${
                                    isToday ? "bg-[#0644C7]" : ""
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-semibold ${
                                      isToday
                                        ? "text-white"
                                        : hasBookings
                                          ? "text-gray-900 dark:text-white"
                                          : "text-gray-300 dark:text-neutral-600"
                                    }`}
                                  >
                                    {cell.day}
                                  </Text>
                                </View>

                                {shown.slice(0, 2).map((s) => {
                                  const style = statusStyle(s);
                                  const IconComponent = style.icon;
                                  return (
                                    <View
                                      key={s}
                                      className="flex-row items-center gap-1 mb-0.5"
                                    >
                                      <IconComponent
                                        size={10}
                                        color={style.color}
                                      />
                                      <Text
                                        className={`text-[10px] font-medium ${style.text}`}
                                        numberOfLines={1}
                                      >
                                        {group?.counts[s]}
                                      </Text>
                                    </View>
                                  );
                                })}
                                {hasBookings && shown.length > 2 && (
                                  <Text className="text-[10px] text-gray-400 dark:text-gray-500">
                                    +{shown.length - 2} more
                                  </Text>
                                )}
                              </>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* Status Legend */}
                <StatusLegend />
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
              return (
                <View key={key} className="mb-4">
                  <View className="flex-row items-center gap-3 mb-3">
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
                    <View>
                      <Text
                        className={`text-sm font-semibold ${
                          isToday
                            ? "text-[#0644C7]"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {WEEKDAY_FULL[d.getDay()]}
                      </Text>
                      {!!group && (
                        <Text className="text-xs text-gray-400 dark:text-gray-500">
                          {group.bookings.length} booking
                          {group.bookings.length === 1 ? "" : "s"}
                        </Text>
                      )}
                    </View>
                  </View>
                  {group ? (
                    group.bookings.map((b) => (
                      <BookingCard
                        key={b.id}
                        booking={b}
                        onPress={() => openBooking(b.id)}
                      />
                    ))
                  ) : (
                    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-6 items-center border border-gray-100 dark:border-neutral-800">
                      <Text className="text-sm text-gray-400 dark:text-gray-500">
                        No bookings for this day
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

          {/* ---- DAY ---- */}
          {viewMode === "day" &&
            !loading &&
            (byDate[startDate]?.bookings.length ? (
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
                      {byDate[startDate]?.bookings.length} booking
                      {byDate[startDate]?.bookings.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
                {byDate[startDate].bookings.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onPress={() => openBooking(b.id)}
                  />
                ))}
              </>
            ) : (
              <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
                <CalendarIcon size={32} color="#9ca3af" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                  No bookings
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                  There are no bookings on this day.
                </Text>
              </View>
            ))}

          {/* Empty month */}
          {!loading &&
            !error &&
            viewMode === "month" &&
            bookings.length === 0 && (
              <>
                <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
                  <CalendarIcon size={32} color="#9ca3af" />
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                    No bookings
                  </Text>
                  <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                    There are no bookings in {MONTH_NAMES[anchor.getMonth()]}{" "}
                    {anchor.getFullYear()}.
                  </Text>
                </View>
                {/* Status Legend */}
                <StatusLegend />
              </>
            )}
        </View>
      </ScrollView>

      {/* Full booking detail */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default Calendar;



