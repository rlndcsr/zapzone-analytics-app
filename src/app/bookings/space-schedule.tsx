import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { CalendarDaySkeleton } from "../../components/ui/skeleton/CalendarSkeleton";
import { packageColor } from "../../lib/calendar/packageColors";
import { venueNow, venueToday } from "../../lib/date/venueTime";
import { useSpaceSchedule } from "../../lib/hooks/useSpaceSchedule";
import { useWeekBookingCounts } from "../../lib/hooks/useWeekBookingCounts";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import {
  buildColumns,
  closureBoundaryMinutes,
  closureLabel,
  computeCategoryOptions,
  computeDaySummary,
  computeSpaceClosures,
  computeTimeWindow,
  DEFAULT_ZOOM_INDEX,
  hourMarks,
  minutesToLabel,
  nowLineTop,
  positionBookingsByColumn,
  timeToMinutes,
  UNCATEGORIZED_LABEL,
  ZOOM_LEVELS,
  type PositionedBooking,
  type ScheduleColumn,
  type SpaceClosure,
  type TimeWindow,
} from "../../lib/bookings/spaceScheduleGrid";
import { getCurrentUser, getToken } from "../../lib/session";
import { normalizeCategory } from "../../lib/venueCategories";
import {
  fetchDayOffsByLocation,
  type DayOff,
} from "../../services/dayOffsService";
import type { ScheduleBooking, SpaceBreak } from "../../services/bookingsService";

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
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PICKER_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "checked-in", label: "Checked-in" },
];

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

// Grid geometry. GUTTER_WIDTH/COLUMN_WIDTH are fixed; row height is continuous
// (pixels-per-minute × zoom), matching the web's timeline rather than mobile's
// old fixed 15-minute-slot grid — arbitrary durations place exactly, and
// overlapping bookings in one room lane out side by side instead of hiding
// under each other.
const GUTTER_WIDTH = 60;
const COLUMN_WIDTH = 168;

type ViewMode = "grid" | "list";

/* ------------------------------------------------------------------ */
/* Saved filters — in-memory for the life of the app run (RN's analogue */
/* of the web's sessionStorage: survives screen navigation, resets on   */
/* a fresh app launch). Web parity: VIEW_STATE_KEY / readViewState.     */
/* ------------------------------------------------------------------ */

type ScheduleViewState = {
  categoryFilter: string;
  statusFilter: string;
  searchInput: string;
  hideEmptySpaces: boolean;
  zoomIndex: number;
};

let savedViewState: ScheduleViewState | null = null;

function readViewState(): Partial<ScheduleViewState> {
  return savedViewState ?? {};
}

function writeViewState(state: ScheduleViewState): void {
  savedViewState = state;
}

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
        {minutesToLabel(start)} – {minutesToLabel(start + booking.durationMinutes)}
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
        {minutesToLabel(timeToMinutes(brk.startTime))} –{" "}
        {minutesToLabel(timeToMinutes(brk.endTime))}
      </Text>
    </View>
  </View>
);

type ListItem =
  | { kind: "booking"; start: number; booking: ScheduleBooking }
  | { kind: "break"; start: number; brk: SpaceBreak };

const ColumnSection = ({
  column,
  items,
  closure,
  onBookingPress,
}: {
  column: ScheduleColumn;
  items: ListItem[];
  closure: SpaceClosure | undefined;
  onBookingPress: (id: number) => void;
}) => (
  <View className="mb-5">
    <View className="flex-row items-center justify-between mb-3 flex-wrap gap-1.5">
      <Text className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2" numberOfLines={1}>
        {column.name}
      </Text>
      {column.virtual ? (
        <View className="flex-row items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-2.5 py-1 rounded-full">
          <Feather name="alert-circle" size={12} color="#B45309" />
          <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            No room assigned
          </Text>
        </View>
      ) : (
        column.capacity != null && (
          <View className="flex-row items-center gap-1 bg-gray-100 dark:bg-neutral-800 px-2.5 py-1 rounded-full">
            <Feather name="users" size={12} color="#6b7280" />
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Max {column.capacity}
            </Text>
          </View>
        )
      )}
      {!!closure && (
        <View className="flex-row items-center gap-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded-full">
          <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
            {closureLabel(closure)}
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
          <BreakCard key={`k-${column.key}-${item.brk.startTime}`} brk={item.brk} />
        ),
      )
    )}
  </View>
);

/* ------------------------------------------------------------------ */
/* Grid (timeline) view                                                */
/* ------------------------------------------------------------------ */

