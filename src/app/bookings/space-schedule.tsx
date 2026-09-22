import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { noteFlagsOf, noteSummaryOf } from "../../lib/bookings/bookingNotes";
import { CalendarDaySkeleton } from "../../components/ui/skeleton/CalendarSkeleton";
import {
  buildBookingParams,
  CREATE_BOOKING_PATH,
} from "../../lib/bookings/bookingPrefill";
import {
  bandGeometry,
  freeState,
  freeUntilMinute,
  minuteAtOffset,
  WALK_IN_SNAP_MINUTES,
  type FreeState,
  type TimeRange,
} from "../../lib/bookings/freeTime";
import { packagesValidForSlot } from "../../lib/bookings/packageCandidates";
import {
  buildColumns,
  closureBoundaryMinutes,
  closureLabel,
  columnKeyFor,
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
import {
  columnStarts,
  nextBookableFrom,
  nextBookingMinuteFrom,
  resolveSlotMinute,
} from "../../lib/calendar/dayGridSlots";
import { packageColor } from "../../lib/calendar/packageColors";
import { venueNow, venueToday } from "../../lib/date/venueTime";
import { useScheduleDayWindow } from "../../lib/hooks/useScheduleDayWindow";
import { useSpaceSchedule } from "../../lib/hooks/useSpaceSchedule";
import { useWeekBookingCounts } from "../../lib/hooks/useWeekBookingCounts";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { resolvePaymentState } from "../../lib/payments/paymentState";
import { getCurrentUser, getToken } from "../../lib/session";
import { normalizeCategory } from "../../lib/venueCategories";
import type {
  ScheduleBooking,
  SpaceBreak,
} from "../../services/bookingsService";
import {
  fetchDayOffsByLocation,
  type DayOff,
} from "../../services/dayOffsService";

const PRIMARY = "#0644C7";

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
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

const paymentTone = (booking: {
  paymentStatus: string;
  totalAmount: number;
  amountPaid: number;
}) => {
  const state = resolvePaymentState({
    payment_status: booking.paymentStatus,
    total_amount: booking.totalAmount,
    amount_paid: booking.amountPaid,
  });
  const [bg1, bg2, fg1, fg2] = state.pillClass.split(" ");
  return {
    bg: `${bg1} ${bg2}`,
    text: `${fg1} ${fg2}`,
    label: state.label,
  };
};

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

const GUTTER_WIDTH = 60;

const COLUMN_MIN_WIDTH = 96;
const COLUMN_MAX_WIDTH = 220;
const COLUMN_BOOKED_MIN_WIDTH = 168;
const HEADER_CHAR_WIDTH = 7.5;

type ViewMode = "grid" | "list";

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

const BookingCard = ({
  booking,
  onPress,
}: {
  booking: ScheduleBooking;
  onPress: () => void;
}) => {
  const pkg = packageColor(booking.packageName);
  const start = timeToMinutes(booking.time);
  const pay = paymentTone(booking);
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
          <Text
            style={{ color: pkg.text }}
            className="text-[10px] font-medium opacity-70"
          >
            #{booking.referenceNumber.slice(-6)}
          </Text>
        )}
      </View>

      <Text style={{ color: pkg.text }} className="text-sm font-bold">
        {minutesToLabel(start)} –{" "}
        {minutesToLabel(start + booking.durationMinutes)}
      </Text>
      <Text
        style={{ color: pkg.text }}
        className="text-sm font-semibold mt-0.5"
        numberOfLines={1}
      >
        {booking.customerName}
      </Text>
      <Text
        style={{ color: pkg.text }}
        className="text-xs opacity-80 mt-0.5"
        numberOfLines={1}
      >
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
            {pay.label}
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
      <Text
        className="text-base font-bold text-gray-900 dark:text-white flex-1 mr-2"
        numberOfLines={1}
      >
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
        <Text className="text-sm text-gray-400 dark:text-gray-500">
          No bookings
        </Text>
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
          <BreakCard
            key={`k-${column.key}-${item.brk.startTime}`}
            brk={item.brk}
          />
        ),
      )
    )}
  </View>
);

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
  const pay = paymentTone(b);
  const tiny = item.height < 30;
  const compact = !tiny && item.height < 60;
  const medium = item.height >= 60 && item.height < 140;
  const laneWidth = 100 / item.laneCount;
  const needsCheckIn = inProgress && b.status !== "checked-in";
  const doubleBooked = item.conflicts.some((c) => c.overlapMinutes > 0);
  const clashing = item.conflicts.length > 0;
  const noteFlags = noteFlagsOf(b);
  const noteSummary = noteSummaryOf(b);
  // below this the block's own text is already clipped, so an icon would only steal from it
  const showNotes = (noteFlags.guest || noteFlags.staff) && item.height >= 20;
  // a tiny block has room for one badge: the staff note wins, being rarer and written for staff
  const tightNotes = tiny && noteFlags.guest && noteFlags.staff;
  const overlapLabel = item.conflicts
    .map(
      (clash) =>
        `${clash.booking.customerName || "Walk-in"} at ${minutesToLabel(timeToMinutes(clash.booking.time))}` +
        (clash.overlapMinutes > 0 ? ` (${clash.overlapMinutes} min over)` : " (no gap between them)"),
    )
    .join(", ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={
        clashing || noteSummary
          ? [
              `${b.customerName || "Walk-in"}`,
              clashing ? `${doubleBooked ? "overlaps" : "no turnaround before"} ${overlapLabel}` : null,
              noteSummary,
            ]
              .filter(Boolean)
              .join(", ")
          : undefined
      }
      style={{
        position: "absolute",
        top: item.top,
        height: item.height,
        left: `${item.lane * laneWidth}%`,
        width: `${laneWidth}%`,
        backgroundColor: pkg.bg,
      }}
      className={`z-10 rounded-xl overflow-hidden active:opacity-80 ${
        doubleBooked
          ? "border-2 border-rose-500"
          : clashing
            ? "border-2 border-amber-400"
            : needsCheckIn
              ? "border-2 border-red-400"
              : inProgress
                ? "border-2 border-emerald-400"
                : ""
      }`}
    >
      {/* one rail in the corner: siblings, so notes and the clash badge can never cover each other */}
      {(clashing || showNotes) && (
        <View className="absolute top-0 right-0 z-10 flex-row items-center gap-0.5 rounded-tr-lg rounded-bl bg-white/80 pl-px">
          {showNotes && noteFlags.staff && (
            <View className="rounded bg-amber-100 px-0.5 py-px">
              <Feather name="file-text" size={8} color="#b45309" />
            </View>
          )}
          {showNotes && noteFlags.guest && !tightNotes && (
            <View className="rounded bg-blue-100 px-0.5 py-px">
              <Feather name="message-square" size={8} color="#1d4ed8" />
            </View>
          )}
          {clashing && (
            <View
              className={`flex-row items-center gap-0.5 rounded-bl px-1 py-px ${
                doubleBooked ? "bg-rose-500" : "bg-amber-500"
              }`}
            >
              <Feather name="alert-triangle" size={8} color="#FFFFFF" />
              {!tiny && !showNotes && (
                <Text className="text-[8px] font-bold uppercase text-white">
                  {doubleBooked ? "Overlap" : "No gap"}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
      <View
        className={`h-full ${tiny ? "px-1.5 justify-center" : compact ? "px-2 py-0.5 justify-center" : "p-2"}`}
      >
        {tiny ? (
          // One line only fits — spend it on the time AND the name.
          <View className="flex-row items-baseline gap-1">
            <Text
              style={{ color: pkg.text }}
              className="text-[10px] font-bold flex-shrink-0"
            >
              {minutesToLabel(item.startMin)}
            </Text>
            <Text
              style={{ color: pkg.text }}
              className="text-[10px] font-semibold flex-shrink"
              numberOfLines={1}
            >
              {b.customerName || "Walk-in"}
            </Text>
          </View>
        ) : compact ? (
          <View className="flex-row items-center gap-1.5">
            <View
              style={{ backgroundColor: statusColor(b.status) }}
              className="w-1.5 h-1.5 rounded-full"
            />
            <Text style={{ color: pkg.text }} className="text-xs opacity-70">
              {minutesToLabel(item.startMin)}
            </Text>
            <Text
              style={{ color: pkg.text }}
              className="text-xs font-semibold flex-shrink"
              numberOfLines={1}
            >
              {b.customerName || "Walk-in"}
            </Text>
          </View>
        ) : (
          <>
            {!medium && (
              <View className="flex-row items-center justify-between gap-1 mb-1">
                <View
                  style={{ backgroundColor: statusColor(b.status) }}
                  className="px-1.5 py-0.5 rounded-full"
                >
                  <Text className="text-[9px] font-bold uppercase text-white">
                    {b.status}
                  </Text>
                </View>
                {!!b.referenceNumber && (
                  <Text
                    style={{ color: pkg.text }}
                    className="text-[10px] font-medium opacity-70"
                  >
                    #{b.referenceNumber.slice(-6)}
                  </Text>
                )}
              </View>
            )}
            <View className="flex-row items-center gap-1.5">
              <Text
                style={{ color: pkg.text }}
                className="text-[11px] font-bold flex-shrink"
                numberOfLines={1}
              >
                {minutesToLabel(item.startMin)} –{" "}
                {minutesToLabel(item.startMin + b.durationMinutes)}
              </Text>
              {needsCheckIn ? (
                <View className="flex-row items-center gap-0.5 px-1.5 py-px rounded-full bg-red-500 flex-shrink-0">
                  <Feather name="alert-circle" size={9} color="#FFFFFF" />
                  <Text className="text-[9px] font-bold uppercase text-white">
                    Check in
                  </Text>
                </View>
              ) : (
                inProgress && (
                  <View className="px-1.5 py-px rounded-full bg-emerald-500 flex-shrink-0">
                    <Text className="text-[9px] font-bold uppercase text-white">
                      Now
                    </Text>
                  </View>
                )
              )}
            </View>
            <Text
              style={{ color: pkg.text }}
              className="text-[11px] font-semibold"
              numberOfLines={1}
            >
              {b.customerName || "Walk-in"}
            </Text>
            {!medium && (
              <>
                <Text
                  style={{ color: pkg.text }}
                  className="text-[10px] opacity-80"
                  numberOfLines={1}
                >
                  {b.packageName}
                </Text>
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Feather name="users" size={10} color={pkg.text} />
                  <Text
                    style={{ color: pkg.text }}
                    className="text-[10px] opacity-80"
                  >
                    {b.participants} {b.participants === 1 ? "guest" : "guests"}
                  </Text>
                </View>
                <View className="flex-1" />
                <View className="flex-row items-center justify-between">
                  <Text
                    style={{ color: pkg.text }}
                    className="text-[10px] font-bold"
                  >
                    {formatMoney(b.totalAmount)}
                  </Text>
                  <View className={`px-1 py-0.5 rounded ${pay.bg}`}>
                    <Text className={`text-[9px] font-medium ${pay.text}`}>
                      {pay.label}
                    </Text>
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
            <Text
              style={{ color: pkg.text }}
              className="text-[9px] font-semibold bg-white/70 rounded-t px-1"
            >
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
  meta,
  isPastDate,
  onPressBand,
}: {
  column: ScheduleColumn;
  breaks: { start: number; end: number }[];
  closure: SpaceClosure | undefined;
  timeWindow: TimeWindow;
  pxPerMinute: number;
  meta: {
    open: number | null;
    close: number | null;
    bookable: boolean;
    windowKnown: boolean;
    reason: string | null;
  };
  isPastDate: boolean;
  onPressBand: (bandOrigin: number, locationY: number) => void;
}) => {
  const band = bandGeometry(meta.open, meta.close, timeWindow, pxPerMinute);
  const bandOrigin = Math.max(meta.open ?? timeWindow.start, timeWindow.start);
  const clickable = !!band && meta.bookable && !isPastDate;

  return (
    <>
      {band && (
        <Pressable
          disabled={!clickable}
          onPress={(e) => onPressBand(bandOrigin, e.nativeEvent.locationY)}
          accessibilityRole={clickable ? "button" : undefined}
          accessibilityLabel={
            clickable ? `Start a booking in ${column.name}` : undefined
          }
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: band.top,
            height: band.height,
          }}
          className={
            clickable
              ? "z-[1] bg-gray-100 dark:bg-neutral-800/60 active:bg-gray-200 dark:active:bg-neutral-700/60"
              : "z-[1] bg-gray-200/70 dark:bg-neutral-800/50"
          }
        />
      )}
      {!band && !closure?.fullDay && meta.reason && (
        <View className="absolute inset-0 z-[1] items-center bg-gray-200/70 pt-8 dark:bg-neutral-800/50">
          <Text className="rounded-full border border-gray-300 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-neutral-700 dark:bg-black/40 dark:text-gray-400">
            {meta.reason}
          </Text>
        </View>
      )}
      {!band && !closure?.fullDay && !meta.windowKnown && !meta.reason && (
        <View className="absolute inset-0 z-[1] items-center bg-gray-200/70 pt-8 dark:bg-neutral-800/50">
          <Text className="rounded-full border border-gray-300 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:border-neutral-700 dark:bg-black/40 dark:text-gray-400">
            Schedule unavailable
          </Text>
        </View>
      )}
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
              <Text className="text-[10px] font-medium text-red-500">
                Closed
              </Text>
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
          className="z-[4] bg-gray-300/70 dark:bg-neutral-700 border-2 border-dashed border-gray-400 dark:border-neutral-600 rounded items-center justify-center"
        >
          <Feather name="coffee" size={14} color="#4B5563" />
          <Text className="text-[9px] font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
            Break
          </Text>
        </View>
      ))}
      {column.virtual && (
        <View className="absolute inset-0 bg-amber-50/20 dark:bg-amber-900/5" />
      )}
    </>
  );
};

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
  metaByColumn,
  freeStateByColumn,
  nextBookableByColumn,
  turnaroundByColumn,
  isPastDate,
  onOpenSlot,
  onStartWalkIn,
  walkInFit,
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
  refreshControl: React.ReactElement<
    React.ComponentProps<typeof RefreshControl>
  >;
  bottomInset: number;
  scrollRef: React.RefObject<ScrollView | null>;
  metaByColumn: Map<
    string,
    {
      open: number | null;
      close: number | null;
      bookable: boolean;
      windowKnown: boolean;
      reason: string | null;
    }
  >;
  freeStateByColumn: Map<string, FreeState>;
  /** The next minute a package here actually starts, null if none is left. */
  nextBookableByColumn: Map<string, number | null>;
  /** Minutes each space stays shut after a booking, for the reset strip. */
  turnaroundByColumn: Map<string, number>;
  isPastDate: boolean;
  onOpenSlot: (
    column: ScheduleColumn,
    bandOrigin: number,
    locationY: number,
  ) => void;
  onStartWalkIn: (column: ScheduleColumn) => void;
  walkInFit: (column: ScheduleColumn) => {
    fits: boolean;
    freeFor: number;
    shortest: number | null;
  };
}) => {
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyHeight = timeWindow.total * pxPerMinute;
  const marks = hourMarks(timeWindow);

  const columnWidths = useMemo(() => {
    const widths = new Map<string, number>();
    for (const column of columns) {
      const label = Math.ceil(column.name.length * HEADER_CHAR_WIDTH) + 24;
      const floor =
        (positionedByColumn.get(column.key) ?? []).length > 0
          ? COLUMN_BOOKED_MIN_WIDTH
          : COLUMN_MIN_WIDTH;
      widths.set(
        column.key,
        Math.min(COLUMN_MAX_WIDTH, Math.max(floor, label)),
      );
    }
    return widths;
  }, [columns, positionedByColumn]);
  const widthOf = (key: string) => columnWidths.get(key) ?? COLUMN_MIN_WIDTH;

  return (
    <View className="flex-1">
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
                style={{ width: widthOf(column.key) }}
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
                {column.roomId != null &&
                  closuresBySpace.has(column.roomId) && (
                    <View className="mt-0.5 px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40">
                      <Text
                        className="text-[9px] font-semibold text-red-600 dark:text-red-400"
                        numberOfLines={1}
                      >
                        {closureLabel(closuresBySpace.get(column.roomId))}
                      </Text>
                    </View>
                  )}
                {(() => {
                  const state = freeStateByColumn.get(column.key);
                  const meta = metaByColumn.get(column.key);
                  if (!state || !meta) return null;
                  if (
                    state.kind === "closed" &&
                    column.roomId != null &&
                    closuresBySpace.has(column.roomId)
                  ) {
                    return null;
                  }
                  if (state.kind === "closed") {
                    return (
                      <View className="mt-0.5 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700">
                        <Text
                          className="text-[9px] font-semibold text-gray-500 dark:text-gray-400"
                          numberOfLines={1}
                        >
                          {meta.windowKnown
                            ? (meta.reason ?? "Not bookable")
                            : "Schedule unavailable"}
                        </Text>
                      </View>
                    );
                  }
                  if (state.kind === "booked") {
                    return (
                      <Text
                        className="mt-0.5 text-[9px] font-medium text-gray-500 dark:text-gray-400"
                        numberOfLines={1}
                      >
                        Booked until close
                      </Text>
                    );
                  }
                  if (state.kind === "blocked") {
                    return (
                      <Text
                        className="mt-0.5 text-[9px] font-medium text-gray-500 dark:text-gray-400"
                        numberOfLines={1}
                      >
                        {state.reason}
                      </Text>
                    );
                  }
                  if (state.kind === "day-over") {
                    return (
                      <Text
                        className="mt-0.5 text-[9px] font-medium text-gray-500 dark:text-gray-400"
                        numberOfLines={1}
                      >
                        Closed for the day
                      </Text>
                    );
                  }
                  if (isVenueToday && state.atMinute <= nowMinutes) {
                    const fit = walkInFit(column);
                    return (
                      <Pressable
                        hitSlop={6}
                        onPress={() => onStartWalkIn(column)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          fit.fits
                            ? `Start a walk-in in ${column.name} now`
                            : `Only ${fit.freeFor} min free in ${column.name} before the next booking`
                        }
                      >
                        <Text
                          className={`mt-0.5 text-[9px] font-semibold ${
                            fit.fits
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                          numberOfLines={1}
                        >
                          {fit.fits
                            ? "Free now · start walk-in"
                            : `Free ${fit.freeFor} min · walk-in`}
                        </Text>
                      </Pressable>
                    );
                  }
                  const nextStart = nextBookableByColumn.get(column.key);
                  return nextStart == null ? (
                    <Text
                      className="mt-0.5 text-[9px] font-medium text-gray-500 dark:text-gray-400"
                      numberOfLines={1}
                    >
                      No more starts today
                    </Text>
                  ) : (
                    <Text
                      className="mt-0.5 text-[9px] font-medium text-gray-600 dark:text-gray-300"
                      numberOfLines={1}
                    >
                      Free {minutesToLabel(nextStart)}
                    </Text>
                  );
                })()}
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
          <View
            style={{ width: GUTTER_WIDTH, height: bodyHeight }}
            className="border-r border-gray-200 dark:border-neutral-800"
          >
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
                <Text className="text-[9px] font-bold text-white">
                  {nowLabel}
                </Text>
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
                    style={{ width: widthOf(column.key), height: bodyHeight }}
                    className="relative border-r border-gray-200 dark:border-neutral-800"
                  >
                    {/* Hour gridlines */}
                    {marks.map((mark) => (
                      <View
                        key={mark}
                        style={{
                          position: "absolute",
                          top: (mark - timeWindow.start) * pxPerMinute,
                          left: 0,
                          right: 0,
                        }}
                        className="z-[2] border-t border-gray-100 dark:border-neutral-800"
                      />
                    ))}
                    <GridColumnBackground
                      column={column}
                      breaks={
                        column.roomId != null
                          ? (breaksByRoom.get(column.roomId) ?? [])
                          : []
                      }
                      closure={
                        column.roomId != null
                          ? closuresBySpace.get(column.roomId)
                          : undefined
                      }
                      timeWindow={timeWindow}
                      pxPerMinute={pxPerMinute}
                      meta={
                        metaByColumn.get(column.key) ?? {
                          open: null,
                          close: null,
                          bookable: false,
                          windowKnown: false,
                          reason: null,
                        }
                      }
                      isPastDate={isPastDate}
                      onPressBand={(bandOrigin, locationY) =>
                        onOpenSlot(column, bandOrigin, locationY)
                      }
                    />
                    {/* The space is still being reset here — drawn so the gap
                        after a booking doesn't read as free. */}
                    {(positionedByColumn.get(column.key) ?? []).map((item) => {
                      const turnaround =
                        turnaroundByColumn.get(column.key) ?? 0;
                      const to = Math.min(
                        timeWindow.end,
                        item.endMin + turnaround,
                      );
                      if (turnaround <= 0 || to <= item.endMin) return null;
                      return (
                        <View
                          key={`reset-${item.booking.id}`}
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: (item.endMin - timeWindow.start) * pxPerMinute,
                            height: (to - item.endMin) * pxPerMinute,
                          }}
                          className="z-[3] border-y border-amber-200 bg-amber-100/70 dark:border-amber-900/40 dark:bg-amber-900/20"
                        />
                      );
                    })}
                    {(positionedByColumn.get(column.key) ?? []).map((item) => (
                      <GridBookingBlock
                        key={`b-${item.booking.id}`}
                        item={item}
                        inProgress={
                          isVenueToday &&
                          nowMinutes >= item.startMin &&
                          nowMinutes < item.endMin
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
                  style={{
                    position: "absolute",
                    top: nowTop,
                    left: 0,
                    right: 0,
                  }}
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
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(() => venueToday());
  const [showLegend, setShowLegend] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Saved filters — seeded once from the in-memory view state, persisted back
  // on every change (web parity: readViewState/writeViewState).
  const savedFilters = useRef(readViewState()).current;
  const [categoryFilter, setCategoryFilter] = useState(
    savedFilters.categoryFilter ?? "all",
  );
  const [statusFilter, setStatusFilter] = useState(
    savedFilters.statusFilter ?? "all",
  );
  const [searchInput, setSearchInput] = useState(
    savedFilters.searchInput ?? "",
  );
  // Free time now makes an empty room worth seeing (it's not just a blank
  // column anymore), so this defaults to showing every space, matching the
  // web's post-parity default.
  const [hideEmptySpaces, setHideEmptySpaces] = useState(
    savedFilters.hideEmptySpaces ?? false,
  );
  const [zoomIndex, setZoomIndex] = useState(
    typeof savedFilters.zoomIndex === "number" &&
      savedFilters.zoomIndex >= 0 &&
      savedFilters.zoomIndex < ZOOM_LEVELS.length
      ? savedFilters.zoomIndex
      : DEFAULT_ZOOM_INDEX,
  );

  useEffect(() => {
    writeViewState({
      categoryFilter,
      statusFilter,
      searchInput,
      hideEmptySpaces,
      zoomIndex,
    });
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
  const effectiveLocationId =
    activeLocation.id === "all" ? undefined : activeLocation.id;
  // Day-offs need a concrete location id (no "all locations" query exists for
  // that endpoint): the active selection when there is one, else the caller's
  // own assigned location — so managers/attendants still see their closures.
  const dayOffLocationId =
    effectiveLocationId ?? user?.location_id ?? undefined;

  const { allSpaces, bookings, loading, error, refetch } = useSpaceSchedule(
    selectedKey,
    effectiveLocationId,
  );

  // The day's operating window, from the same server truth the web admin
  // uses. `dayWindow` stays null on failure — never a guessed fallback — so a
  // failed request can only ever make the timeline unclickable, never wrong.
  const { dayWindow, windowLoading } = useScheduleDayWindow(
    selectedKey,
    effectiveLocationId,
  );
  const isPastDate = selectedKey < dateKey(venueToday());

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

  const { counts: weekCounts, refetch: refetchWeekCounts } =
    useWeekBookingCounts(
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

  // Every space for the location, out-of-service ones included — the timeline
  // shows them as unavailable rather than dropping them. This is a display-only
  // list; it never feeds the booking-picker cache (`useSpaces`/`spacesCache`),
  // which stays bookable-only.
  const displaySpaces = useMemo(
    () =>
      effectiveLocationId != null
        ? allSpaces.filter((s) => s.locationId === effectiveLocationId)
        : allSpaces,
    [allSpaces, effectiveLocationId],
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
      categoryFilter !== "all" &&
      categoryOptions.some((o) => o.value === categoryFilter)
        ? categoryFilter
        : "all",
    [categoryFilter, categoryOptions],
  );

  const filteredBookings = useMemo(() => {
    const term = searchInput.trim().toLowerCase();
    return activeBookings.filter((b) => {
      if (
        effectiveCategory !== "all" &&
        (normalizeCategory(b.packageCategory) || UNCATEGORIZED_LABEL) !==
          effectiveCategory
      ) {
        return false;
      }
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (term) {
        const haystack =
          `${b.customerName} ${b.referenceNumber ?? ""} ${b.packageName}`.toLowerCase();
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
        .map((b) => ({
          start: timeToMinutes(b.startTime),
          end: timeToMinutes(b.endTime),
        }))
        .filter((r) => r.end > r.start);
      if (list.length) map.set(space.id, list);
    }
    return map;
  }, [sortedSpaces, currentDayName]);

  // Per-room open/close/bookable, from the authoritative day window — absent
  // entirely (not defaulted) when the window failed to load, or when this
  // particular room has no window (its own signal that it's not bookable).
  const roomWindows = useMemo(() => {
    const map = new Map<
      number,
      {
        open: number | null;
        close: number | null;
        closedAllDay: boolean;
        bookable: boolean;
        reason: string | null;
        interval: number | null;
      }
    >();
    for (const entry of dayWindow?.rooms ?? []) {
      map.set(entry.room_id, {
        open: entry.open_minutes,
        close: entry.close_minutes,
        closedAllDay: entry.closed_all_day,
        bookable: entry.bookable !== false,
        reason: entry.reason,
        interval: entry.interval_minutes ?? null,
      });
    }
    return map;
  }, [dayWindow]);

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
  const windowExtentRef = useRef<{ key: string; window: TimeWindow } | null>(
    null,
  );
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
    const prev =
      windowExtentRef.current?.key === extentKey
        ? windowExtentRef.current.window
        : null;
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

  /**
   * How long a space stays shut after a booking ends — the same gap the
   * server's conflict check enforces. A package with no space attached is
   * never conflict-checked and gets no turnaround, so the grid must not invent
   * one: that would hide starts the booking form still offers.
   */
  const turnaroundFor = useCallback(
    (column: ScheduleColumn): number =>
      column.roomId == null
        ? 0
        : Math.max(0, roomWindows.get(column.roomId)?.interval ?? 0),
    [roomWindows],
  );

  const positionedByColumn = useMemo(
    () =>
      positionBookingsByColumn({
        columns,
        bookings: filteredBookings,
        timeWindow,
        pxPerMinute,
        knownRoomIds,
        // clashes are measured against every live booking, so a filter can't hide one
        activeBookings,
        turnaroundFor,
      }),
    [
      columns,
      filteredBookings,
      timeWindow,
      pxPerMinute,
      knownRoomIds,
      activeBookings,
      turnaroundFor,
    ],
  );

  // Every clashing pair today, derived from every live booking rather than
  // from the currently drawn/filtered blocks — a filter hiding both sides of
  // a clash must not hide the clash itself.
  const columnsForConflicts = useMemo(
    () =>
      buildColumns({
        spaces: sortedSpaces,
        bookings: activeBookings,
        hideEmptySpaces: false,
        knownRoomIds,
      }),
    [sortedSpaces, activeBookings, knownRoomIds],
  );
  const positionedForConflicts = useMemo(
    () =>
      positionBookingsByColumn({
        columns: columnsForConflicts,
        bookings: activeBookings,
        timeWindow,
        pxPerMinute,
        knownRoomIds,
        activeBookings,
        turnaroundFor,
      }),
    [
      columnsForConflicts,
      activeBookings,
      timeWindow,
      pxPerMinute,
      knownRoomIds,
      turnaroundFor,
    ],
  );
  const overlapSummary = useMemo(() => {
    const rows: {
      columnName: string;
      a: ScheduleBooking;
      b: ScheduleBooking;
      overlapMinutes: number;
    }[] = [];
    const seen = new Set<string>();
    for (const column of columnsForConflicts) {
      for (const item of positionedForConflicts.get(column.key) ?? []) {
        for (const clash of item.conflicts) {
          const key = [item.booking.id, clash.booking.id]
            .sort((x, y) => x - y)
            .join("-");
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            columnName: column.name,
            a: item.booking,
            b: clash.booking,
            overlapMinutes: clash.overlapMinutes,
          });
        }
      }
    }
    return rows.sort((x, y) => y.overlapMinutes - x.overlapMinutes);
  }, [columnsForConflicts, positionedForConflicts]);

  // Per-column open/close/bookable, resolved once so the header label, the
  // free band, and the click handler all agree on the same numbers. A room
  // absent from `dayWindow.rooms` (the fetch failed, or hasn't landed yet)
  // stays `windowKnown: false` — drawn if there's a window to draw, but never
  // bookable, so a slow/failed request can't be clicked as if it were real.
  const scheduleMetaByColumn = useMemo(() => {
    const map = new Map<
      string,
      {
        open: number | null;
        close: number | null;
        bookable: boolean;
        windowKnown: boolean;
        reason: string | null;
      }
    >();
    for (const column of columns) {
      if (column.roomId != null) {
        const rw = roomWindows.get(column.roomId);
        const windowKnown = dayWindow != null && rw !== undefined;
        map.set(column.key, {
          open: rw && !rw.closedAllDay ? rw.open : null,
          close: rw && !rw.closedAllDay ? rw.close : null,
          bookable: windowKnown && !rw!.closedAllDay && rw!.bookable,
          windowKnown,
          reason: rw?.reason ?? null,
        });
      } else {
        const packageId = Number(column.key.replace("pkg-", ""));
        const pw = dayWindow?.packages.find((p) => p.package_id === packageId);
        map.set(column.key, {
          open: pw?.open_minutes ?? null,
          close: pw?.close_minutes ?? null,
          bookable: dayWindow != null && !dayWindow.location_closed,
          windowKnown: dayWindow != null,
          reason: null,
        });
      }
    }
    return map;
  }, [columns, roomWindows, dayWindow]);

  // Raw, unclipped booking ranges per column — used for the free-time math,
  // never the filtered/searched list, so a booking hidden by a UI filter can't
  // make its own room look free. Each one runs on past its end for the space's
  // turnaround, so the free band is the band that can actually be booked.
  const occupancyByColumn = useMemo(() => {
    const map = new Map<string, TimeRange[]>();
    for (const b of activeBookings) {
      const key = columnKeyFor(b, knownRoomIds);
      const start = timeToMinutes(b.time);
      const turnaround =
        b.roomId != null && knownRoomIds.has(b.roomId)
          ? Math.max(0, roomWindows.get(b.roomId)?.interval ?? 0)
          : 0;
      const range: TimeRange = {
        startMinutes: start,
        endMinutes: start + Math.max(15, b.durationMinutes) + turnaround,
      };
      const list = map.get(key);
      if (list) list.push(range);
      else map.set(key, [range]);
    }
    return map;
  }, [activeBookings, knownRoomIds, roomWindows]);

  /** Breaks and closures. The server buffers neither, so neither may the grid. */
  const hardRangesFor = useCallback(
    (
      column: ScheduleColumn,
      meta: { open: number | null; close: number | null },
    ): TimeRange[] => {
      const closure =
        column.roomId != null ? spaceClosures.get(column.roomId) : undefined;
      return [
        ...(column.roomId != null
          ? (roomBreaks.get(column.roomId) ?? []).map((b) => ({
              startMinutes: b.start,
              endMinutes: b.end,
              reason: "On break",
            }))
          : []),
        ...(closure && !closure.fullDay
          ? closure.ranges.map((r) => ({
              startMinutes: r.timeStart
                ? timeToMinutes(r.timeStart)
                : (meta.open ?? timeWindow.start),
              endMinutes: r.timeEnd
                ? timeToMinutes(r.timeEnd)
                : (meta.close ?? timeWindow.end),
              reason: "Closed",
            }))
          : []),
      ];
    },
    [roomBreaks, spaceClosures, timeWindow],
  );

  const blockedRangesFor = useCallback(
    (
      column: ScheduleColumn,
      meta: { open: number | null; close: number | null },
    ): TimeRange[] => [
      ...(occupancyByColumn.get(column.key) ?? []),
      ...hardRangesFor(column, meta),
    ],
    [occupancyByColumn, hardRangesFor],
  );

  /**
   * How long this space is really bookable from a minute: a booking must clear
   * the turnaround before the NEXT booking starts. A break or a closure is owed
   * no such gap, so buffering it there would hide starts the booking form still
   * accepts.
   */
  const usableFreeUntil = useCallback(
    (
      column: ScheduleColumn,
      meta: { open: number | null; close: number | null },
      minute: number,
    ): number | null => {
      const open = meta.open ?? timeWindow.start;
      const close = meta.close ?? timeWindow.end;
      const untilBooking = freeUntilMinute(
        open,
        close,
        occupancyByColumn.get(column.key) ?? [],
        minute,
      );
      const untilHard = freeUntilMinute(
        open,
        close,
        hardRangesFor(column, meta),
        minute,
      );
      if (untilBooking === null || untilHard === null) return null;

      const bookingCap =
        untilBooking >= close
          ? untilBooking
          : Math.max(minute, untilBooking - turnaroundFor(column));
      return Math.min(bookingCap, untilHard);
    },
    [occupancyByColumn, hardRangesFor, turnaroundFor, timeWindow],
  );

  const freeFromByColumn = useMemo(() => {
    const map = new Map<string, FreeState>();
    for (const column of columns) {
      const meta = scheduleMetaByColumn.get(column.key);
      if (!meta) continue;
      const from = isVenueToday ? nowMinutes : (meta.open ?? timeWindow.start);
      map.set(
        column.key,
        freeState(
          meta.open,
          meta.close,
          blockedRangesFor(column, meta),
          from,
          meta.bookable,
        ),
      );
    }
    return map;
  }, [
    columns,
    scheduleMetaByColumn,
    blockedRangesFor,
    isVenueToday,
    nowMinutes,
    timeWindow,
  ]);

  // The header says "Free" at the first unoccupied minute, but staff can only
  // actually start a booking at one of the space's real package starts.
  // null means no start is left today — the header must say so, never fall
  // back to naming a time nothing can actually start at.
  const nextBookableByColumn = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const column of columns) {
      const state = freeFromByColumn.get(column.key);
      const meta = scheduleMetaByColumn.get(column.key);
      if (!state || !meta || state.kind !== "free") continue;
      map.set(
        column.key,
        nextBookableFrom({
          column,
          schedule: {
            open: meta.open,
            close: meta.close,
            turnaround: turnaroundFor(column),
          },
          dayWindow,
          occupancy: occupancyByColumn.get(column.key) ?? [],
          hardBlocks: hardRangesFor(column, meta),
          atMinute: state.atMinute,
          isToday: isVenueToday,
          nowMinutes,
        }),
      );
    }
    return map;
  }, [
    columns,
    freeFromByColumn,
    scheduleMetaByColumn,
    turnaroundFor,
    dayWindow,
    occupancyByColumn,
    hardRangesFor,
    isVenueToday,
    nowMinutes,
  ]);

  const roomLocationById = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const s of allSpaces) map.set(s.id, s.locationId);
    return map;
  }, [allSpaces]);

  /**
   * The location of the space that was clicked, never the sidebar's. A company
   * admin looking at every location at once has none selected, and the same
   * package name exists at all ten venues — so the booking form would have
   * nothing to go on.
   */
  const columnLocationId = useCallback(
    (column: ScheduleColumn): number | null => {
      if (column.roomId != null) {
        return roomLocationById.get(column.roomId) ?? null;
      }
      const packageId = Number(column.key.replace("pkg-", ""));
      const entry = dayWindow?.packages.find((p) => p.package_id === packageId);
      return entry?.location_id ?? null;
    },
    [roomLocationById, dayWindow],
  );

  /** Every package valid for this room at this minute — auto-selectable when
   *  there's exactly one, narrowed-list material when there's more. */
  const packagesForColumnSlot = useCallback(
    (column: ScheduleColumn, minute: number): number[] => {
      if (column.virtual) {
        const id = Number(column.key.replace("pkg-", ""));
        return Number.isInteger(id) && id > 0 ? [id] : [];
      }
      if (column.roomId == null) return [];
      const candidates = (dayWindow?.packages ?? []).map((entry) => ({
        packageId: entry.package_id,
        roomIds: entry.room_ids,
        openMinutes: entry.open_minutes,
        closeMinutes: entry.close_minutes,
        closedRanges: (entry.closed_ranges ?? []).map((r) => ({
          startMinutes: r.start_minutes,
          endMinutes: r.end_minutes,
        })),
      }));
      return packagesValidForSlot(candidates, column.roomId, minute);
    },
    [dayWindow],
  );

  const resolvePackageOffer = useCallback(
    (
      column: ScheduleColumn,
      minute: number,
    ): { ids: number[]; autoSelect: number | null } => {
      const ids = packagesForColumnSlot(column, minute);
      const offering = ids.filter((id) => {
        const entry = dayWindow?.packages.find((p) => p.package_id === id);
        return entry?.start_minutes
          ? entry.start_minutes.includes(minute)
          : true;
      });
      const lone = offering.length === 1 ? offering[0] : null;
      return {
        ids,
        autoSelect:
          lone ?? (offering.length === 0 && ids.length === 1 ? ids[0] : null),
      };
    },
    [packagesForColumnSlot, dayWindow],
  );

  /**
   * The minute a tap means, resolved by the very function the Calendar tab's
   * day grid uses — the two screens drawing the same day must never send the
   * booking form to different minutes for the same tap. It lands on a 5-minute
   * grid, not on the customer's package start times. Null when no start is
   * left here at all: booked out to closing, or too late for anything to fit.
   */
  const resolveClickMinute = useCallback(
    (
      column: ScheduleColumn,
      meta: { open: number | null; close: number | null },
      rawMinute: number,
    ): number | null =>
      resolveSlotMinute({
        column,
        schedule: {
          open: meta.open ?? timeWindow.start,
          close: meta.close ?? timeWindow.end,
        },
        dayWindow,
        blocked: blockedRangesFor(column, meta),
        rawMinute,
      }),
    [dayWindow, blockedRangesFor, timeWindow],
  );

  const navigateToMinute = useCallback(
    (
      column: ScheduleColumn,
      minute: number,
      options?: { walkInOverride?: boolean },
    ) => {
      const meta = scheduleMetaByColumn.get(column.key);
      if (!meta || meta.open == null || meta.close == null) return;

      const { ids: candidates, autoSelect } = resolvePackageOffer(
        column,
        minute,
      );
      const locationId =
        columnLocationId(column) ??
        effectiveLocationId ??
        dayWindow?.location_id ??
        null;
      // the customer grid does not contain 4:05, so the booking form has to be
      // told to keep the minute instead of hunting for an offered start
      const offCustomerGrid = !columnStarts(column, dayWindow).includes(minute);

      router.push({
        pathname: CREATE_BOOKING_PATH,
        params: buildBookingParams({
          locationId,
          date: selectedKey,
          minute,
          roomId: column.roomId ?? null,
          packageId: autoSelect,
          packageIds: candidates,
          freeUntilMinute: usableFreeUntil(column, meta, minute),
          nextBookingMinute: nextBookingMinuteFrom({
            occupancy: occupancyByColumn.get(column.key) ?? [],
            minute,
          }),
          walkIn: isVenueToday || offCustomerGrid,
          walkInOverride: options?.walkInOverride ?? false,
        }),
      });
    },
    [
      dayWindow,
      resolvePackageOffer,
      columnLocationId,
      usableFreeUntil,
      effectiveLocationId,
      selectedKey,
      scheduleMetaByColumn,
      isVenueToday,
      occupancyByColumn,
    ],
  );

  const openBookingForSlot = useCallback(
    (column: ScheduleColumn, bandOrigin: number, locationY: number) => {
      const meta = scheduleMetaByColumn.get(column.key);
      if (!meta || meta.open == null || meta.close == null) return;

      const rawMinute = minuteAtOffset(bandOrigin, locationY, pxPerMinute);
      const minute = resolveClickMinute(column, meta, rawMinute);
      // Nothing free between here and closing — never hand the booking form a
      // minute this grid already knows it would refuse.
      if (minute === null) return;

      navigateToMinute(column, minute);
    },
    [pxPerMinute, resolveClickMinute, scheduleMetaByColumn, navigateToMinute],
  );

  // A walk-in runs for the package's duration, so it only really fits if a
  // package that can actually start now clears before the next booking.
  const walkInFit = useCallback(
    (
      column: ScheduleColumn,
    ): {
      fits: boolean;
      freeFor: number;
      shortest: number | null;
      packageName: string | null;
    } => {
      const meta = scheduleMetaByColumn.get(column.key);
      const close = meta?.close ?? timeWindow.end;
      const until = meta
        ? usableFreeUntil(column, meta, nowMinutes)
        : null;
      const freeFor = Math.max(0, (until ?? close) - nowMinutes);

      const startable = new Set(packagesForColumnSlot(column, nowMinutes));
      const candidates = (dayWindow?.packages ?? [])
        .filter(
          (p) => startable.has(p.package_id) && (p.duration_minutes ?? 0) > 0,
        )
        // it must finish inside its OWN schedule — a room closes when its latest package does
        .filter((p) => nowMinutes + (p.duration_minutes as number) <= p.close_minutes)
        .sort((a, b) => (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0));
      const shortestEntry = candidates[0] ?? null;
      const shortest = shortestEntry?.duration_minutes ?? null;

      return {
        fits: shortest !== null && shortest <= freeFor,
        freeFor,
        shortest,
        packageName: shortestEntry?.name ?? null,
      };
    },
    [scheduleMetaByColumn, timeWindow, usableFreeUntil, nowMinutes, packagesForColumnSlot, dayWindow],
  );

  const startWalkIn = useCallback(
    (column: ScheduleColumn) => {
      const fit = walkInFit(column);
      // A walk-in records when the guests actually went in, on a 5-minute
      // grid — never one of the package's own scheduled start times.
      const walkInMinute =
        Math.floor(nowMinutes / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES;

      if (fit.fits || fit.shortest === null) {
        navigateToMinute(column, walkInMinute);
        return;
      }

      const endMinute = walkInMinute + fit.shortest;
      const packageName = fit.packageName ?? "the shortest package here";

      const clash =
        activeBookings
          .filter((b) => columnKeyFor(b, knownRoomIds) === column.key)
          .map((b) => ({ booking: b, start: timeToMinutes(b.time) }))
          .filter(({ start }) => start >= walkInMinute && start < endMinute)
          .sort((a, b) => a.start - b.start)[0]?.booking ?? null;

      const lines = [
        `${column.name} is free for ${fit.freeFor} min, but ${packageName} needs ${fit.shortest} min.`,
        "",
        `Walk-in would run ${minutesToLabel(walkInMinute)} – ${minutesToLabel(endMinute)}`,
        `Space is free for ${fit.freeFor} min`,
        `Overlap: ${fit.shortest - fit.freeFor} min`,
      ];
      if (clash) {
        lines.push(
          "",
          `Clashes with ${clash.customerName || "Walk-in"}`,
          `Their booking: ${minutesToLabel(timeToMinutes(clash.time))} · ${clash.packageName || "No package"}`,
        );
      }

      Alert.alert("This walk-in runs past the next booking", lines.join("\n"), [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start anyway",
          onPress: () =>
            navigateToMinute(column, walkInMinute, { walkInOverride: true }),
        },
      ]);
    },
    [
      walkInFit,
      navigateToMinute,
      nowMinutes,
      activeBookings,
      knownRoomIds,
    ],
  );

  const turnaroundByColumn = useMemo(() => {
    const map = new Map<string, number>();
    for (const column of columns) map.set(column.key, turnaroundFor(column));
    return map;
  }, [columns, turnaroundFor]);

  const nowTop = useMemo(
    () => nowLineTop(nowMinutes, timeWindow, pxPerMinute, isVenueToday),
    [nowMinutes, timeWindow, pxPerMinute, isVenueToday],
  );

  const daySummary = useMemo(
    () => computeDaySummary(filteredBookings, knownRoomIds),
    [filteredBookings, knownRoomIds],
  );

  const hasActiveFilters =
    effectiveCategory !== "all" ||
    statusFilter !== "all" ||
    searchInput.trim() !== "";
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
        items.push({
          kind: "booking",
          start: pb.startMin,
          booking: pb.booking,
        });
      }
      if (column.roomId != null) {
        const space = sortedSpaces.find((s) => s.id === column.roomId);
        for (const brk of space?.breaks ?? []) {
          if (brk.days.includes(currentDayName)) {
            items.push({
              kind: "break",
              start: timeToMinutes(brk.startTime),
              brk,
            });
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
    scrollRef.current.scrollTo({
      y: Math.max(0, nowTop - 160),
      animated: true,
    });
  };

  // Auto-scroll to "now" (or to the top) once per day change, after the day's
  // data has loaded.
  const lastScrolledDayRef = useRef("");
  useEffect(() => {
    if (loading || !scrollRef.current) return;
    if (lastScrolledDayRef.current === selectedKey) return;
    lastScrolledDayRef.current = selectedKey;
    if (nowTop !== null) {
      scrollRef.current.scrollTo({
        y: Math.max(0, nowTop - 160),
        animated: false,
      });
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

  // A room with nothing booked still has a full free-time band to show, so
  // only "no spaces at all" takes over the whole screen now — a quiet day or a
  // filtered-out one just gets a small banner above the still-visible grid.
  const noSchedule = !loading && !error && activeBookings.length === 0;
  const noMatches =
    !loading &&
    !error &&
    activeBookings.length > 0 &&
    filteredBookings.length === 0;

  const renderNoSpaces = () => (
    <View className="px-5 pt-6">
      <View className="bg-white dark:bg-neutral-900 rounded-2xl p-8 items-center border border-gray-100 dark:border-neutral-800">
        <View className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 items-center justify-center mb-3">
          <Feather name="calendar" size={28} color={PRIMARY} />
        </View>
        <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
          No Spaces To Show
        </Text>
        <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
          No spaces are configured for this location, so there is no schedule to
          display.
        </Text>
      </View>
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
      <View className="bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 px-5 pt-4 pb-3.5">
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
                isVenueToday
                  ? "bg-[#0644C7]"
                  : "bg-[#0644C7]/10 dark:bg-[#0644C7]/20"
              }`}
            >
              <Feather
                name="sun"
                size={14}
                color={isVenueToday ? "#FFFFFF" : PRIMARY}
              />
              <Text
                className={`text-sm font-semibold ${isVenueToday ? "text-white" : "text-[#0644C7]"}`}
              >
                Today
              </Text>
            </Pressable>
            {nowTop !== null && (
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
                      selected
                        ? "text-[#0644C7]"
                        : "text-gray-700 dark:text-gray-200"
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
            <Text className="font-semibold text-gray-900 dark:text-white">
              {daySummary.count}
            </Text>{" "}
            bookings
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            <Text className="font-semibold text-gray-900 dark:text-white">
              {daySummary.guests}
            </Text>{" "}
            guests
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
            <Feather
              name="filter"
              size={16}
              color={statusFilter !== "all" ? PRIMARY : "#6b7280"}
            />
          </Pressable>
          <Pressable
            onPress={() => setHideEmptySpaces((v) => !v)}
            accessibilityLabel={
              hideEmptySpaces ? "Show empty spaces" : "Hide empty spaces"
            }
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
                <Feather
                  name="zoom-out"
                  size={16}
                  color={zoomIndex === 0 ? "#D1D5DB" : "#6b7280"}
                />
              </Pressable>
              <Pressable
                onPress={() =>
                  setZoomIndex((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))
                }
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                className="p-2 rounded-r-lg border-l border-gray-200 dark:border-neutral-700"
              >
                <Feather
                  name="zoom-in"
                  size={16}
                  color={
                    zoomIndex === ZOOM_LEVELS.length - 1 ? "#D1D5DB" : "#6b7280"
                  }
                />
              </Pressable>
            </View>
          )}
          {hasActiveFilters && (
            <Pressable
              onPress={clearFilters}
              className="p-2 rounded-lg"
              accessibilityLabel="Clear filters"
            >
              <Feather name="x" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Error */}
      {!loading && error && (
        <View className="mx-5 mt-4 bg-red-50 border border-red-100 rounded-2xl p-5">
          <Text className="text-red-600 font-semibold">
            Something went wrong
          </Text>
          <Text className="text-red-500 text-sm mt-1">{error}</Text>
        </View>
      )}

      {/* Body */}
      {loading || windowLoading ? (
        <View className="px-5 pt-6">
          <CalendarDaySkeleton />
        </View>
      ) : error ? null : columns.length === 0 ? (
        <ScrollView refreshControl={refreshControl}>
          {renderNoSpaces()}
        </ScrollView>
      ) : (
        <>
          {noSchedule && (
            <View className="flex-row items-center gap-2 border-b border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-2.5">
              <Feather name="calendar" size={14} color="#9ca3af" />
              <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
                No bookings for {MONTH_NAMES[selectedDate.getMonth()]}{" "}
                {selectedDate.getDate()}, {selectedDate.getFullYear()} — every
                space below is open for its scheduled hours.
              </Text>
            </View>
          )}
          {noMatches && (
            <View className="flex-row flex-wrap items-center gap-2 border-b border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-2.5">
              <Feather name="search" size={14} color="#9ca3af" />
              <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
                {activeBookings.length}{" "}
                {activeBookings.length === 1 ? "booking is" : "bookings are"}{" "}
                scheduled this day, but none match the current filters.
              </Text>
              <Pressable
                onPress={clearFilters}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-neutral-600"
              >
                <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Clear filters
                </Text>
              </Pressable>
            </View>
          )}
          {overlapSummary.length > 0 && (() => {
            const doubleBooked = overlapSummary.filter((r) => r.overlapMinutes > 0);
            const backToBack = overlapSummary.filter((r) => r.overlapMinutes === 0);
            const tone = doubleBooked.length > 0;
            return (
              <View
                className={`flex-row items-start gap-2 border-b px-4 py-2.5 ${
                  tone
                    ? "border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/10"
                    : "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10"
                }`}
              >
                <Feather
                  name="alert-triangle"
                  size={14}
                  color={tone ? "#e11d48" : "#d97706"}
                  style={{ marginTop: 2 }}
                />
                <View className="flex-1">
                  <Text
                    className={`text-sm font-semibold ${
                      tone
                        ? "text-rose-900 dark:text-rose-300"
                        : "text-amber-900 dark:text-amber-300"
                    }`}
                  >
                    {doubleBooked.length > 0 &&
                      `${doubleBooked.length} double-booked ${doubleBooked.length === 1 ? "space" : "spaces"}`}
                    {doubleBooked.length > 0 && backToBack.length > 0 && " · "}
                    {backToBack.length > 0 &&
                      `${backToBack.length} back-to-back with no turnaround`}
                  </Text>
                  {overlapSummary.map((row) => (
                    <Text
                      key={`${row.a.id}-${row.b.id}`}
                      className={`mt-0.5 text-xs ${
                        tone
                          ? "text-rose-800 dark:text-rose-400"
                          : "text-amber-800 dark:text-amber-400"
                      }`}
                    >
                      {row.columnName}: {row.a.customerName || "Walk-in"} at{" "}
                      {minutesToLabel(timeToMinutes(row.a.time))}{" "}
                      {row.overlapMinutes > 0
                        ? `overlaps ${row.b.customerName || "Walk-in"} at ${minutesToLabel(timeToMinutes(row.b.time))} by ${row.overlapMinutes} min`
                        : `ends as ${row.b.customerName || "Walk-in"} starts at ${minutesToLabel(timeToMinutes(row.b.time))} — no time to reset the space`}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })()}
          {viewMode === "grid" ? (
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
              metaByColumn={scheduleMetaByColumn}
              freeStateByColumn={freeFromByColumn}
              nextBookableByColumn={nextBookableByColumn}
              turnaroundByColumn={turnaroundByColumn}
              isPastDate={isPastDate}
              onOpenSlot={openBookingForSlot}
              onStartWalkIn={startWalkIn}
              walkInFit={walkInFit}
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
                    closure={
                      column.roomId != null
                        ? spaceClosures.get(column.roomId)
                        : undefined
                    }
                    onBookingPress={setSelectedBookingId}
                  />
                ))}
              </View>
            </ScrollView>
          )}
        </>
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
                return (
                  <View
                    key={`e-${i}`}
                    style={{ width: `${100 / 7}%` }}
                    className="aspect-square"
                  />
                );
              }
              const key = dateKey(day);
              const selected = key === selectedKey;
              const dToday = key === todayKey;
              return (
                <View
                  key={key}
                  style={{ width: `${100 / 7}%` }}
                  className="aspect-square p-0.5"
                >
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

      {/* Status filter */}
      <BottomSheet
        visible={showStatusPicker}
        onClose={() => setShowStatusPicker(false)}
        title="Status"
      >
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
                    selected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
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
          <View className="flex-row items-center gap-2.5 mb-2">
            <View className="w-6 h-6 rounded-md bg-gray-100 dark:bg-neutral-800 border border-dashed border-gray-300 dark:border-neutral-600 items-center justify-center">
              <Feather name="coffee" size={12} color="#6b7280" />
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Break Time
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5 mb-2">
            <View
              style={{ width: 24, height: 3 }}
              className="rounded-full bg-red-500"
            />
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Current time (Michigan)
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5 mb-2">
            <View className="px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
              <Text className="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                No room
              </Text>
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Booking not assigned to a space
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <View className="w-6 h-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40" />
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Space closed
            </Text>
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
