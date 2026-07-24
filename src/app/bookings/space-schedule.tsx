import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { BottomSheet } from "../../components/ui/BottomSheet";
import { CalendarDaySkeleton } from "../../components/ui/skeleton/CalendarSkeleton";
import { packageColor } from "../../lib/calendar/packageColors";
import { useSpaceSchedule } from "../../lib/hooks/useSpaceSchedule";
import type {
  ScheduleBooking,
  Space,
  SpaceBreak,
} from "../../services/bookingsService";

const PRIMARY = "#0644C7";

const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_FULL = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const PICKER_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const STATUS_COLOR: Record<string, string> = {
  confirmed: "#22C55E",
  pending: "#F59E0B",
  cancelled: "#EF4444",
  "checked-in": "#6366F1",
  completed: "#0644C7",
};
const statusColor = (status: string) => STATUS_COLOR[status] ?? "#F59E0B";

const PAYMENT_TONE: Record<string, { bg: string; text: string }> = {
  paid: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  partial: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
};
const paymentTone = (s: string) =>
  PAYMENT_TONE[s] ?? { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" };

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const formatMoney = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** "HH:MM" → minutes since midnight (blank → 0). */
function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutes since midnight → "h:mm AM/PM". */
function formatMinutes(total: number): string {
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const meridian = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return `${h}:${pad2(m)} ${meridian}`;
}

/** Natural alphanumeric sort of space names (Room 2 before Room 10). */
function naturalSort(a: string, b: string): number {
  const ax = a.match(/(\d+|\D+)/g) || [];
  const bx = b.match(/(\d+|\D+)/g) || [];
  const n = Math.max(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const ca = ax[i] ?? "";
    const cb = bx[i] ?? "";
    if (/^\d+$/.test(ca) && /^\d+$/.test(cb)) {
      const d = parseInt(ca, 10) - parseInt(cb, 10);
      if (d !== 0) return d;
    } else {
      const c = ca.toLowerCase().localeCompare(cb.toLowerCase());
      if (c !== 0) return c;
    }
  }
  return 0;
}

// Only these statuses occupy a space on the schedule (matches the web).
const SCHEDULE_STATUSES = new Set(["confirmed", "checked-in", "pending"]);

// Grid geometry — one row per 15-minute slot, one column per space. Blocks are
// absolutely positioned over the slot grid to emulate the web table's rowSpan.
const SLOT_MIN = 15;
const ROW_H = 66;
const COL_W = 156;
const TIME_W = 64;

type ScheduleItem =
  | { kind: "booking"; start: number; booking: ScheduleBooking }
  | { kind: "break"; start: number; brk: SpaceBreak };

type GridBlock =
  | { kind: "booking"; startIdx: number; span: number; booking: ScheduleBooking }
  | { kind: "break"; startIdx: number; span: number; brk: SpaceBreak };

type GridColumn = { space: Space; blocks: GridBlock[] };
type GridModel = { slots: number[]; columns: GridColumn[] };

type ViewMode = "grid" | "list";

/* ------------------------------------------------------------------ */
/* List (card) view                                                    */
/* ------------------------------------------------------------------ */

const BookingCard = ({
  booking,
  onPress,
}: {
  booking: ScheduleBooking;
  onPress: () => void;
}) => {
  const pkg = packageColor(booking.packageName);
  const start = timeToMinutes(booking.time);
  const pay = paymentTone(booking.paymentStatus);
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: pkg.bg }}
      className="rounded-2xl mb-2.5 p-3.5 active:opacity-80"
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <View
          style={{ backgroundColor: statusColor(booking.status) }}
          className="px-2 py-0.5 rounded-full"
        >
          <Text className="text-[10px] font-bold uppercase text-white">
            {booking.status}
          </Text>
        </View>
        {!!booking.referenceNumber && (
          <Text style={{ color: pkg.text }} className="text-[10px] font-medium opacity-70">
            #{booking.referenceNumber.slice(-6)}
          </Text>
        )}
      </View>

      <Text style={{ color: pkg.text }} className="text-sm font-bold">
        {formatMinutes(start)} – {formatMinutes(start + booking.durationMinutes)}
      </Text>
      <Text style={{ color: pkg.text }} className="text-sm font-semibold mt-0.5" numberOfLines={1}>
        {booking.customerName}
      </Text>
      <Text style={{ color: pkg.text }} className="text-xs opacity-80 mt-0.5" numberOfLines={1}>
        {booking.packageName}
      </Text>

      <View className="flex-row items-center justify-between mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/10">
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Feather name="users" size={12} color={pkg.text} />
            <Text style={{ color: pkg.text }} className="text-xs font-medium">
              {booking.participants}
            </Text>
          </View>
          <Text style={{ color: pkg.text }} className="text-xs font-bold">
            {formatMoney(booking.totalAmount)}
          </Text>
        </View>
        <View className={`px-1.5 py-0.5 rounded ${pay.bg}`}>
          <Text className={`text-[10px] font-medium ${pay.text}`}>
            {capitalize(booking.paymentStatus)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const BreakCard = ({ brk }: { brk: SpaceBreak }) => (
  <View className="rounded-2xl mb-2.5 p-3.5 bg-gray-100 dark:bg-neutral-800 border border-dashed border-gray-300 dark:border-neutral-600 flex-row items-center gap-2.5">
    <Feather name="coffee" size={16} color="#6b7280" />
    <View>
      <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
        Break Time
      </Text>
      <Text className="text-xs text-gray-500 dark:text-gray-400">
        {formatMinutes(timeToMinutes(brk.startTime))} –{" "}
        {formatMinutes(timeToMinutes(brk.endTime))}
      </Text>
    </View>
  </View>
);

const SpaceSection = ({
  space,
  items,
  onBookingPress,
}: {
  space: Space;
  items: ScheduleItem[];
  onBookingPress: (id: number) => void;
}) => (
  <View className="mb-5">
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2" numberOfLines={1}>
        {space.name}
      </Text>
      {space.capacity != null && (
        <View className="flex-row items-center gap-1 bg-gray-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full">
          <Feather name="users" size={12} color="#6b7280" />
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Max {space.capacity}
          </Text>
        </View>
      )}
    </View>
    {items.length === 0 ? (
      <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 items-center border border-gray-100 dark:border-neutral-800">
        <Text className="text-sm text-gray-400 dark:text-gray-500">No bookings</Text>
      </View>
    ) : (
      items.map((item) =>
        item.kind === "booking" ? (
          <BookingCard
            key={`b-${item.booking.id}`}
            booking={item.booking}
            onPress={() => onBookingPress(item.booking.id)}
          />
        ) : (
          <BreakCard key={`k-${space.id}-${item.brk.startTime}`} brk={item.brk} />
        ),
      )
    )}
  </View>
);

/* ------------------------------------------------------------------ */
/* Grid (timeline) view                                                */
/* ------------------------------------------------------------------ */

const GridBookingBlock = ({
  block,
  onPress,
}: {
  block: Extract<GridBlock, { kind: "booking" }>;
  onPress: () => void;
}) => {
  const b = block.booking;
  const pkg = packageColor(b.packageName);
  const start = timeToMinutes(b.time);
  const pay = paymentTone(b.paymentStatus);
  const tall = block.span >= 4;
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        top: block.startIdx * ROW_H + 3,
        height: block.span * ROW_H - 6,
        left: 3,
        right: 3,
        backgroundColor: pkg.bg,
      }}
      className="rounded-xl overflow-hidden p-2 active:opacity-80"
    >
      <View className="flex-row items-center justify-between mb-1">
        <View
          style={{ backgroundColor: statusColor(b.status) }}
          className="px-1.5 py-0.5 rounded-full"
        >
          <Text className="text-[9px] font-bold uppercase text-white">{b.status}</Text>
        </View>
        {!!b.referenceNumber && (
          <Text style={{ color: pkg.text }} className="text-[9px] font-medium opacity-70">
            #{b.referenceNumber.slice(-6)}
          </Text>
        )}
      </View>

      <Text style={{ color: pkg.text }} className="text-[11px] font-bold" numberOfLines={1}>
        {formatMinutes(start)} – {formatMinutes(start + b.durationMinutes)}
      </Text>
      <Text style={{ color: pkg.text }} className="text-[11px] font-semibold" numberOfLines={1}>
        {b.customerName}
      </Text>
      <Text style={{ color: pkg.text }} className="text-[10px] opacity-80" numberOfLines={1}>
        {b.packageName}
      </Text>
      {tall && (
        <View className="flex-row items-center gap-1 mt-0.5">
          <Feather name="users" size={10} color={pkg.text} />
          <Text style={{ color: pkg.text }} className="text-[10px] opacity-80">
            {b.participants} {b.participants === 1 ? "guest" : "guests"}
          </Text>
        </View>
      )}

      <View className="flex-1" />

      <View className="flex-row items-center justify-between">
        <Text style={{ color: pkg.text }} className="text-[10px] font-bold">
          {formatMoney(b.totalAmount)}
        </Text>
        <View className={`px-1 py-0.5 rounded ${pay.bg}`}>
          <Text className={`text-[9px] font-medium ${pay.text}`}>
            {b.paymentStatus}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const GridBreakBlock = ({
  block,
}: {
  block: Extract<GridBlock, { kind: "break" }>;
}) => (
  <View
    style={{
      position: "absolute",
      top: block.startIdx * ROW_H + 3,
      height: block.span * ROW_H - 6,
      left: 3,
      right: 3,
    }}
    className="rounded-xl bg-gray-100 dark:bg-neutral-800 border border-dashed border-gray-300 dark:border-neutral-600 items-center justify-center p-1"
  >
    <Feather name="coffee" size={16} color="#6b7280" />
    <Text className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 mt-1">
      Break
    </Text>
    <Text className="text-[9px] text-gray-500 dark:text-gray-400" numberOfLines={1}>
      {formatMinutes(timeToMinutes(block.brk.startTime))} –{" "}
      {formatMinutes(timeToMinutes(block.brk.endTime))}
    </Text>
  </View>
);

