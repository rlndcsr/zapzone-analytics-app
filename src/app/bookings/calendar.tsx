import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingDetailSheet } from "../../components/ui/BookingDetailSheet";
import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  CalendarDaySkeleton,
  CalendarSkeleton,
  CalendarWeekSkeleton,
} from "../../components/ui/skeleton/CalendarSkeleton";
import { packageColor } from "../../lib/calendar/packageColors";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { getCurrentUser } from "../../lib/session";
import type { CalendarBooking } from "../../services/bookingsService";

const PRIMARY = "#0644C7";

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

const STATUS_COLOR: Record<string, string> = {
  confirmed: "#22C55E",
  pending: "#F59E0B",
  cancelled: "#EF4444",
  "checked-in": "#6366F1",
  completed: "#0644C7",
};
const statusColor = (status: string) => STATUS_COLOR[status] ?? "#F59E0B";
const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

type DayGroup = { bookings: CalendarBooking[] };

/**
 * Booking card used in the week / day agendas and the day bottom sheet. Colored
 * by package (left accent + package chip) to match the web calendar, with a
 * status indicator. Tapping opens the shared BookingDetailSheet.
 */
const BookingCard = ({
  booking,
  onPress,
}: {
  booking: CalendarBooking;
  onPress: () => void;
}) => {
  const pkg = packageColor(booking.packageName);
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl mb-2.5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 active:opacity-80 overflow-hidden flex-row"
    >
      {/* Package color accent (pastel bg, matching the legend + admin) */}
      <View style={{ width: 5, backgroundColor: pkg.bg }} />
      <View className="flex-1 p-4">
        {/* Time + status */}
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-1.5">
            <Feather name="clock" size={14} color="#9ca3af" />
            <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {formatTime(booking.time)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View
              style={{ backgroundColor: statusColor(booking.status) }}
              className="w-2 h-2 rounded-full"
            />
            <Text
              className="text-xs font-semibold"
              style={{ color: statusColor(booking.status) }}
            >
              {capitalize(booking.status)}
            </Text>
          </View>
        </View>

        {/* Customer + amount */}
        <View className="flex-row items-center justify-between">
          <Text
            className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2"
            numberOfLines={1}
          >
            {booking.customerName}
          </Text>
          <Text className="text-base font-bold text-[#0644C7]">
            {formatMoney(booking.totalAmount)}
          </Text>
        </View>

        {/* Package chip */}
        <View className="flex-row items-center gap-2 mt-1.5">
          <View
            style={{ backgroundColor: pkg.bg }}
            className="px-2 py-0.5 rounded-full flex-shrink"
          >
            <Text
              style={{ color: pkg.text }}
              className="text-xs font-semibold"
              numberOfLines={1}
            >
              {booking.packageName}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Feather name="users" size={13} color="#9ca3af" />
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {booking.participants}
            </Text>
          </View>
        </View>

        {/* Reference + location */}
        <View className="flex-row items-center gap-3 mt-1.5">
          {!!booking.referenceNumber && (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              #{booking.referenceNumber}
            </Text>
          )}
          {!!booking.locationName && (
            <View className="flex-row items-center gap-1 flex-1">
              <Feather name="map-pin" size={12} color="#9ca3af" />
              <Text
                className="text-xs text-gray-400 dark:text-gray-500 flex-1"
                numberOfLines={1}
              >
                {booking.locationName}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const EmptyDay = ({ label }: { label: string }) => (
  <View className="bg-white dark:bg-neutral-900 rounded-2xl p-6 items-center border border-gray-100 dark:border-neutral-800">
    <Text className="text-sm text-gray-400 dark:text-gray-500">{label}</Text>
  </View>
);

const BookingCalendar = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";

  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(today);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters (mirror the web CalendarView filter panel).
  const [showFilters, setShowFilters] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);

  // Visible window depends on the active view mode.
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

  const { bookings, allBookings, loading, error, refetch } = useCalendarBookings(
    { startDate, endDate },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Location options — company admin only. Derived from the full cached list
  // (not just the visible window) so the option set is stable across months,
  // matching the Manage Bookings screen's client-side location filter.
  const locationOptions = useMemo(() => {
    if (!isCompanyAdmin) return [];
    const names = new Set(
      allBookings.map((b) => b.locationName).filter(Boolean),
    );
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allBookings, isCompanyAdmin]);

  // Apply the same filter pipeline as the web (location → search → packages),
  // over the window's bookings. Location filtering is client-side by name, like
  // Manage Bookings.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (isCompanyAdmin && locationFilter !== "all" && b.locationName !== locationFilter)
        return false;
      if (
        selectedPackages.length > 0 &&
        !selectedPackages.includes(b.packageName)
      )
        return false;
      if (term) {
        const haystack =
          `${b.customerName} ${b.packageName} ${b.referenceNumber ?? ""} ${b.locationName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [bookings, search, selectedPackages, locationFilter, isCompanyAdmin]);

  // Unique packages present in the current view — powers the package filter and
  // the color legend (matches the web, which derives these from the view set).
  const viewPackages = useMemo(() => {
    const names = new Set(bookings.map((b) => b.packageName).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [bookings]);

  // Group the filtered bookings by day, each day sorted by time.
  const byDate = useMemo(() => {
    const map: Record<string, DayGroup> = {};
    for (const b of filtered) {
      (map[b.date] ?? (map[b.date] = { bookings: [] })).bookings.push(b);
    }
    for (const key of Object.keys(map)) {
      map[key].bookings.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    }
    return map;
  }, [filtered]);

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

  // Open a booking's detail. Close any open bottom sheet first — stacking two
  // native Modals crashes on Android (see BookingDetailSheet).
  const openBooking = (id: number) => {
    setSelectedDayKey(null);
    setSelectedBookingId(id);
  };

  const openDay = (key: string) => setSelectedDayKey(key);

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    selectedPackages.length;

  const dayLabel = (key: string) => {
    const d = new Date(`${key}T00:00:00`);
    return `${WEEKDAY_FULL[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  };

  const clearFilters = () => {
    setSearch("");
    setLocationFilter("all");
    setSelectedPackages([]);
  };

  const togglePackage = (name: string) =>
    setSelectedPackages((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );

  const selectedDayBookings = selectedDayKey
    ? (byDate[selectedDayKey]?.bookings ?? [])
    : [];

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
            Booking Calendar
          </Text>
          {/* Packages shortcut (mirrors the web calendar's "Packages" link). */}
          <Pressable
            onPress={() => router.push("/packages/packages" as never)}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Open packages"
          >
            <Feather name="package" size={20} color={headerIcon} />
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
        <View className="px-5 pt-6">
          {/* Intro + count */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Booking Calendar
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {filtered.length} booking{filtered.length === 1 ? "" : "s"} in view
            </Text>
          </View>

          {/* View-mode segmented control + Today */}
          <View className="flex-row bg-white dark:bg-neutral-900 rounded-xl p-1.5 mb-4 shadow-sm border border-gray-100 dark:border-neutral-800">
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
              <Text className="text-sm font-semibold text-[#0644C7]">Today</Text>
            </Pressable>
          </View>

          {/* Filters + legend row */}
          <View className="flex-row gap-3 mb-4">
            <Pressable
              onPress={() => setShowFilters(true)}
              className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800"
            >
              <Feather name="filter" size={16} color={PRIMARY} />
              <Text
                className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1"
                numberOfLines={1}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="bg-[#0644C7] rounded-full min-w-5 h-5 px-1.5 items-center justify-center">
                  <Text className="text-[11px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => setShowLegend(true)}
              className="flex-row items-center gap-2 bg-white dark:bg-neutral-900 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-800"
              accessibilityLabel="Package color legend"
            >
              <Feather name="info" size={16} color={PRIMARY} />
              <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                Legend
              </Text>
            </Pressable>
          </View>

          {/* Period navigation */}
          <View className="flex-row items-center justify-between mb-5">
            <Pressable
              onPress={() => step(-1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
            >
              <Feather name="chevron-left" size={20} color="#6b7280" />
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white flex-1 text-center mx-2">
              {headerLabel}
            </Text>
            <Pressable
              onPress={() => step(1)}
              className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 items-center justify-center shadow-sm"
            >
              <Feather name="chevron-right" size={20} color="#6b7280" />
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
                      const dayBookings = group?.bookings ?? [];
                      const hasBookings = dayBookings.length > 0;
                      const isToday = cell.key === todayKey;

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
                            row < cells.length / 7 - 1
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

                              {/* Up to 3 package-colored dots + overflow */}
                              <View className="flex-row flex-wrap gap-1">
                                {dayBookings.slice(0, 3).map((b) => (
                                  <View
                                    key={b.id}
                                    style={{
                                      backgroundColor: packageColor(b.packageName)
                                        .bg,
                                    }}
                                    className="w-2 h-2 rounded-full"
                                  />
                                ))}
                              </View>
                              {dayBookings.length > 3 && (
                                <Text className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                  +{dayBookings.length - 3} more
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
                    <EmptyDay label="No bookings for this day" />
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
                      {byDate[startDate].bookings.length} booking
                      {byDate[startDate].bookings.length === 1 ? "" : "s"}
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
                <Feather name="calendar" size={32} color="#9ca3af" />
                <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                  No bookings
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                  There are no bookings on this day.
                </Text>
              </View>
            ))}

          {/* Empty month */}
          {!loading && !error && viewMode === "month" && filtered.length === 0 && (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 mt-4 items-center border border-gray-100 dark:border-neutral-800">
              <Feather name="calendar" size={32} color="#9ca3af" />
              <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
                No bookings
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                {activeFilterCount > 0
                  ? "No bookings match your filters."
                  : `There are no bookings in ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}.`}
              </Text>
              {activeFilterCount > 0 && (
                <Pressable
                  onPress={clearFilters}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#0644C7]"
                >
                  <Text className="text-sm font-semibold text-white">
                    Clear Filters
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Filters sheet */}
      <BottomSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filter Bookings"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          {/* Search */}
          <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mt-2 mb-2">
            Search
          </Text>
          <View className="flex-row items-center gap-2 bg-gray-50 dark:bg-neutral-800 px-4 py-3 rounded-xl border border-gray-100 dark:border-neutral-700">
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Customer, package, reference..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-sm text-gray-900 dark:text-white"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          {/* Location (company admin only) */}
          {isCompanyAdmin && locationOptions.length > 0 && (
            <>
              <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mt-5 mb-2">
                Location
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {["all", ...locationOptions].map((name) => {
                  const active =
                    locationFilter === name || (name === "all" && locationFilter === "all");
                  return (
                    <Pressable
                      key={name}
                      onPress={() => setLocationFilter(name)}
                      className={`px-3 py-2 rounded-full border ${
                        active
                          ? "bg-[#0644C7] border-[#0644C7]"
                          : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          active ? "text-white" : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {name === "all" ? "All Locations" : name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Packages */}
          <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mt-5 mb-2">
            Packages
          </Text>
          {viewPackages.length === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 italic">
              No packages in current view
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {viewPackages.map((name) => {
                const active = selectedPackages.includes(name);
                const pkg = packageColor(name);
                return (
                  <Pressable
                    key={name}
                    onPress={() => togglePackage(name)}
                    style={active ? { backgroundColor: pkg.text } : undefined}
                    className={`px-3 py-2 rounded-full border ${
                      active
                        ? "border-transparent"
                        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        active ? "text-white" : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View className="flex-row gap-3 mt-6">
            <Pressable
              onPress={clearFilters}
              className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Clear All
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowFilters(false)}
              className="flex-1 py-3 rounded-xl bg-[#0644C7] items-center"
            >
              <Text className="text-sm font-semibold text-white">Done</Text>
            </Pressable>
          </View>
          <View style={{ height: 12 }} />
        </ScrollView>
      </BottomSheet>

      {/* Package color legend */}
      <BottomSheet
        visible={showLegend}
        onClose={() => setShowLegend(false)}
        title="Package Colors"
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          {viewPackages.length === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500 italic py-4">
              No packages in current view.
            </Text>
          ) : (
            viewPackages.map((name) => {
              const pkg = packageColor(name);
              return (
                <View key={name} className="flex-row items-center gap-3 py-2">
                  {/* Swatch uses the package's light `bg` color, matching the web
                      admin legend (and the event package chips). */}
                  <View
                    style={{ backgroundColor: pkg.bg }}
                    className="w-5 h-5 rounded-md"
                  />
                  <Text className="text-sm text-gray-800 dark:text-gray-100 flex-1" numberOfLines={1}>
                    {name}
                  </Text>
                </View>
              );
            })
          )}
          <View style={{ height: 12 }} />
        </ScrollView>
      </BottomSheet>

      {/* Day bookings (month cell tap) */}
      <BottomSheet
        visible={selectedDayKey !== null}
        onClose={() => setSelectedDayKey(null)}
        title={selectedDayKey ? dayLabel(selectedDayKey) : "Bookings"}
      >
        <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
          {selectedDayBookings.length === 0 ? (
            <View className="py-10 items-center">
              <Feather name="calendar" size={28} color="#9ca3af" />
              <Text className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                No bookings for this day
              </Text>
            </View>
          ) : (
            selectedDayBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onPress={() => openBooking(b.id)}
              />
            ))
          )}
          <View style={{ height: 12 }} />
        </ScrollView>
      </BottomSheet>

      {/* Full booking detail (shared with Manage Bookings / tab calendar) */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default BookingCalendar;
