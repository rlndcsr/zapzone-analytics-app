import { Image } from "expo-image";
import { router } from "expo-router";
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
import {
  CalendarDaySkeleton,
  CalendarSkeleton,
  CalendarWeekSkeleton,
} from "../../components/ui/skeleton/CalendarSkeleton";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { useNotifications } from "../../lib/hooks/useNotifications";
import type { CalendarBooking } from "../../services/bookingsService";

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
  }
> = {
  confirmed: {
    label: "Confirmed",
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
    badge:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    card: "bg-white dark:bg-neutral-900 border-l-4 border-green-500",
    color: "#22C55E",
  },
  pending: {
    label: "Pending",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    card: "bg-white dark:bg-neutral-900 border-l-4 border-amber-500",
    color: "#F59E0B",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    card: "bg-white dark:bg-neutral-900 border-l-4 border-red-500",
    color: "#EF4444",
  },
  "checked-in": {
    label: "Checked In",
    dot: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
    badge:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    card: "bg-white dark:bg-neutral-900 border-l-4 border-indigo-500",
    color: "#6366F1",
  },
  completed: {
    label: "Completed",
    dot: "bg-[#0644C7]",
    text: "text-[#0644C7]",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    card: "bg-white dark:bg-neutral-900 border-l-4 border-[#0644C7]",
    color: "#0644C7",
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
          <View
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          <Text className="text-xs text-gray-600 dark:text-gray-400">
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
};

/** Rich, status-tinted booking card. Tap opens the full detail sheet. */
const BookingCard = ({
  booking,
  onPress,
}: {
  booking: CalendarBooking;
  onPress: () => void;
}) => {
  const style = statusStyle(booking.status);
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-2xl p-4 mb-3 shadow-sm ${style.card}`}
      style={({ pressed }) => [
        {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 1,
        },
        pressed ? { opacity: 0.8 } : null,
      ]}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <View className="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center">
            <Text className="text-sm">🕐</Text>
          </View>
          <Text className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {formatTime(booking.time)}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full ${style.badge.split(" ")[0]}`}>
          <Text
            className={`text-xs font-semibold ${style.badge.split(" ")[1]}`}
          >
            {style.label}
          </Text>
        </View>
      </View>

      <View className="ml-10">
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

        <View className="flex-row items-center gap-1 mt-1">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {booking.customerName}
          </Text>
          <View className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            👥 {booking.participants}
          </Text>
        </View>

        {!!booking.locationName && (
          <View className="flex-row items-center gap-1 mt-1.5">
            <Text className="text-xs text-gray-400 dark:text-gray-500">📍</Text>
            <Text
              className="text-xs text-gray-400 dark:text-gray-500"
              numberOfLines={1}
            >
              {booking.locationName}
            </Text>
          </View>
        )}
      </View>
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Gradient Header */}
      <View className="bg-[#0644C7] pt-12 pb-4 px-5 w-full relative overflow-hidden z-10">
        <View className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <View className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable>
            <Image
              source={require("../../../assets/zapzone-assests/Zap-Zone.png")}
              style={{ width: 70, height: 28 }}
              contentFit="contain"
            />
          </Pressable>
          <View className="flex-row items-center gap-3">
            {unreadNotificationsCount > 0 && (
              <Pressable
                onPress={() => router.push("/notification/notification")}
                className="bg-white/20 backdrop-blur-sm rounded-full px-3.5 py-1.5 flex-row items-center gap-2"
              >
                <Image
                  source={require("../../../assets/zapzone-assests/icon/notification-bell.png")}
                  style={{ width: 16, height: 16 }}
                  contentFit="contain"
                  tintColor="#FFFFFF"
                />
                <Text className="text-white text-xs font-semibold">
                  {unreadNotificationsCount > 99
                    ? "99+"
                    : unreadNotificationsCount}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push("/settings/settings")}
              className="bg-white/20 backdrop-blur-sm p-2 rounded-full"
            >
              <Image
                source={require("../../../assets/zapzone-assests/icon/settings.png")}
                style={{ width: 20, height: 20 }}
                contentFit="contain"
                tintColor="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>
      </View>

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
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Calendar
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage and track all your bookings
            </Text>
          </View>

          {/* View-mode filter */}
          <View className="flex-row bg-white dark:bg-neutral-900 rounded-xl p-1.5 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => {
              const active = viewMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setViewMode(mode)}
                  className={`flex-1 py-2.5 rounded-lg items-center ${
                    active ? "bg-[#0644C7]" : ""
                  }`}
                >
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
              <Text className="text-lg text-gray-600 dark:text-gray-300">
                ‹
              </Text>
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center mx-2">
              {headerLabel}
            </Text>
            <Pressable
              onPress={() => step(1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
            >
              <Text className="text-lg text-gray-600 dark:text-gray-300">
                ›
              </Text>
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
              <CalendarSkeleton />
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

                                {shown.slice(0, 2).map((s) => (
                                  <View
                                    key={s}
                                    className="flex-row items-center gap-1 mb-0.5"
                                  >
                                    <View
                                      className={`w-1.5 h-1.5 rounded-full ${statusStyle(s).dot}`}
                                    />
                                    <Text
                                      className={`text-[10px] font-medium ${statusStyle(s).text}`}
                                      numberOfLines={1}
                                    >
                                      {group?.counts[s]}
                                    </Text>
                                  </View>
                                ))}
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
                <Text className="text-gray-700 dark:text-gray-200 font-semibold">
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
                  <View className="w-16 h-16 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-3">
                    <Text className="text-2xl">📅</Text>
                  </View>
                  <Text className="text-gray-700 dark:text-gray-200 font-semibold">
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