const ScheduleGrid = ({
  model,
  onBookingPress,
  refreshControl,
  bottomInset,
}: {
  model: GridModel;
  onBookingPress: (id: number) => void;
  refreshControl: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  bottomInset: number;
}) => {
  const headerScrollRef = useRef<ScrollView>(null);
  const { slots, columns } = model;
  const bodyHeight = slots.length * ROW_H;

  return (
    <View className="flex-1">
      {/* Header row — sticky at top; scrolls horizontally in sync with body */}
      <View className="flex-row border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900">
        <View
          style={{ width: TIME_W }}
          className="px-2 py-3 border-r border-gray-200 dark:border-neutral-800 justify-center"
        >
          <View className="flex-row items-center gap-1">
            <Feather name="clock" size={12} color="#6b7280" />
            <Text className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Time
            </Text>
          </View>
        </View>
        <ScrollView
          ref={headerScrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          className="flex-1"
        >
          <View className="flex-row">
            {columns.map(({ space }) => (
              <View
                key={space.id}
                style={{ width: COL_W }}
                className="px-2 py-2 border-r border-gray-200 dark:border-neutral-800 items-center justify-center"
              >
                <Text
                  className="text-[13px] font-semibold text-gray-700 dark:text-gray-200"
                  numberOfLines={1}
                >
                  {space.name}
                </Text>
                {space.capacity != null && (
                  <View className="flex-row items-center gap-1 mt-0.5">
                    <Feather name="users" size={10} color="#9ca3af" />
                    <Text className="text-[10px] text-gray-400 dark:text-gray-500">
                      Max {space.capacity}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Body — vertical scroll; time column fixed, space columns scroll horizontally */}
      <ScrollView
        refreshControl={refreshControl}
        showsVerticalScrollIndicator
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View className="flex-row">
          {/* Fixed time column */}
          <View style={{ width: TIME_W }}>
            {slots.map((m) => (
              <View
                key={m}
                style={{ height: ROW_H }}
                className="px-2 pt-1 border-r border-b border-gray-100 dark:border-neutral-800"
              >
                <Text className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                  {formatMinutes(m)}
                </Text>
              </View>
            ))}
          </View>

          {/* Scrollable space columns */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            scrollEventThrottle={16}
            onScroll={(e) =>
              headerScrollRef.current?.scrollTo({
                x: e.nativeEvent.contentOffset.x,
                animated: false,
              })
            }
            className="flex-1"
          >
            <View className="flex-row">
              {columns.map(({ space, blocks }) => (
                <View key={space.id} style={{ width: COL_W, height: bodyHeight }}>
                  {/* Background slot lines */}
                  {slots.map((m) => (
                    <View
                      key={m}
                      style={{ height: ROW_H }}
                      className="border-r border-b border-gray-100 dark:border-neutral-800"
                    />
                  ))}
                  {/* Booking / break blocks */}
                  {blocks.map((block) =>
                    block.kind === "booking" ? (
                      <GridBookingBlock
                        key={`b-${block.booking.id}`}
                        block={block}
                        onPress={() => onBookingPress(block.booking.id)}
                      />
                    ) : (
                      <GridBreakBlock
                        key={`k-${space.id}-${block.startIdx}`}
                        block={block}
                      />
                    ),
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* View toggle                                                         */
/* ------------------------------------------------------------------ */

const TOGGLE_ACTIVE_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 2,
  elevation: 1,
} as const;

const GridListToggle = ({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) => (
  <View className="flex-row items-center bg-gray-100 dark:bg-neutral-800 rounded-xl p-1">
    {(["grid", "list"] as const).map((m) => {
      const active = mode === m;
      return (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={m === "grid" ? "Grid view" : "List view"}
          className={`px-3 py-1.5 rounded-lg ${active ? "bg-white dark:bg-neutral-700" : ""}`}
          style={active ? TOGGLE_ACTIVE_SHADOW : undefined}
        >
          <Feather
            name={m === "grid" ? "grid" : "list"}
            size={16}
            color={active ? PRIMARY : "#9CA3AF"}
          />
        </Pressable>
      );
    })}
  </View>
);

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

const SpaceScheduleScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date());
  const [showLegend, setShowLegend] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const selectedKey = dateKey(selectedDate);
  const todayKey = dateKey(new Date());
  const isToday = selectedKey === todayKey;
  const currentDayName = WEEKDAY_NAMES[selectedDate.getDay()];

  const { spaces, bookings, loading, error, refetch } = useSpaceSchedule(selectedKey);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Bookings that occupy a space (confirmed / checked-in / pending), grouped by
  // room — matches the web's bookingsByRoom.
  const bookingsByRoom = useMemo(() => {
    const map = new Map<number, ScheduleBooking[]>();
    for (const b of bookings) {
      if (b.roomId != null && SCHEDULE_STATUSES.has(b.status)) {
        (map.get(b.roomId) ?? map.set(b.roomId, []).get(b.roomId)!).push(b);
      }
    }
    return map;
  }, [bookings]);

  const sortedSpaces = useMemo(
    () => [...spaces].sort((a, b) => naturalSort(a.name, b.name)),
    [spaces],
  );

  // Per-space, time-ordered list of bookings + today's break windows.
  const sections = useMemo(() => {
    return sortedSpaces.map((space) => {
      const items: ScheduleItem[] = [];
      for (const b of bookingsByRoom.get(space.id) ?? []) {
        items.push({ kind: "booking", start: timeToMinutes(b.time), booking: b });
      }
      for (const brk of space.breaks) {
        if (brk.days.includes(currentDayName)) {
          items.push({ kind: "break", start: timeToMinutes(brk.startTime), brk });
        }
      }
      items.sort((a, b) => a.start - b.start);
      return { space, items };
    });
  }, [sortedSpaces, bookingsByRoom, currentDayName]);

  // Timeline grid model: a 15-minute slot range spanning the earliest start to
  // the latest end across every space, plus each space's blocks placed on it.
  const gridModel = useMemo<GridModel | null>(() => {
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const { items } of sections) {
      for (const it of items) {
        const s = it.start;
        const e =
          it.kind === "booking"
            ? s + it.booking.durationMinutes
            : timeToMinutes(it.brk.endTime);
        if (s < minStart) minStart = s;
        if (e > maxEnd) maxEnd = e;
      }
    }
    if (!isFinite(minStart) || !isFinite(maxEnd) || maxEnd <= minStart) {
      return null;
    }
    const rangeStart = Math.floor(minStart / SLOT_MIN) * SLOT_MIN;
    const rangeEnd = Math.ceil(maxEnd / SLOT_MIN) * SLOT_MIN;
    const count = Math.max(1, Math.round((rangeEnd - rangeStart) / SLOT_MIN));
    const slots = Array.from({ length: count }, (_, i) => rangeStart + i * SLOT_MIN);

    const columns: GridColumn[] = sections.map(({ space, items }) => {
      const blocks: GridBlock[] = items.map((it) => {
        const startIdx = Math.max(
          0,
          Math.min(count - 1, Math.round((it.start - rangeStart) / SLOT_MIN)),
        );
        const durMin =
          it.kind === "booking"
            ? it.booking.durationMinutes
            : timeToMinutes(it.brk.endTime) - timeToMinutes(it.brk.startTime);
        let span = Math.max(1, Math.round(durMin / SLOT_MIN));
        if (startIdx + span > count) span = count - startIdx;
        return it.kind === "booking"
          ? { kind: "booking", startIdx, span, booking: it.booking }
          : { kind: "break", startIdx, span, brk: it.brk };
      });
      return { space, blocks };
    });

    return { slots, columns };
  }, [sections]);

  const stepDay = (dir: number) => {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + dir);
    setSelectedDate(next);
  };

  const goToToday = () => setSelectedDate(new Date());

  const openPicker = () => {
    setPickerMonth(new Date(selectedDate));
    setShowPicker(true);
  };

  const pickerDays = useMemo(() => {
    const year = pickerMonth.getFullYear();
    const month = pickerMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    return out;
  }, [pickerMonth]);

  const stepPickerMonth = (dir: number) => {
    const next = new Date(pickerMonth);
    next.setMonth(pickerMonth.getMonth() + dir);
    setPickerMonth(next);
  };

  const dateLabel = `${WEEKDAY_FULL[selectedDate.getDay()]}, ${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={PRIMARY}
      colors={[PRIMARY]}
      progressBackgroundColor="#FFFFFF"
    />
  );

  const noSchedule = !loading && !error && (bookings.length === 0 || !gridModel);

  const renderEmpty = () => (
    <View className="px-5 pt-6">
      {bookings.length === 0 ? (
        <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
          <View className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 items-center justify-center mb-3">
            <Feather name="calendar" size={28} color={PRIMARY} />
          </View>
          <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
            No Bookings Found
          </Text>
          <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
            There are no bookings scheduled for{" "}
            {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()},{" "}
            {selectedDate.getFullYear()}.
          </Text>
        </View>
      ) : (
        <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
          <Feather name="grid" size={28} color="#9ca3af" />
          <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
            No spaces occupied
          </Text>
          <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
            No confirmed, pending or checked-in bookings for this day.
          </Text>
        </View>
      )}
    </View>
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
            Space Schedule
          </Text>
          <Pressable
            onPress={() => setShowLegend(true)}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Legend"
          >
            <Feather name="info" size={20} color={headerIcon} />
          </Pressable>
        </View>
      </View>

      {/* Controls (fixed) */}
      <View className="bg-white dark:bg-neutral-900 px-5 pt-4 pb-4 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => stepDay(-1)}
            className="w-10 h-10 rounded-full bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 items-center justify-center"
          >
            <Feather name="chevron-left" size={20} color="#6b7280" />
          </Pressable>
          <Pressable
            onPress={openPicker}
            className="flex-1 flex-row items-center justify-center gap-2 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl py-2.5 px-3"
          >
            <Feather name="calendar" size={16} color={PRIMARY} />
            <Text
              className="text-sm font-bold text-gray-900 dark:text-white flex-shrink"
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
            {loading && <ActivityIndicator size="small" color="#9ca3af" />}
          </Pressable>
          <Pressable
            onPress={() => stepDay(1)}
            className="w-10 h-10 rounded-full bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 items-center justify-center"
          >
            <Feather name="chevron-right" size={20} color="#6b7280" />
          </Pressable>
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <Pressable
            onPress={goToToday}
            className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full ${
              isToday ? "bg-[#0644C7]" : "bg-[#0644C7]/10 dark:bg-[#0644C7]/20"
            }`}
          >
            <Feather name="sun" size={14} color={isToday ? "#FFFFFF" : PRIMARY} />
            <Text
              className={`text-sm font-semibold ${
                isToday ? "text-white" : "text-[#0644C7]"
              }`}
            >
              Today
            </Text>
          </Pressable>

          <GridListToggle mode={viewMode} onChange={setViewMode} />
        </View>
      </View>

      {/* Error */}
      {!loading && error && (
        <View className="mx-5 mt-4 bg-red-50 border border-red-100 rounded-2xl p-5">
          <Text className="text-red-600 font-semibold">Something went wrong</Text>
          <Text className="text-red-500 text-sm mt-1">{error}</Text>
        </View>
      )}

      {/* Body */}
      {loading ? (
        <View className="px-5 pt-6">
          <CalendarDaySkeleton />
        </View>
      ) : error ? null : noSchedule ? (
        <ScrollView refreshControl={refreshControl}>{renderEmpty()}</ScrollView>
      ) : viewMode === "grid" && gridModel ? (
        <ScheduleGrid
          model={gridModel}
          onBookingPress={setSelectedBookingId}
          refreshControl={refreshControl}
          bottomInset={insets.bottom + 24}
        />
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={refreshControl}
        >
          <View className="px-5 pt-6">
            {sections.map(({ space, items }) => (
              <SpaceSection
                key={space.id}
                space={space}
                items={items}
                onBookingPress={setSelectedBookingId}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* Month date picker */}
      <BottomSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        title="Select Date"
      >
        <View className="px-5 pb-6">
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              onPress={() => stepPickerMonth(-1)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-neutral-800"
            >
              <Feather name="chevron-left" size={18} color={headerIcon} />
            </Pressable>
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
            </Text>
            <Pressable
              onPress={() => stepPickerMonth(1)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-neutral-800"
            >
              <Feather name="chevron-right" size={18} color={headerIcon} />
            </Pressable>
          </View>

          <View className="flex-row mb-2">
            {PICKER_WEEKDAYS.map((d) => (
              <View key={d} className="flex-1 items-center">
                <Text className="text-xs font-medium text-gray-400 dark:text-gray-500">
                  {d}
                </Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {pickerDays.map((day, i) => {
              if (!day) {
                return <View key={`e-${i}`} style={{ width: `${100 / 7}%` }} className="aspect-square" />;
              }
              const key = dateKey(day);
              const selected = key === selectedKey;
              const dToday = key === todayKey;
              return (
                <View key={key} style={{ width: `${100 / 7}%` }} className="aspect-square p-0.5">
                  <Pressable
                    onPress={() => {
                      setSelectedDate(day);
                      setShowPicker(false);
                    }}
                    className={`flex-1 items-center justify-center rounded-lg ${
                      selected
                        ? "bg-[#0644C7]"
                        : dToday
                          ? "bg-[#0644C7]/10 dark:bg-[#0644C7]/20"
                          : ""
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selected
                          ? "text-white"
                          : dToday
                            ? "text-[#0644C7] font-bold"
                            : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View className="flex-row gap-3 mt-5">
            <Pressable
              onPress={() => {
                goToToday();
                setShowPicker(false);
              }}
              className="flex-1 py-3 rounded-xl bg-[#0644C7] items-center"
            >
              <Text className="text-sm font-semibold text-white">Today</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowPicker(false)}
              className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-neutral-600 items-center"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>

      {/* Legend */}
      <BottomSheet
        visible={showLegend}
        onClose={() => setShowLegend(false)}
        title="Legend"
      >
        <View className="px-5 pb-6">
          <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-3">
            Booking Status
          </Text>
          {["confirmed", "pending", "checked-in", "completed", "cancelled"].map(
            (s) => (
              <View key={s} className="flex-row items-center gap-2.5 py-1.5">
                <View
                  style={{ backgroundColor: statusColor(s) }}
                  className="px-2 py-0.5 rounded-full"
                >
                  <Text className="text-[10px] font-bold uppercase text-white">
                    {s}
                  </Text>
                </View>
              </View>
            ),
          )}

          <View className="h-px bg-gray-100 dark:bg-neutral-800 my-4" />

          <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
            Color Coding
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Each package has its own color.
          </Text>
          <View className="flex-row items-center gap-2.5">
            <View className="w-6 h-6 rounded-md bg-gray-100 dark:bg-neutral-800 border border-dashed border-gray-300 dark:border-neutral-600 items-center justify-center">
              <Feather name="coffee" size={12} color="#6b7280" />
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300">Break Time</Text>
          </View>
          <View style={{ height: 8 }} />
        </View>
      </BottomSheet>

      {/* Booking detail (shared) */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default SpaceScheduleScreen;
