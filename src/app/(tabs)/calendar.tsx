import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { CalendarSkeleton } from "../../components/ui/skeleton/CalendarSkeleton";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { useNotifications } from "../../lib/hooks/useNotifications";
import type { CalendarBooking } from "../../services/bookingsService";

type ViewMode = "month" | "week" | "day";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_ORDER = ["confirmed", "pending", "checked-in", "completed", "cancelled"];

const STATUS_STYLE: Record<
  string,
  { label: string; dot: string; text: string; badge: string; card: string }
> = {
  confirmed: {
    label: "confirmed",
    dot: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
    badge: "bg-green-100 text-green-700",
    card: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900",
  },
  pending: {
    label: "pending",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700",
    card: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900",
  },
  cancelled: {
    label: "cancelled",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700",
    card: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900",
  },
  "checked-in": {
    label: "checked-in",
    dot: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
    card: "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-900",
  },
  completed: {
    label: "completed",
    dot: "bg-[#0644C7]",
    text: "text-[#0644C7]",
    badge: "bg-blue-100 text-blue-700",
    card: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900",
  },
};

const statusStyle = (status: string) => STATUS_STYLE[status] ?? STATUS_STYLE.pending;

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
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      className={`border rounded-2xl p-4 mb-3 ${style.card}`}
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-sm font-medium text-gray-600 dark:text-gray-300">
          🕐 {formatTime(booking.time)}
        </Text>
        <View className={`px-2.5 py-0.5 rounded-full ${style.badge.split(" ")[0]}`}>
          <Text className={`text-xs font-semibold ${style.badge.split(" ")[1]}`}>
            {style.label}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white uppercase flex-1 mr-2"
          numberOfLines={2}
        >
          {booking.packageName}
        </Text>
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          {formatMoney(booking.totalAmount)}
        </Text>
      </View>

      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
        {booking.customerName}
      </Text>

      <View className="flex-row items-center gap-4 mt-2">
        {!!booking.locationName && (
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            📍 {booking.locationName}
          </Text>
        )}
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          👥 {booking.participants} participants
        </Text>
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
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
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
      map[key].bookings.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
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
    <View className="flex-1 bg-white dark:bg-black">
      <View className="bg-[#0644C7] h-[37px] w-full mb-2" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0644C7"
            colors={["#0644C7"]}
          />
        }
      >
        <View className="px-4">
          {/* App-shell header: logo + notification + settings */}
          <View className="flex-row items-center justify-between mb-5">
            <Pressable className="mt-2">
              <Image
                source={require("../../../assets/zapzone-assests/Zap-Zone.png")}
                style={{ width: 60, height: 24 }}
                contentFit="contain"
              />
            </Pressable>

            <View className="flex-row items-center gap-3">
              {unreadNotificationsCount > 0 && (
                <Pressable
                  onPress={() => router.push("/notification/notification")}
                  className="bg-gray-200 dark:bg-neutral-800 rounded-full px-4 py-2 flex-row items-center gap-2"
                >
                  <Image
                    source={require("../../../assets/zapzone-assests/icon/notification-bell.png")}
                    style={{ width: 15, height: 15 }}
                    contentFit="contain"
                  />
                  <Text className="text-gray-800 dark:text-gray-100 text-md">
                    {unreadNotificationsCount > 99 ? "99" : unreadNotificationsCount}
                  </Text>
                </Pressable>
              )}

              <Pressable onPress={() => router.push("/settings/settings")}>
                <Image
                  source={require("../../../assets/zapzone-assests/icon/settings.png")}
                  style={{ width: 24, height: 24 }}
                  contentFit="contain"
                />
              </Pressable>
            </View>
          </View>

          {/* Title */}
          <View className="mb-4">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              Calendar
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Bookings overview by day
            </Text>
          </View>

          {/* View-mode filter: Month / Week / Day / Today */}
          <View className="flex-row bg-gray-100 dark:bg-neutral-800 rounded-xl p-1 mb-4">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => {
              const active = viewMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setViewMode(mode)}
                  className={`flex-1 py-2 rounded-lg items-center ${
                    active ? "bg-white dark:bg-neutral-700" : ""
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold capitalize ${
                      active
                        ? "text-[#0644C7] dark:text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {mode}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={goToToday}
              className="flex-1 py-2 rounded-lg items-center"
            >
              <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                Today
              </Text>
            </Pressable>
          </View>

          {/* Period navigation */}
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              onPress={() => step(-1)}
              className="w-10 h-10 rounded-full border border-gray-200 dark:border-neutral-700 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
            >
              <Text className="text-lg text-gray-600 dark:text-gray-300">‹</Text>
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center mx-2">
              {headerLabel}
            </Text>
            <Pressable
              onPress={() => step(1)}
              className="w-10 h-10 rounded-full border border-gray-200 dark:border-neutral-700 items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
            >
              <Text className="text-lg text-gray-600 dark:text-gray-300">›</Text>
            </Pressable>
          </View>

          {/* Error */}
          {!loading && error && (
            <View className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <Text className="text-red-700 font-semibold">Error</Text>
              <Text className="text-red-600 text-sm">{error}</Text>
            </View>
          )}

          {/* ---- MONTH ---- */}
          {viewMode === "month" &&
            (loading ? (
              <CalendarSkeleton />
            ) : (
              <View className="rounded-2xl overflow-hidden border border-gray-200 dark:border-neutral-700">
                <View className="flex-row bg-gray-50 dark:bg-neutral-900">
                  {WEEKDAYS.map((d, i) => (
                    <View key={i} className="flex-1 items-center py-2.5">
                      <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500">
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
                        ? STATUS_ORDER.filter((s) => (group.counts[s] ?? 0) > 0)
                        : [];

                      return (
                        <Pressable
                          key={cell.key ?? `pad-${row}-${col}`}
                          disabled={!hasBookings}
                          onPress={() => hasBookings && cell.key && openDay(cell.key)}
                          style={{ minHeight: 78 }}
                          className={`flex-1 border border-gray-100 dark:border-neutral-800 p-1.5 ${
                            cell.key === null
                              ? "bg-gray-50 dark:bg-neutral-900"
                              : hasBookings
                                ? "active:bg-blue-50 dark:active:bg-blue-900"
                                : ""
                          }`}
                        >
                          {cell.key !== null && (
                            <>
                              <View
                                className={`w-7 h-7 rounded-full items-center justify-center mb-0.5 ${
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
                                <View key={s} className="flex-row items-center gap-0.5">
                                  <View
                                    className={`w-1.5 h-1.5 rounded-full ${statusStyle(s).dot}`}
                                  />
                                  <Text
                                    className={`text-[10px] ${statusStyle(s).text}`}
                                    numberOfLines={1}
                                  >
                                    {group?.counts[s]} {statusStyle(s).label}
                                  </Text>
                                </View>
                              ))}
                              {hasBookings && (
                                <Text className="text-[10px] font-medium text-[#0644C7] mt-0.5">
                                  {count} total
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
            ))}

          {/* Week / Day loading */}
          {viewMode !== "month" && loading && (
            <View className="py-16 items-center">
              <ActivityIndicator color="#0644C7" />
            </View>
          )}

          {/* ---- WEEK ---- */}
          {viewMode === "week" &&
            !loading &&
            weekDays.map((d) => {
              const key = dateKey(d);
              const group = byDate[key];
              const isToday = key === todayKey;
              return (
                <View key={key} className="mb-4">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Text
                      className={`text-sm font-bold ${
                        isToday ? "text-[#0644C7]" : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {WEEKDAY_SHORT[d.getDay()]} {d.getDate()}
                    </Text>
                    {!!group && (
                      <Text className="text-xs text-gray-400 dark:text-gray-500">
                        {group.bookings.length} booking
                        {group.bookings.length === 1 ? "" : "s"}
                      </Text>
                    )}
                  </View>
                  {group ? (
                    group.bookings.map((b) => (
                      <BookingCard key={b.id} booking={b} onPress={() => openBooking(b.id)} />
                    ))
                  ) : (
                    <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                      No bookings
                    </Text>
                  )}
                </View>
              );
            })}

          {/* ---- DAY ---- */}
          {viewMode === "day" &&
            !loading &&
            (byDate[startDate]?.bookings.length ? (
              byDate[startDate].bookings.map((b) => (
                <BookingCard key={b.id} booking={b} onPress={() => openBooking(b.id)} />
              ))
            ) : (
              <View className="items-center mt-8">
                <Text className="text-gray-700 dark:text-gray-200 font-semibold">
                  No bookings
                </Text>
                <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-1">
                  There are no bookings on this day.
                </Text>
              </View>
            ))}

          {/* Empty month */}
          {!loading && !error && viewMode === "month" && bookings.length === 0 && (
            <View className="items-center mt-8">
              <Text className="text-gray-700 dark:text-gray-200 font-semibold">
                No bookings
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-1">
                There are no bookings in {MONTH_NAMES[anchor.getMonth()]}{" "}
                {anchor.getFullYear()}.
              </Text>
            </View>
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