const GridBookingBlock = ({
  item,
  inProgress,
  onPress,
}: {
  item: PositionedBooking;
  inProgress: boolean;
  onPress: () => void;
}) => {
  const b = item.booking;
  const pkg = packageColor(b.packageName);
  const pay = paymentTone(b.paymentStatus);
  const compact = item.height < 56;
  const laneWidth = 100 / item.laneCount;
  const needsCheckIn = inProgress && b.status !== "checked-in";
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        top: item.top,
        height: item.height,
        left: `${item.lane * laneWidth}%`,
        width: `${laneWidth}%`,
        backgroundColor: pkg.bg,
      }}
      className={`rounded-xl overflow-hidden active:opacity-80 ${
        needsCheckIn
          ? "border-2 border-red-400"
          : inProgress
            ? "border-2 border-emerald-400"
            : ""
      }`}
    >
      <View className={`h-full ${compact ? "px-2 py-0.5 justify-center" : "p-2"}`}>
        {compact ? (
          <View className="flex-row items-center gap-1.5">
            <View
              style={{ backgroundColor: statusColor(b.status) }}
              className="w-1.5 h-1.5 rounded-full"
            />
            <Text style={{ color: pkg.text }} className="text-xs font-semibold flex-shrink" numberOfLines={1}>
              {b.customerName || "Walk-in"}
            </Text>
            {item.laneCount === 1 && (
              <Text style={{ color: pkg.text }} className="text-xs opacity-70">
                {minutesToLabel(item.startMin)}
              </Text>
            )}
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between gap-1 mb-1">
              <View
                style={{ backgroundColor: statusColor(b.status) }}
                className="px-1.5 py-0.5 rounded-full"
              >
                <Text className="text-[9px] font-bold uppercase text-white">{b.status}</Text>
              </View>
              {needsCheckIn ? (
                <View className="flex-row items-center gap-0.5 px-1.5 py-px rounded-full bg-red-500">
                  <Feather name="alert-circle" size={9} color="#FFFFFF" />
                  <Text className="text-[9px] font-bold uppercase text-white">Check in</Text>
                </View>
              ) : inProgress ? (
                <View className="px-1.5 py-px rounded-full bg-emerald-500">
                  <Text className="text-[9px] font-bold uppercase text-white">Now</Text>
                </View>
              ) : (
                !!b.referenceNumber && (
                  <Text style={{ color: pkg.text }} className="text-[10px] font-medium opacity-70">
                    #{b.referenceNumber.slice(-6)}
                  </Text>
                )
              )}
            </View>
            <Text style={{ color: pkg.text }} className="text-[11px] font-bold" numberOfLines={1}>
              {minutesToLabel(item.startMin)} – {minutesToLabel(item.startMin + b.durationMinutes)}
            </Text>
            <Text style={{ color: pkg.text }} className="text-[11px] font-semibold" numberOfLines={1}>
              {b.customerName || "Walk-in"}
            </Text>
            {item.height >= 100 && (
              <>
                <Text style={{ color: pkg.text }} className="text-[10px] opacity-80" numberOfLines={1}>
                  {b.packageName}
                </Text>
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Feather name="users" size={10} color={pkg.text} />
                  <Text style={{ color: pkg.text }} className="text-[10px] opacity-80">
                    {b.participants} {b.participants === 1 ? "guest" : "guests"}
                  </Text>
                </View>
                <View className="flex-1" />
                <View className="flex-row items-center justify-between">
                  <Text style={{ color: pkg.text }} className="text-[10px] font-bold">
                    {formatMoney(b.totalAmount)}
                  </Text>
                  <View className={`px-1 py-0.5 rounded ${pay.bg}`}>
                    <Text className={`text-[9px] font-medium ${pay.text}`}>{b.paymentStatus}</Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </View>
      {item.clipped && (
        <View className="absolute bottom-0 inset-x-0 border-b-2 border-dashed border-current opacity-60 items-center">
          {item.height >= 56 && (
            <Text style={{ color: pkg.text }} className="text-[9px] font-semibold bg-white/70 rounded-t px-1">
              continues past midnight
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
};

const GridColumnBackground = ({
  column,
  breaks,
  closure,
  timeWindow,
  pxPerMinute,
}: {
  column: ScheduleColumn;
  breaks: { start: number; end: number }[];
  closure: SpaceClosure | undefined;
  timeWindow: TimeWindow;
  pxPerMinute: number;
}) => (
  <>
    {closure?.fullDay && (
      <View className="absolute inset-0 bg-red-50/80 dark:bg-red-950/40 items-center pt-8 z-10">
        <Text className="text-[10px] font-semibold text-red-500 bg-white/80 dark:bg-black/40 border border-red-200 dark:border-red-900/40 rounded-full px-2 py-0.5">
          Closed all day
        </Text>
      </View>
    )}
    {!closure?.fullDay &&
      closure?.ranges.map((r, i) => {
        const start = Math.max(
          r.timeStart ? timeToMinutes(r.timeStart) : timeWindow.start,
          timeWindow.start,
        );
        const end = Math.min(
          r.timeEnd ? timeToMinutes(r.timeEnd) : timeWindow.end,
          timeWindow.end,
        );
        if (end <= start) return null;
        return (
          <View
            key={`closure-${i}`}
            style={{
              position: "absolute",
              left: 2,
              right: 2,
              top: (start - timeWindow.start) * pxPerMinute,
              height: (end - start) * pxPerMinute,
            }}
            className="bg-red-50/90 dark:bg-red-950/50 border border-dashed border-red-200 dark:border-red-900/40 rounded items-center justify-center z-10"
          >
            <Text className="text-[10px] font-medium text-red-500">Closed</Text>
          </View>
        );
      })}
    {breaks.map((brk, i) => (
      <View
        key={`break-${i}`}
        style={{
          position: "absolute",
          left: 2,
          right: 2,
          top: (brk.start - timeWindow.start) * pxPerMinute,
          height: (brk.end - brk.start) * pxPerMinute,
        }}
        className="bg-gray-100 dark:bg-neutral-800 border-2 border-dashed border-gray-300 dark:border-neutral-600 rounded items-center justify-center"
      >
        <Feather name="coffee" size={14} color="#9CA3AF" />
        <Text className="text-[9px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">Break</Text>
      </View>
    ))}
    {column.virtual && <View className="absolute inset-0 bg-amber-50/20 dark:bg-amber-900/5" />}
  </>
);

const ScheduleGrid = ({
  columns,
  positionedByColumn,
  breaksByRoom,
  closuresBySpace,
  timeWindow,
  pxPerMinute,
  nowTop,
  nowLabel,
  isVenueToday,
  nowMinutes,
  onBookingPress,
  refreshControl,
  bottomInset,
  scrollRef,
}: {
  columns: ScheduleColumn[];
  positionedByColumn: Map<string, PositionedBooking[]>;
  breaksByRoom: Map<number, { start: number; end: number }[]>;
  closuresBySpace: Map<number, SpaceClosure>;
  timeWindow: TimeWindow;
  pxPerMinute: number;
  nowTop: number | null;
  nowLabel: string;
  isVenueToday: boolean;
  nowMinutes: number;
  onBookingPress: (id: number) => void;
  refreshControl: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  bottomInset: number;
  scrollRef: React.RefObject<ScrollView | null>;
}) => {
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyHeight = timeWindow.total * pxPerMinute;
  const marks = hourMarks(timeWindow);

  return (
    <View className="flex-1">
      {/* Header row — sticky at top; scrolls horizontally in sync with body */}
      <View className="flex-row border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900">
        <View
          style={{ width: GUTTER_WIDTH }}
          className="px-2 py-3 border-r border-gray-200 dark:border-neutral-800 items-center justify-center"
        >
          <Feather name="clock" size={14} color="#6b7280" />
        </View>
        <ScrollView
          ref={headerScrollRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          className="flex-1"
        >
          <View className="flex-row">
            {columns.map((column) => (
              <View
                key={column.key}
                style={{ width: COLUMN_WIDTH }}
                className="px-2 py-2 border-r border-gray-200 dark:border-neutral-800 items-center justify-center"
              >
                <Text
                  className="text-[13px] font-semibold text-gray-700 dark:text-gray-200"
                  numberOfLines={1}
                >
                  {column.name}
                </Text>
                {column.virtual ? (
                  <View className="mt-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
                    <Text className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                      No room assigned
                    </Text>
                  </View>
                ) : (
                  column.capacity != null && (
                    <View className="flex-row items-center gap-1 mt-0.5">
                      <Feather name="users" size={10} color="#9ca3af" />
                      <Text className="text-[10px] text-gray-400 dark:text-gray-500">
                        Max {column.capacity}
                      </Text>
                    </View>
                  )
                )}
                {column.roomId != null && closuresBySpace.has(column.roomId) && (
                  <View className="mt-0.5 px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
                    <Text className="text-[9px] font-semibold text-red-600 dark:text-red-400" numberOfLines={1}>
                      {closureLabel(closuresBySpace.get(column.roomId))}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Body — vertical scroll; time column fixed, columns scroll horizontally */}
      <ScrollView
        ref={scrollRef}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator
        contentContainerStyle={{ paddingBottom: bottomInset }}
      >
        <View className="flex-row">
          {/* Fixed time gutter */}
          <View style={{ width: GUTTER_WIDTH, height: bodyHeight }} className="border-r border-gray-200 dark:border-neutral-800">
            {marks.map((mark) => (
              <Text
                key={mark}
                style={{
                  position: "absolute",
                  top: (mark - timeWindow.start) * pxPerMinute - 6,
                  right: 6,
                }}
                className="text-[10px] font-medium text-gray-400 dark:text-gray-500"
              >
                {minutesToLabel(mark)}
              </Text>
            ))}
            {nowTop !== null && (
              <View
                style={{ position: "absolute", top: nowTop - 7, right: 4 }}
                className="px-1.5 py-0.5 rounded bg-red-500"
              >
                <Text className="text-[9px] font-bold text-white">{nowLabel}</Text>
              </View>
            )}
          </View>

          {/* Scrollable columns */}
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
            <View style={{ height: bodyHeight }}>
              <View className="flex-row">
                {columns.map((column) => (
                  <View
                    key={column.key}
                    style={{ width: COLUMN_WIDTH, height: bodyHeight }}
                    className="relative border-r border-gray-200 dark:border-neutral-800"
                  >
                    {/* Hour gridlines */}
                    {marks.map((mark) => (
                      <View
                        key={mark}
                        style={{ position: "absolute", top: (mark - timeWindow.start) * pxPerMinute, left: 0, right: 0 }}
                        className="border-t border-gray-100 dark:border-neutral-800"
                      />
                    ))}
                    <GridColumnBackground
                      column={column}
                      breaks={column.roomId != null ? breaksByRoom.get(column.roomId) ?? [] : []}
                      closure={column.roomId != null ? closuresBySpace.get(column.roomId) : undefined}
                      timeWindow={timeWindow}
                      pxPerMinute={pxPerMinute}
                    />
                    {(positionedByColumn.get(column.key) ?? []).map((item) => (
                      <GridBookingBlock
                        key={`b-${item.booking.id}`}
                        item={item}
                        inProgress={
                          isVenueToday && nowMinutes >= item.startMin && nowMinutes < item.endMin
                        }
                        onPress={() => onBookingPress(item.booking.id)}
                      />
                    ))}
                  </View>
                ))}
              </View>
              {nowTop !== null && (
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", top: nowTop, left: 0, right: 0 }}
                >
                  <View style={{ height: 2 }} className="bg-red-500" />
                </View>
              )}
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
  const user = getCurrentUser();

  const [selectedDate, setSelectedDate] = useState<Date>(() => venueToday());
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(() => venueToday());
  const [showLegend, setShowLegend] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Saved filters — seeded once from the in-memory view state, persisted back
  // on every change (web parity: readViewState/writeViewState).
  const savedFilters = useRef(readViewState()).current;
  const [categoryFilter, setCategoryFilter] = useState(savedFilters.categoryFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState(savedFilters.statusFilter ?? "all");
  const [searchInput, setSearchInput] = useState(savedFilters.searchInput ?? "");
  const [hideEmptySpaces, setHideEmptySpaces] = useState(savedFilters.hideEmptySpaces ?? true);
  const [zoomIndex, setZoomIndex] = useState(
    typeof savedFilters.zoomIndex === "number" &&
      savedFilters.zoomIndex >= 0 &&
      savedFilters.zoomIndex < ZOOM_LEVELS.length
      ? savedFilters.zoomIndex
      : DEFAULT_ZOOM_INDEX,
  );

  useEffect(() => {
    writeViewState({ categoryFilter, statusFilter, searchInput, hideEmptySpaces, zoomIndex });
  }, [categoryFilter, statusFilter, searchInput, hideEmptySpaces, zoomIndex]);

  const pxPerMinute = ZOOM_LEVELS[zoomIndex];

  // Live "now", venue-timezone-anchored — updates every minute and whenever
  // the app returns to the foreground (web parity: nowTick + visibilitychange).
  const [nowTick, setNowTick] = useState(() => venueNow());
  useEffect(() => {
    const id = setInterval(() => setNowTick(venueNow()), 60000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNowTick(venueNow());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  const selectedKey = dateKey(selectedDate);
  const isVenueToday =
    selectedDate.getFullYear() === nowTick.year &&
    selectedDate.getMonth() === nowTick.month - 1 &&
    selectedDate.getDate() === nowTick.day;
  const nowMinutes = nowTick.hour * 60 + nowTick.minute;
  const currentDayName = WEEKDAY_NAMES[selectedDate.getDay()];

  // Active workspace location (company_admin only — undefined for everyone
  // else, who the backend already scopes to their own location).
  const activeLocation = useActiveLocation();
  const effectiveLocationId = activeLocation.id === "all" ? undefined : activeLocation.id;
  // Day-offs need a concrete location id (no "all locations" query exists for
  // that endpoint): the active selection when there is one, else the caller's
  // own assigned location — so managers/attendants still see their closures.
  const dayOffLocationId = effectiveLocationId ?? user?.location_id ?? undefined;

  const { spaces, bookings, loading, error, refetch } = useSpaceSchedule(
    selectedKey,
    effectiveLocationId,
  );

  // The week strip runs from today forward (web parity: SpaceSchedule's
  // `weekDays`), so it re-anchors when the venue day rolls over rather than
  // following the date the user has navigated to.
  const weekDays = useMemo(() => {
    const base = new Date(nowTick.year, nowTick.month - 1, nowTick.day);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [nowTick.year, nowTick.month, nowTick.day]);

  const { counts: weekCounts, refetch: refetchWeekCounts } = useWeekBookingCounts(
    dateKey(weekDays[0]),
    dateKey(weekDays[6]),
    effectiveLocationId,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchWeekCounts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchWeekCounts]);

  // Day-offs for the resolved location — feeds the closure bands.
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  useEffect(() => {
    if (dayOffLocationId == null) {
      setDayOffs([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchDayOffsByLocation(token, dayOffLocationId, controller.signal)
      .then((data) => setDayOffs(data))
      .catch(() => setDayOffs([]));
    return () => controller.abort();
  }, [dayOffLocationId]);

  const displaySpaces = useMemo(
    () =>
      effectiveLocationId != null
        ? spaces.filter((s) => s.locationId === effectiveLocationId)
        : spaces,
    [spaces, effectiveLocationId],
  );

  const sortedSpaces = useMemo(
    () => [...displaySpaces].sort((a, b) => naturalSort(a.name, b.name)),
    [displaySpaces],
  );

  // Bookings that occupy a space (confirmed / checked-in / pending).
  const activeBookings = useMemo(
    () => bookings.filter((b) => SCHEDULE_STATUSES.has(b.status)),
    [bookings],
  );

  const categoryOptions = useMemo(
    () => computeCategoryOptions(activeBookings, normalizeCategory),
    [activeBookings],
  );
  const effectiveCategory = useMemo(
    () =>
      categoryFilter !== "all" && categoryOptions.some((o) => o.value === categoryFilter)
        ? categoryFilter
        : "all",
    [categoryFilter, categoryOptions],
  );

  const filteredBookings = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    return activeBookings.filter((b) => {
      if (
        effectiveCategory !== "all" &&
        (normalizeCategory(b.packageCategory) || UNCATEGORIZED_LABEL) !== effectiveCategory
      ) {
        return false;
      }
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (term) {
        const haystack = `${b.customerName} ${b.referenceNumber ?? ""} ${b.packageName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [activeBookings, effectiveCategory, statusFilter, searchInput]);

  const knownRoomIds = useMemo(
    () => new Set(sortedSpaces.map((s) => s.id)),
    [sortedSpaces],
  );

  const spaceClosures = useMemo(
    () =>
      computeSpaceClosures({
        dayOffs,
        selectedDate,
        spaceIds: sortedSpaces.map((s) => s.id),
      }),
    [dayOffs, selectedDate, sortedSpaces],
  );

  const roomBreaks = useMemo(() => {
    const map = new Map<number, { start: number; end: number }[]>();
    for (const space of sortedSpaces) {
      const list = space.breaks
        .filter((b) => b.days.includes(currentDayName))
        .map((b) => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) }))
        .filter((r) => r.end > r.start);
      if (list.length) map.set(space.id, list);
    }
    return map;
  }, [sortedSpaces, currentDayName]);

  const columns = useMemo(
    () =>
      buildColumns({
        spaces: sortedSpaces,
        bookings: filteredBookings,
        hideEmptySpaces,
        knownRoomIds,
      }),
    [sortedSpaces, filteredBookings, hideEmptySpaces, knownRoomIds],
  );

  // The visible time window only ever widens within a date+location — once
  // computed it never snaps narrower as filters/data change (web parity:
  // windowExtentRef).
  const windowExtentRef = useRef<{ key: string; window: TimeWindow } | null>(null);
  const timeWindow = useMemo(() => {
    const bookingRanges = filteredBookings.map((b) => {
      const start = timeToMinutes(b.time);
      return { start, end: start + Math.max(15, b.durationMinutes) };
    });
    const breakRanges = [...roomBreaks.values()].flat();
    const closureBoundaries = sortedSpaces.flatMap((s) =>
      closureBoundaryMinutes(spaceClosures.get(s.id)),
    );
    const extentKey = `${selectedKey}:${effectiveLocationId ?? "all"}`;
    const prev = windowExtentRef.current?.key === extentKey ? windowExtentRef.current.window : null;
    const win = computeTimeWindow({
      bookingRanges,
      breakRanges,
      closureBoundaries,
      isToday: isVenueToday,
      nowMinutes,
      prevWindow: prev,
    });
    windowExtentRef.current = { key: extentKey, window: win };
    return win;
  }, [
    filteredBookings,
    roomBreaks,
    sortedSpaces,
    spaceClosures,
    isVenueToday,
    nowMinutes,
    selectedKey,
    effectiveLocationId,
  ]);

  const positionedByColumn = useMemo(
    () =>
      positionBookingsByColumn({
        columns,
        bookings: filteredBookings,
        timeWindow,
        pxPerMinute,
        knownRoomIds,
      }),
    [columns, filteredBookings, timeWindow, pxPerMinute, knownRoomIds],
  );

  const nowTop = useMemo(
    () => nowLineTop(nowMinutes, timeWindow, pxPerMinute, isVenueToday),
    [nowMinutes, timeWindow, pxPerMinute, isVenueToday],
  );

  const daySummary = useMemo(
    () => computeDaySummary(filteredBookings, knownRoomIds),
    [filteredBookings, knownRoomIds],
  );

  const hasActiveFilters =
    effectiveCategory !== "all" || statusFilter !== "all" || searchInput.trim() !== "";
  const clearFilters = () => {
    setCategoryFilter("all");
    setStatusFilter("all");
    setSearchInput("");
  };

  // List-view sections: one per column, grouping its bookings and (for real
  // rooms only) today's breaks.
  const listSections = useMemo(() => {
    return columns.map((column) => {
      const items: ListItem[] = [];
      for (const pb of positionedByColumn.get(column.key) ?? []) {
        items.push({ kind: "booking", start: pb.startMin, booking: pb.booking });
      }
      if (column.roomId != null) {
        const space = sortedSpaces.find((s) => s.id === column.roomId);
        for (const brk of space?.breaks ?? []) {
          if (brk.days.includes(currentDayName)) {
            items.push({ kind: "break", start: timeToMinutes(brk.startTime), brk });
          }
        }
      }
      items.sort((a, b) => a.start - b.start);
      return { column, items };
    });
  }, [columns, positionedByColumn, sortedSpaces, currentDayName]);

  const scrollRef = useRef<ScrollView>(null);
  const scrollToNow = () => {
    if (nowTop === null || !scrollRef.current) return;
    scrollRef.current.scrollTo({ y: Math.max(0, nowTop - 160), animated: true });
  };

  // Auto-scroll to "now" (or to the top) once per day change, after the day's
  // data has loaded.
  const lastScrolledDayRef = useRef("");
  useEffect(() => {
    if (loading || !scrollRef.current) return;
    if (lastScrolledDayRef.current === selectedKey) return;
    lastScrolledDayRef.current = selectedKey;
    if (nowTop !== null) {
      scrollRef.current.scrollTo({ y: Math.max(0, nowTop - 160), animated: false });
    } else {
      scrollRef.current.scrollTo({ y: 0, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, loading]);

  const stepDay = (dir: number) => {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + dir);
    setSelectedDate(next);
  };

  const goToToday = () => setSelectedDate(venueToday());

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

  const todayKey = dateKey(venueToday());
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

  const noSchedule = !loading && !error && activeBookings.length === 0;
  const noMatches = !loading && !error && activeBookings.length > 0 && filteredBookings.length === 0;

  const closedSpaces = sortedSpaces.filter((s) => spaceClosures.has(s.id));

  const renderEmpty = () => (
    <View className="px-5 pt-6">
      {noSchedule ? (
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
          {closedSpaces.length > 0 && (
            <View className="flex-row flex-wrap justify-center gap-2 mt-4">
              {closedSpaces.map((s) => (
                <View
                  key={s.id}
                  className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-full px-2.5 py-1"
                >
                  <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {s.name}: {closureLabel(spaceClosures.get(s.id))}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
          <Feather name="search" size={28} color="#9ca3af" />
          <Text className="text-gray-700 dark:text-gray-200 font-semibold mt-3">
            No Matching Bookings
          </Text>
          <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs mb-4">
            {activeBookings.length} {activeBookings.length === 1 ? "booking is" : "bookings are"}{" "}
            scheduled this day, but none match the current filters.
          </Text>
          <Pressable
            onPress={clearFilters}
            className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-neutral-600"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Clear filters
            </Text>
          </Pressable>
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
      <View
        className="bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 px-5 pt-4 pb-3.5"
      >
        <View className="mb-3">
          <LocationWorkspaceSelector />
        </View>

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
          <View className="flex-row items-center gap-2 flex-shrink">
            <Pressable
              onPress={goToToday}
              className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full ${
                isVenueToday ? "bg-[#0644C7]" : "bg-[#0644C7]/10 dark:bg-[#0644C7]/20"
              }`}
            >
              <Feather name="sun" size={14} color={isVenueToday ? "#FFFFFF" : PRIMARY} />
              <Text
                className={`text-sm font-semibold ${isVenueToday ? "text-white" : "text-[#0644C7]"}`}
              >
                Today
              </Text>
            </Pressable>
            {nowTop !== null && filteredBookings.length > 0 && (
              <Pressable
                onPress={scrollToNow}
                className="flex-row items-center gap-1 px-2.5 py-2 rounded-full bg-red-50 dark:bg-red-900/20"
                accessibilityLabel="Scroll to current time"
              >
                <Feather name="crosshair" size={13} color="#EF4444" />
                <Text className="text-xs font-semibold text-red-500">
                  {minutesToLabel(nowMinutes)}
                </Text>
              </Pressable>
            )}
          </View>

          <GridListToggle mode={viewMode} onChange={setViewMode} />
        </View>

        {/* Week strip — the next 7 days with their booking counts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-1 mt-3"
          contentContainerStyle={{ paddingHorizontal: 4 }}
        >
          {weekDays.map((day) => {
            const key = dateKey(day);
            const count = weekCounts[key] ?? 0;
            const selected = key === selectedKey;
            const isToday = key === todayKey;
            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDate(new Date(day))}
                className={`mx-1 items-center px-3 py-1.5 rounded-xl border ${
                  selected
                    ? "bg-[#0644C7]/10 dark:bg-[#0644C7]/20 border-[#0644C7]/40"
                    : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${WEEKDAY_FULL[day.getDay()]} ${MONTH_NAMES[day.getMonth()]} ${day.getDate()}, ${count} ${count === 1 ? "booking" : "bookings"}`}
              >
                <Text
                  className={`text-[10px] uppercase tracking-wide font-semibold ${
                    selected || isToday
                      ? "text-[#0644C7]"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {isToday ? "Today" : WEEKDAY_SHORT[day.getDay()]}
                </Text>
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Text
                    className={`text-sm font-bold ${
                      selected ? "text-[#0644C7]" : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {day.getDate()}
                  </Text>
                  {count > 0 && (
                    <View
                      className={`px-1.5 rounded-full ${
                        selected
                          ? "bg-[#0644C7]/20"
                          : "bg-gray-100 dark:bg-neutral-800"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold ${
                          selected
                            ? "text-[#0644C7]"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {count}
                      </Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Day summary */}
        <View className="flex-row items-center gap-3 mt-3">
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            <Text className="font-semibold text-gray-900 dark:text-white">{daySummary.count}</Text> bookings
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            <Text className="font-semibold text-gray-900 dark:text-white">{daySummary.guests}</Text> guests
          </Text>
          {daySummary.unassigned > 0 && (
            <View className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                {daySummary.unassigned} no room
              </Text>
            </View>
          )}
        </View>

        {/* Category chips */}
        {categoryOptions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-1 mt-3"
            contentContainerStyle={{ paddingHorizontal: 4 }}
          >
            <Pressable
              onPress={() => setCategoryFilter("all")}
              className={`mx-1 px-3 py-1.5 rounded-full border ${
                effectiveCategory === "all"
                  ? "bg-[#0644C7] border-[#0644C7]"
                  : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${effectiveCategory === "all" ? "text-white" : "text-gray-600 dark:text-gray-300"}`}
              >
                All ({activeBookings.length})
              </Text>
            </Pressable>
            {categoryOptions.map((opt) => {
              const active = effectiveCategory === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setCategoryFilter(opt.value)}
                  className={`mx-1 px-3 py-1.5 rounded-full border ${
                    active
                      ? "bg-[#0644C7] border-[#0644C7]"
                      : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${active ? "text-white" : "text-gray-600 dark:text-gray-300"}`}
                    numberOfLines={1}
                  >
                    {opt.label} ({opt.count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Search + status + hide-empty + zoom + clear */}
        <View className="flex-row items-center gap-2 mt-3">
          <View className="flex-1 flex-row items-center bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg px-2.5">
            <Feather name="search" size={14} color="#9CA3AF" />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search bookings"
              placeholderTextColor="#9CA3AF"
              className="flex-1 py-2 px-2 text-sm text-gray-900 dark:text-white"
            />
          </View>
          <Pressable
            onPress={() => setShowStatusPicker(true)}
            className={`px-2.5 py-2 rounded-lg border ${
              statusFilter !== "all"
                ? "border-[#0644C7]/40 bg-[#0644C7]/5"
                : "border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800"
            }`}
          >
            <Feather name="filter" size={16} color={statusFilter !== "all" ? PRIMARY : "#6b7280"} />
          </Pressable>
          <Pressable
            onPress={() => setHideEmptySpaces((v) => !v)}
            accessibilityLabel={hideEmptySpaces ? "Show empty spaces" : "Hide empty spaces"}
            className={`p-2 rounded-lg border ${
              hideEmptySpaces
                ? "border-[#0644C7]/40 bg-[#0644C7]/5"
                : "border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800"
            }`}
          >
            <Feather
              name={hideEmptySpaces ? "eye-off" : "eye"}
              size={16}
              color={hideEmptySpaces ? PRIMARY : "#6b7280"}
            />
          </Pressable>
          {viewMode === "grid" && (
            <View className="flex-row items-center rounded-lg border border-gray-200 dark:border-neutral-700">
              <Pressable
                onPress={() => setZoomIndex((z) => Math.max(0, z - 1))}
                disabled={zoomIndex === 0}
                className="p-2 rounded-l-lg"
              >
                <Feather name="zoom-out" size={16} color={zoomIndex === 0 ? "#D1D5DB" : "#6b7280"} />
              </Pressable>
              <Pressable
                onPress={() => setZoomIndex((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className="p-2 rounded-r-lg border-l border-gray-200 dark:border-neutral-700"
              >
                <Feather
                  name="zoom-in"
                  size={16}
                  color={zoomIndex === ZOOM_LEVELS.length - 1 ? "#D1D5DB" : "#6b7280"}
                />
              </Pressable>
            </View>
          )}
          {hasActiveFilters && (
            <Pressable onPress={clearFilters} className="p-2 rounded-lg" accessibilityLabel="Clear filters">
              <Feather name="x" size={16} color="#9CA3AF" />
            </Pressable>
          )}
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
      ) : error ? null : noSchedule || noMatches ? (
        <ScrollView refreshControl={refreshControl}>{renderEmpty()}</ScrollView>
      ) : viewMode === "grid" ? (
        <ScheduleGrid
          columns={columns}
          positionedByColumn={positionedByColumn}
          breaksByRoom={roomBreaks}
          closuresBySpace={spaceClosures}
          timeWindow={timeWindow}
          pxPerMinute={pxPerMinute}
          nowTop={nowTop}
          nowLabel={minutesToLabel(nowMinutes)}
          isVenueToday={isVenueToday}
          nowMinutes={nowMinutes}
          onBookingPress={setSelectedBookingId}
          refreshControl={refreshControl}
          bottomInset={insets.bottom + 24}
          scrollRef={scrollRef}
        />
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={refreshControl}
        >
          <View className="px-5 pt-6">
            {listSections.map(({ column, items }) => (
              <ColumnSection
                key={column.key}
                column={column}
                items={items}
                closure={column.roomId != null ? spaceClosures.get(column.roomId) : undefined}
                onBookingPress={setSelectedBookingId}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {/* Month date picker */}
      <BottomSheet visible={showPicker} onClose={() => setShowPicker(false)} title="Select Date">
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
                <Text className="text-xs font-medium text-gray-400 dark:text-gray-500">{d}</Text>
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
                      selected ? "bg-[#0644C7]" : dToday ? "bg-[#0644C7]/10 dark:bg-[#0644C7]/20" : ""
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
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">Close</Text>
            </Pressable>
          </View>
        </View>
      </BottomSheet>

      {/* Status filter */}
      <BottomSheet visible={showStatusPicker} onClose={() => setShowStatusPicker(false)} title="Status">
        <View className="px-5 pb-6">
          {STATUS_OPTIONS.map((opt) => {
            const selected = statusFilter === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setStatusFilter(opt.value);
                  setShowStatusPicker(false);
                }}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  selected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    selected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {opt.label}
                </Text>
                {selected && <Feather name="check" size={16} color="#3B82F6" />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* Legend */}
      <BottomSheet visible={showLegend} onClose={() => setShowLegend(false)} title="Legend">
        <View className="px-5 pb-6">
          <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-3">
            Booking Status
          </Text>
          {["confirmed", "pending", "checked-in", "completed", "cancelled"].map((s) => (
            <View key={s} className="flex-row items-center gap-2.5 py-1.5">
              <View style={{ backgroundColor: statusColor(s) }} className="px-2 py-0.5 rounded-full">
                <Text className="text-[10px] font-bold uppercase text-white">{s}</Text>
              </View>
            </View>
          ))}

          <View className="h-px bg-gray-100 dark:bg-neutral-800 my-4" />

          <Text className="text-xs font-bold tracking-wide text-gray-500 dark:text-gray-400 uppercase mb-2">
            Color Coding
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Each package has its own color.
          </Text>
          <View className="flex-row items-center gap-2.5 mb-2">
            <View className="w-6 h-6 rounded-md bg-gray-100 dark:bg-neutral-800 border border-dashed border-gray-300 dark:border-neutral-600 items-center justify-center">
              <Feather name="coffee" size={12} color="#6b7280" />
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300">Break Time</Text>
          </View>
          <View className="flex-row items-center gap-2.5 mb-2">
            <View style={{ width: 24, height: 3 }} className="rounded-full bg-red-500" />
            <Text className="text-sm text-gray-600 dark:text-gray-300">Current time (Michigan)</Text>
          </View>
          <View className="flex-row items-center gap-2.5 mb-2">
            <View className="px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
              <Text className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">No room</Text>
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Booking not assigned to a space
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <View className="w-6 h-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40" />
            <Text className="text-sm text-gray-600 dark:text-gray-300">Space closed</Text>
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
