import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { CalendarCustomerSearch } from "../../components/ui/CalendarCustomerSearch";
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
  buildBookingParams,
  CREATE_BOOKING_PATH,
} from "../../lib/bookings/bookingPrefill";
import {
  bandGeometry,
  minuteAtOffset,
  WALK_IN_SNAP_MINUTES,
  type TimeRange,
} from "../../lib/bookings/freeTime";
import {
  buildColumns,
  columnKeyFor,
  columnsSpanVenues,
  timeToMinutes,
  type ScheduleColumn,
} from "../../lib/bookings/spaceScheduleGrid";
import {
  computeSlotWindow,
  daySlotHeight,
  distinctStartMinutes,
  placeByColumn,
  placementMinutes,
  placementStretchSpans,
  SLOT_MINUTES,
  type SlotPlacement,
} from "../../lib/calendar/dayGrid";
import {
  buildMinuteScale,
  type MinuteScale,
} from "../../lib/bookings/minuteScale";
import {
  buildColumnSchedules,
  buildOccupancy,
  columnStatusFor,
  hardBlocksFor,
  OCCUPYING_STATUSES,
  resolveSlotTap,
  resolveWalkInTap,
  walkInFit,
  type ColumnSchedule,
  type ColumnStatus,
  type SlotTap,
} from "../../lib/calendar/dayGridSlots";
import { noteFlagsOf, noteSummaryOf } from "../../lib/bookings/bookingNotes";
import { packageColor } from "../../lib/calendar/packageColors";
import { venueNow, venueToday } from "../../lib/date/venueTime";
import { useCalendarBookings } from "../../lib/hooks/useCalendarBookings";
import { useAttractionPurchases } from "../../lib/hooks/useAttractionPurchases";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { useNotifications } from "../../lib/hooks/useNotifications";
import { useScheduleDayWindow } from "../../lib/hooks/useScheduleDayWindow";
import { useSpaces } from "../../lib/hooks/useSpaceSchedule";
import type { CalendarBooking } from "../../services/bookingsService";
import type { PurchaseRow } from "../../services/attractionPurchasesService";
import {
  AlertTriangle,
  Ban,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
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
  MessageSquare,
  StickyNote,
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

/** How a space's break days arrive from the API. */
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// Geometry of the day / week grids. Both put a fixed time gutter on the left
// and scroll their columns sideways, so the widths below are what one column
// costs the reader in horizontal scrolling.
const TIME_COL_WIDTH = 72;
const DAY_COL_WIDTH = 148;
const WEEK_COL_WIDTH = 200;
/** Tall enough for the space's name, its location and its schedule status. */
const GRID_HEADER_HEIGHT = 66;
/** One unbooked 15-minute row of the day grid, held to the 3px-a-minute floor. */
const SLOT_HEIGHT = daySlotHeight(SLOT_MINUTES, 44);
const PX_PER_MINUTE = SLOT_HEIGHT / SLOT_MINUTES;
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
  confirmed:
    "bg-green-50/70 dark:bg-green-900/10 border-green-200 dark:border-green-900/40",
  pending:
    "bg-amber-50/70 dark:bg-amber-900/10 border-amber-300 dark:border-amber-900/40",
  "checked-in":
    "bg-indigo-50/70 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-900/40",
  completed:
    "bg-blue-50/70 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/40",
  cancelled:
    "bg-red-50/70 dark:bg-red-900/10 border-red-200 dark:border-red-900/40",
};
const bookingTone = (status: string) =>
  BOOKING_TONE[status] ?? BOOKING_TONE.pending;

const STATUS_BADGE: Record<string, string> = {
  confirmed:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "checked-in":
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400",
  refunded:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
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

/** "3:30 PM – 9:30 PM", the hours a free band actually covers. */
const rangeLabel = (from: number, to: number): string =>
  `${slotLabel(from)} – ${slotLabel(to)}`;

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
  <View
    className={`flex-row items-center gap-1 rounded-md px-1 py-0.5 mb-0.5 ${bg}`}
  >
    <Icon size={9} color={tint} />
    <Text
      className="text-[10px] font-bold"
      style={{ color: tint }}
      numberOfLines={1}
    >
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
          <Text
            className="text-xs font-semibold"
            style={{ color: style.color }}
          >
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

      <Text
        className="text-sm text-gray-500 dark:text-gray-400 mt-0.5"
        numberOfLines={1}
      >
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
            <Text
              className="text-sm text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
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
/** The grey "nothing more to say" line under a column's name. */
const DayStatusText = ({ children }: { children: React.ReactNode }) => (
  <Text
    className="mt-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400"
    numberOfLines={1}
  >
    {children}
  </Text>
);

/**
 * What a space's column header says about the rest of its day — the web
 * admin's day grid header, line for line: when it is next free, whether a
 * walk-in fits right now, or why it is shut.
 */
const DayColumnStatus = ({
  status,
  onWalkIn,
}: {
  status: ColumnStatus | undefined;
  onWalkIn: () => void;
}) => {
  if (!status) return null;

  switch (status.kind) {
    case "closed":
      return (
        <View className="flex-row items-center gap-1 mt-0.5">
          <Ban size={10} color="#9ca3af" />
          <Text
            className="text-[10px] font-medium text-gray-500 dark:text-gray-400 flex-shrink"
            numberOfLines={1}
          >
            {status.reason}
          </Text>
        </View>
      );
    case "booked":
      return <DayStatusText>Booked until close</DayStatusText>;
    case "blocked":
      return <DayStatusText>{status.reason}</DayStatusText>;
    case "day-over":
      return <DayStatusText>Closed for the day</DayStatusText>;
    case "no-starts":
      return <DayStatusText>No more starts today</DayStatusText>;
    case "free":
      return (
        <Text
          className="mt-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-300"
          numberOfLines={1}
        >
          Free {slotLabel(status.atMinute)}
        </Text>
      );
    case "walk-in":
      // A walk-in that would run past the next booking still opens the form —
      // it travels with the free stretch, so the form is the one that refuses
      // a package too long to fit.
      return (
        <Pressable
          onPress={onWalkIn}
          accessibilityRole="button"
          accessibilityLabel="Start a walk-in booking"
          className="mt-0.5 px-1 py-0.5 rounded active:opacity-60"
        >
          <Text
            className={`text-[10px] font-semibold ${
              status.fits
                ? "text-green-700 dark:text-green-400"
                : "text-amber-700 dark:text-amber-400"
            }`}
            numberOfLines={1}
          >
            {status.fits
              ? "Free now · walk-in"
              : `Free ${status.freeFor} min · walk-in`}
          </Text>
        </Pressable>
      );
  }
};

const DayBookingBlock = ({
  placement,
  scale,
  windowStart,
  onPress,
}: {
  placement: SlotPlacement<CalendarBooking>;
  scale: MinuteScale;
  windowStart: number;
  onPress: () => void;
}) => {
  const booking = placement.item;
  const tone = packageColor(booking.packageName);
  const status = statusStyle(booking.status);
  const slots = placementMinutes(placement, { start: windowStart });
  const height = scale.spanHeight(slots.from, slots.to) - 4;
  const doubleBooked = placement.conflicts.some((c) => c.overlapMinutes > 0);
  const clashing = placement.conflicts.length > 0;
  const noteFlags = noteFlagsOf(booking);
  const noteSummary = noteSummaryOf(booking);
  // below this the block's own text is already clipped, so an icon would only steal from it
  const showNotes = (noteFlags.guest || noteFlags.staff) && height >= 20;
  // a tiny block has room for one badge: the staff note wins, being rarer and written for staff
  const tightNotes = height < 30 && noteFlags.guest && noteFlags.staff;
  // one slot, even stretched to carry its package line, is still short on room
  const short = height < 60;
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        top: scale.at(slots.from) + 2,
        height,
        left: `${(100 / placement.laneCount) * placement.lane}%`,
        width: `${100 / placement.laneCount}%`,
        backgroundColor: tone.bg,
        borderLeftColor: doubleBooked ? "#f43f5e" : clashing ? "#fbbf24" : status.color,
      }}
      className={`rounded-md border-l-4 px-1.5 overflow-hidden active:opacity-80 ${short ? "py-0.5" : "py-1"} ${
        doubleBooked ? "ring-2 ring-rose-500" : clashing ? "ring-2 ring-amber-400" : ""
      }`}
      accessibilityRole="button"
      accessibilityLabel={`${booking.customerName}, ${booking.packageName}, ${formatTime(booking.time)}${
        clashing ? (doubleBooked ? ", overlaps another booking" : ", no turnaround before the next booking") : ""
      }${noteSummary ? `, ${noteSummary}` : ""}`}
    >
      {/* one rail in the corner: siblings, so notes and the clash badge can never cover each other */}
      {(clashing || showNotes) && (
        <View className="absolute top-0 right-0 z-10 flex-row items-center gap-0.5 rounded-bl bg-white/70 pl-px">
          {showNotes && noteFlags.staff && (
            <View className="rounded bg-amber-100 px-0.5 py-px">
              <StickyNote size={7} color="#b45309" strokeWidth={2.5} />
            </View>
          )}
          {showNotes && noteFlags.guest && !tightNotes && (
            <View className="rounded bg-blue-100 px-0.5 py-px">
              <MessageSquare size={7} color="#1d4ed8" strokeWidth={2.5} />
            </View>
          )}
          {clashing && (
            <View
              className={`flex-row items-center gap-0.5 rounded-bl px-1 py-px ${
                doubleBooked ? "bg-rose-500" : "bg-amber-500"
              }`}
            >
              <AlertTriangle size={7} color="#FFFFFF" />
              {height >= 18 && !showNotes && (
                <Text className="text-[7px] font-bold uppercase text-white">
                  {doubleBooked ? "Overlap" : "No gap"}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
      {height >= 34 && (
        <Text
          className="text-[10px] font-semibold"
          style={{ color: tone.text }}
          numberOfLines={1}
        >
          {slotLabel(placement.startMin)}–{slotLabel(placement.endMin)}
          {placement.clipped ? "+" : ""}
        </Text>
      )}
      {height >= 18 && (
        <Text className="text-xs font-bold text-gray-900" numberOfLines={1}>
          {booking.customerName}
        </Text>
      )}
      {height >= 36 && (
        <Text
          className="text-[10px]"
          style={{ color: tone.text }}
          numberOfLines={1}
        >
          {booking.roomName || booking.packageName}
        </Text>
      )}
      {height > 72 && (
        <Text
          className="text-[10px] font-semibold mt-auto"
          style={{ color: status.color }}
          numberOfLines={1}
        >
          {status.label}
        </Text>
      )}
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
            <DayBookingCard
              key={b.id}
              booking={b}
              onPress={() => onBooking(b.id)}
            />
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
            <AttractionCard
              key={p.id}
              purchase={p}
              onPress={() => onAttraction(p.id)}
            />
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

export type SlotMarkerHandle = {
  show: (columnIndex: number, minute: number, picking: boolean) => void;
  hide: () => void;
};

/**
 * The "you are here" marker on a free band: which minute a lift would book.
 *
 * It owns its own position instead of taking it from the screen's state. A drag updates it many
 * times, and the day grid is thousands of views — re-rendering the screen for each move is what
 * made picking a time stutter. The parent pushes updates in through the ref, so a drag repaints
 * this one small view and nothing else.
 *
 * Drawn as a sibling of the columns rather than inside one, so there is a single marker on the
 * grid however many spaces are on it.
 */
const SlotMarker = React.forwardRef<
  SlotMarkerHandle,
  {
    columnWidth: number;
    /** Where a column's body starts, under its header. */
    topOffset: number;
    scale: MinuteScale;
    spanMinutes: number;
  }
>(({ columnWidth, topOffset, scale, spanMinutes }, ref) => {
  const [at, setAt] = useState<{
    column: number;
    minute: number;
    picking: boolean;
  } | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      show: (column, minute, picking) =>
        setAt((prev) =>
          prev &&
          prev.column === column &&
          prev.minute === minute &&
          prev.picking === picking
            ? prev
            : { column, minute, picking },
        ),
      hide: () => setAt((prev) => (prev === null ? prev : null)),
    }),
    [],
  );

  if (!at) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: at.column * columnWidth,
        width: columnWidth,
        top: topOffset + scale.at(at.minute),
        height: Math.max(16, scale.spanHeight(at.minute, at.minute + spanMinutes)),
      }}
      className={`z-30 flex-row items-center gap-1 border-y px-1 ${
        at.picking
          ? "border-solid border-[#0644C7] bg-blue-50/95 dark:bg-blue-900/70"
          : "border-dashed border-gray-400 bg-white/70 dark:border-neutral-500 dark:bg-black/60"
      }`}
    >
      <Plus size={11} color={at.picking ? "#0644C7" : "#4b5563"} />
      <Text
        className={`text-[10px] font-bold leading-tight ${
          at.picking
            ? "text-[#0644C7] dark:text-blue-300"
            : "text-gray-700 dark:text-gray-200"
        }`}
        numberOfLines={1}
      >
        {slotLabel(at.minute)}
      </Text>
    </View>
  );
});
SlotMarker.displayName = "SlotMarker";

const Calendar = () => {
  const insets = useSafeAreaInsets();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  // The Day grid is what staff open the calendar for — it is the one view that
  // shows the spaces, what is free and where a booking can still go.
  const [viewMode, setViewMode] = useState<ViewMode>("day");
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

  /** True when the customer search box is empty or the row matches it. */
  const matchesSearch = useCallback(
    (name: string, phone: string | null) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return `${name} ${phone ?? ""}`.toLowerCase().includes(term);
    },
    [search],
  );

  const visibleBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          showsCategory(categoryKeyOf(b.packageCategory)) &&
          matchesSearch(b.customerName, b.customerPhone),
      ),
    [bookings, showsCategory, matchesSearch],
  );
  const visiblePurchases = useMemo(
    () =>
      purchasesInWindow.filter(
        (p) =>
          showsCategory(categoryKeyOf(p.category)) &&
          matchesSearch(p.customerName, p.phone),
      ),
    [purchasesInWindow, showsCategory, matchesSearch],
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

  const dayBookings = useMemo(
    () => byDate[startDate]?.bookings ?? [],
    [byDate, startDate],
  );
  const dayAttractions = useMemo(
    () => byDate[startDate]?.attractions ?? [],
    [byDate, startDate],
  );

  // Every occupying booking for the day, not the category/search-filtered
  // list — a booking (or a clash between two of them) hidden by a filter
  // must not disappear from occupancy or conflict detection.
  const dayActiveBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.date === startDate && OCCUPYING_STATUSES.has(b.status),
      ),
    [bookings, startDate],
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
  // The day's operating window, from the same server truth the web admin's day
  // grid reads. Only fetched in Day view, and left null on failure rather than
  // guessed — a failed request can make the grid inert, never wrong.
  const { dayWindow: scheduleWindow } = useScheduleDayWindow(
    viewMode === "day" ? startDate : null,
  );

  /** The venue a column belongs to — a virtual column's comes from its package. */
  const columnLocationId = useCallback(
    (column: ScheduleColumn): number | null => {
      if (column.roomId != null) {
        return spaceById.get(column.roomId)?.locationId ?? null;
      }
      const packageId = Number(column.key.replace("pkg-", ""));
      return (
        scheduleWindow?.packages.find((p) => p.package_id === packageId)
          ?.location_id ?? null
      );
    },
    [spaceById, scheduleWindow],
  );
  const showColumnLocation = useMemo(
    () => columnsSpanVenues(dayColumns.map(columnLocationId)),
    [dayColumns, columnLocationId],
  );

  // The venue's own clock, ticked while Day view is open, so "Free now" and the
  // walk-in fit stay true without leaving and re-entering the tab.
  const [nowTick, setNowTick] = useState(() => venueNow());
  useEffect(() => {
    if (viewMode !== "day") return;
    setNowTick(venueNow());
    const timer = setInterval(() => setNowTick(venueNow()), 60_000);
    return () => clearInterval(timer);
  }, [viewMode]);
  const nowMinutes = nowTick.hour * 60 + nowTick.minute;
  const venueTodayKey = dateKey(venueToday());
  const isVenueToday = startDate === venueTodayKey;
  const isPastDate = startDate < venueTodayKey;

  const daySchedules = useMemo(
    () =>
      buildColumnSchedules({ columns: dayColumns, dayWindow: scheduleWindow }),
    [dayColumns, scheduleWindow],
  );

  /** Each space's breaks for this weekday, in minutes. */
  const dayBreaks = useMemo(() => {
    const weekday = WEEKDAY_KEYS[new Date(`${startDate}T00:00:00`).getDay()];
    const map = new Map<number, { start: number; end: number }[]>();
    for (const space of spaces) {
      const ranges = space.breaks
        .filter((b) => b.days.includes(weekday))
        .map((b) => ({
          start: timeToMinutes(b.startTime),
          end: timeToMinutes(b.endTime),
        }))
        .filter((r) => r.end > r.start);
      if (ranges.length) map.set(space.id, ranges);
    }
    return map;
  }, [spaces, startDate]);

  // Deliberately built from every occupying booking on the day, not the
  // searched/filtered list: a booking hidden by a filter must not make its own
  // space look free.
  const dayOccupancy = useMemo(
    () =>
      buildOccupancy({
        bookings: dayActiveBookings,
        schedules: daySchedules,
        knownRoomIds,
      }),
    [dayActiveBookings, daySchedules, knownRoomIds],
  );

  const dayHardBlocks = useMemo(() => {
    const map = new Map<string, TimeRange[]>();
    for (const column of dayColumns) {
      const schedule = daySchedules.get(column.key);
      if (!schedule) continue;
      map.set(
        column.key,
        hardBlocksFor(
          schedule,
          column.roomId != null ? (dayBreaks.get(column.roomId) ?? []) : [],
        ),
      );
    }
    return map;
  }, [dayColumns, daySchedules, dayBreaks]);

  const dayStatuses = useMemo(() => {
    const map = new Map<string, ColumnStatus>();
    // Nothing to say until the window lands — an empty map keeps the header on
    // its name alone rather than flashing "Schedule unavailable".
    if (!scheduleWindow) return map;
    for (const column of dayColumns) {
      const schedule = daySchedules.get(column.key);
      if (!schedule) continue;
      map.set(
        column.key,
        columnStatusFor({
          column,
          schedule,
          dayWindow: scheduleWindow,
          occupancy: dayOccupancy.get(column.key) ?? [],
          hardBlocks: dayHardBlocks.get(column.key) ?? [],
          isToday: isVenueToday,
          nowMinutes,
          bookings: dayActiveBookings,
        }),
      );
    }
    return map;
  }, [
    dayColumns,
    daySchedules,
    scheduleWindow,
    dayOccupancy,
    dayHardBlocks,
    isVenueToday,
    nowMinutes,
    dayActiveBookings,
  ]);

  /** The widest open→close across the day's columns, so a space that is open
   *  but unbooked still draws the hours it is free. */
  const dayBounds = useMemo(() => {
    let start: number | null = null;
    let end: number | null = null;
    for (const schedule of daySchedules.values()) {
      if (schedule.open != null && (start === null || schedule.open < start)) {
        start = schedule.open;
      }
      if (schedule.close != null && (end === null || schedule.close > end)) {
        end = schedule.close;
      }
    }
    return { start, end };
  }, [daySchedules]);

  const dayWindow = useMemo(
    () => computeSlotWindow(dayBookings, dayBounds),
    [dayBookings, dayBounds],
  );
  const daySlots = useMemo(
    () =>
      Array.from(
        { length: dayWindow.slots },
        (_, i) => dayWindow.start + i * SLOT_MINUTES,
      ),
    [dayWindow],
  );
  /** The same window in the shape the band geometry expects. */
  const dayTimeWindow = useMemo(
    () => ({
      start: dayWindow.start,
      end: dayWindow.end,
      total: dayWindow.end - dayWindow.start,
    }),
    [dayWindow],
  );
  const dayPlacements = useMemo(
    () =>
      placeByColumn({
        columns: dayColumns,
        items: dayBookings,
        // clashes are measured against every live booking, so a filter can't hide one
        activeItems: dayActiveBookings,
        window: dayWindow,
        knownRoomIds,
        turnaroundFor: (column) => daySchedules.get(column.key)?.turnaround ?? 0,
      }),
    [
      dayColumns,
      dayBookings,
      dayActiveBookings,
      dayWindow,
      knownRoomIds,
      daySchedules,
    ],
  );
  // only the slots a booking sits in grow, and only as far as its time, guest and package need
  const dayScale = useMemo(
    () =>
      buildMinuteScale(
        dayWindow.start,
        dayWindow.end,
        PX_PER_MINUTE,
        placementStretchSpans(dayPlacements, dayWindow),
      ),
    [dayWindow, dayPlacements],
  );

  const dayColumnsForConflicts = useMemo(
    () =>
      buildColumns({
        spaces,
        bookings: dayActiveBookings,
        hideEmptySpaces: false,
        knownRoomIds,
      }),
    [spaces, dayActiveBookings, knownRoomIds],
  );
  // Its own schedules, not `daySchedules` — a room hidden by "hide empty
  // spaces" once its filtered bookings vanish must still get its real turnaround.
  const daySchedulesForConflicts = useMemo(
    () =>
      buildColumnSchedules({
        columns: dayColumnsForConflicts,
        dayWindow: scheduleWindow,
      }),
    [dayColumnsForConflicts, scheduleWindow],
  );
  const dayPlacementsForConflicts = useMemo(
    () =>
      placeByColumn({
        columns: dayColumnsForConflicts,
        items: dayActiveBookings,
        window: dayWindow,
        knownRoomIds,
        turnaroundFor: (column) =>
          daySchedulesForConflicts.get(column.key)?.turnaround ?? 0,
      }),
    [
      dayColumnsForConflicts,
      dayActiveBookings,
      dayWindow,
      knownRoomIds,
      daySchedulesForConflicts,
    ],
  );
  const dayOverlapSummary = useMemo(() => {
    const rows: {
      columnName: string;
      a: CalendarBooking;
      b: CalendarBooking;
      overlapMinutes: number;
    }[] = [];
    const seen = new Set<string>();
    for (const column of dayColumnsForConflicts) {
      for (const placement of dayPlacementsForConflicts.get(column.key) ?? []) {
        for (const clash of placement.conflicts) {
          const key = [placement.item.id, clash.item.id]
            .sort((x, y) => x - y)
            .join("-");
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            columnName: column.name,
            a: placement.item,
            b: clash.item,
            overlapMinutes: clash.overlapMinutes,
          });
        }
      }
    }
    return rows.sort((x, y) => y.overlapMinutes - x.overlapMinutes);
  }, [dayColumnsForConflicts, dayPlacementsForConflicts]);
  /** Real spaces on the grid. A virtual column is a booking with no space, not a space. */
  const daySpaceCount = dayColumns.filter((c) => !c.virtual).length;
  /** Room columns the "hide empty spaces" toggle is currently holding back. */
  const hiddenSpaceCount = hideEmptySpaces
    ? spaces.length - daySpaceCount
    : 0;

  /** Where a column's free band starts on screen, in minutes past midnight. */
  const bandOriginFor = useCallback(
    (schedule: ColumnSchedule) =>
      Math.max(schedule.open ?? dayWindow.start, dayWindow.start),
    [dayWindow],
  );

  /**
   * The booking form, already filled in for a column and a resolved tap.
   * Shared by the band tap and the header's walk-in so the two can never send
   * the form different numbers for the same space.
   */
  const openBookingForTap = useCallback(
    (
      column: ScheduleColumn,
      tap: SlotTap,
      options?: { walkInOverride?: boolean },
    ) => {
      // Without a location the booking form lands company-wide, and the same
      // space name exists at every venue.
      const locationId =
        tap.locationId ??
        (column.roomId != null
          ? spaceById.get(column.roomId)?.locationId
          : null) ??
        scheduleWindow?.location_id ??
        null;

      router.push({
        pathname: CREATE_BOOKING_PATH,
        params: buildBookingParams({
          locationId,
          date: startDate,
          minute: tap.minute,
          roomId: column.roomId,
          packageId: tap.packageId,
          packageIds: tap.packageIds,
          freeUntilMinute: tap.freeUntilMinute,
          nextBookingMinute: tap.nextBookingMinute,
          walkIn: tap.walkIn,
          walkInOverride: options?.walkInOverride ?? false,
        }),
      });
    },
    [spaceById, scheduleWindow, startDate],
  );

  /**
   * A tap on a space's free band opens the booking form already filled in for
   * that space and minute — the web grid's "click to start a booking", with
   * the same numbers behind it. A tap that can find no real start (booked out
   * to closing, or too late for anything to fit) does nothing.
   */
  const openSlot = useCallback(
    (column: ScheduleColumn, rawMinute: number) => {
      const schedule = daySchedules.get(column.key);
      if (!schedule || isPastDate) return;

      const tap = resolveSlotTap({
        column,
        schedule,
        dayWindow: scheduleWindow,
        occupancy: dayOccupancy.get(column.key) ?? [],
        hardBlocks: dayHardBlocks.get(column.key) ?? [],
        rawMinute,
        isToday: isVenueToday,
      });
      if (!tap) return;

      openBookingForTap(column, tap);
    },
    [
      daySchedules,
      isPastDate,
      scheduleWindow,
      dayOccupancy,
      dayHardBlocks,
      isVenueToday,
      openBookingForTap,
    ],
  );

  /**
   * The minute a tap where the finger is would actually book — the web shows this on hover, and
   * a finger is the nearest thing to a pointer we have. Resolved through the same call the tap
   * itself makes, so the marker can never name a minute the tap would not use.
   */
  const previewSlotMinute = useCallback(
    (column: ScheduleColumn, rawMinute: number): number | null => {
      const schedule = daySchedules.get(column.key);
      if (!schedule || isPastDate) return null;

      return (
        resolveSlotTap({
          column,
          schedule,
          dayWindow: scheduleWindow,
          occupancy: dayOccupancy.get(column.key) ?? [],
          hardBlocks: dayHardBlocks.get(column.key) ?? [],
          rawMinute,
          isToday: isVenueToday,
        })?.minute ?? null
      );
    },
    [
      daySchedules,
      isPastDate,
      scheduleWindow,
      dayOccupancy,
      dayHardBlocks,
      isVenueToday,
    ],
  );

  /** The marker is one booking interval tall, the way the web draws it. */
  const previewSpanMinutes = Math.max(
    5,
    scheduleWindow?.interval_minutes ?? SLOT_MINUTES,
  );

  const markerRef = useRef<SlotMarkerHandle>(null);
  /** The minute under the finger, for the lift to read. A ref: nothing on screen reads it. */
  const pickedMinuteRef = useRef<number | null>(null);
  /**
   * True once a long press has turned the touch into a deliberate pick. Held in a ref for the
   * handlers and mirrored into state only to lock the scrollers — two renders a gesture, not one
   * per move.
   */
  const pickingRef = useRef(false);
  const [picking, setPicking] = useState(false);

  const trackHover = useCallback(
    (column: ScheduleColumn, columnIndex: number, rawMinute: number) => {
      const minute = previewSlotMinute(column, rawMinute);
      // Dragging past the end of the band resolves to nothing; hold the last good minute rather
      // than blinking the marker out from under the finger.
      if (minute === null) return;
      pickedMinuteRef.current = minute;
      markerRef.current?.show(columnIndex, minute, pickingRef.current);
    },
    [previewSlotMinute],
  );

  const endHover = useCallback(() => {
    markerRef.current?.hide();
    pickedMinuteRef.current = null;
    pickingRef.current = false;
    setPicking((was) => (was ? false : was));
  }, []);

  /**
   * The header's walk-in carries the minute the guests are actually standing
   * there, deliberately not one of the package's own start times — so it goes
   * around the snapping a band tap does. A walk-in whose gap is too short for
   * anything still opens the form: the grid says so on the header, and the
   * form is where the package that will not fit is refused.
   */
  const startWalkIn = useCallback(
    (column: ScheduleColumn) => {
      const schedule = daySchedules.get(column.key);
      if (!schedule || isPastDate || !isVenueToday) return;

      // A walk-in records when the guests actually went in, on a 5-minute
      // grid — never one of the package's own scheduled start times.
      const walkInMinute =
        Math.floor(nowMinutes / WALK_IN_SNAP_MINUTES) * WALK_IN_SNAP_MINUTES;

      const tap = resolveWalkInTap({
        column,
        schedule,
        dayWindow: scheduleWindow,
        occupancy: dayOccupancy.get(column.key) ?? [],
        hardBlocks: dayHardBlocks.get(column.key) ?? [],
        minute: walkInMinute,
      });
      if (!tap) return;

      const fit = walkInFit({
        column,
        schedule,
        dayWindow: scheduleWindow,
        occupancy: dayOccupancy.get(column.key) ?? [],
        hardBlocks: dayHardBlocks.get(column.key) ?? [],
        nowMinutes,
        bookings: dayActiveBookings,
      });
      // an area clash and a space that closes before anything can finish are each a refusal of
      // their own, so either must stop a walk-in that has nothing to fit
      if (
        fit.fits ||
        (fit.shortest === null && fit.areaClash === null && !fit.blockedByClose)
      ) {
        openBookingForTap(column, tap);
        return;
      }

      const endMinute = walkInMinute + (fit.shortest ?? 0);
      const packageName = fit.packageName ?? "the shortest package here";
      const clash =
        dayBookings
          .filter((b) => columnKeyFor(b, knownRoomIds) === column.key)
          .map((b) => ({ booking: b, start: timeToMinutes(b.time) }))
          .filter(({ start }) => start >= walkInMinute && start < endMinute)
          .sort((a, b) => a.start - b.start)[0]?.booking ?? null;

      // The area group includes this space, so the clash can be its own booking — calling that
      // "a space nearby" would name the wrong space.
      const areaClashIsHere =
        !!fit.areaClash && fit.areaClash.roomId === column.roomId;

      // say which problem it is: something in the area starting too close, nothing here short
      // enough to finish before closing, or this walk-in running long
      const lines = [
        fit.areaClash
          ? areaClashIsHere
            ? `${column.name} already has a booking at ${slotLabel(
                timeToMinutes(fit.areaClash.time),
              )}, and bookings in its area have to start far enough apart for staff to run them.`
            : `${column.name} shares an area with a space that already starts at ${slotLabel(
                timeToMinutes(fit.areaClash.time),
              )}. They have to start far enough apart for staff to run both.`
          : fit.shortest === null
            ? `Every package in ${column.name} would still be running when it closes, so none of them can be started now.`
            : `${column.name} is free for ${fit.freeFor} min, but ${packageName} needs ${fit.shortest} min.`,
      ];
      if (fit.shortest !== null) {
        lines.push(
          "",
          `Walk-in would run ${slotLabel(walkInMinute)} – ${slotLabel(endMinute)}`,
          `Space is free for ${fit.freeFor} min`,
        );
        if (!fit.areaClash) {
          lines.push(`Overlap: ${fit.shortest - fit.freeFor} min`);
        }
      }
      if (clash) {
        lines.push(
          "",
          `Clashes with ${clash.customerName}`,
          `Their booking: ${slotLabel(timeToMinutes(clash.time))} · ${clash.packageName}`,
        );
      }

      Alert.alert(
        fit.areaClash
          ? areaClashIsHere
            ? "Another booking here starts too close to this"
            : "Another space nearby starts too close to this"
          : fit.shortest === null
            ? "Nothing here can finish before closing"
            : "This walk-in runs past the next booking",
        lines.join("\n"),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Start anyway",
            onPress: () =>
              openBookingForTap(column, tap, { walkInOverride: true }),
          },
        ],
      );
    },
    [
      daySchedules,
      isPastDate,
      isVenueToday,
      scheduleWindow,
      dayOccupancy,
      dayHardBlocks,
      nowMinutes,
      dayBookings,
      dayActiveBookings,
      knownRoomIds,
      openBookingForTap,
    ],
  );

  /* --------------------------------------------------------- week grid --- */

  const weekEntries = useMemo<WeekEntry[]>(() => {
    const out: WeekEntry[] = [];
    for (const day of weekDays) {
      const key = dateKey(day);
      const group = byDate[key];
      if (!group) continue;
      for (const booking of group.bookings) {
        out.push({
          kind: "booking",
          key: `b-${booking.id}`,
          time: booking.time,
          dateKey: key,
          booking,
        });
      }
      for (const purchase of group.attractions) {
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
  }, [weekDays, byDate]);

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
      return (
        todayKey >= dateKey(weekDays[0]) && todayKey <= dateKey(weekDays[6])
      );
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

  /** A typeahead hit can sit outside the visible window, so move the calendar
   *  to its day (in Day view) before opening it — same as the web. */
  const openBookingFromSearch = useCallback((booking: CalendarBooking) => {
    const day = booking.date ? new Date(`${booking.date}T00:00:00`) : null;
    if (day && !Number.isNaN(day.getTime())) {
      setAnchor(day);
      setViewMode("day");
    }
    setSelectedDayKey(null);
    setSelectedBookingId(booking.id);
  }, []);
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
      <DashboardHeader unreadCount={unreadNotificationsCount} variant="brand" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        // Picking a time IS a vertical drag, so the page must hold still under it.
        scrollEnabled={!picking}
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
        <View className="px-5 pt-5">
          {/* Welcome Section */}

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

          {/* Two searches, as on the web. The typeahead above finds any
              booking on any date and jumps to it; the filter below narrows
              whatever the active view already shows — in all three modes, the
              month grid included (its per-day counts and its day sheet). The
              day grid can additionally drop the spaces nothing is booked into
              (58 columns is a lot of scrolling for one booking). */}
          <CalendarCustomerSearch onSelect={openBookingFromSearch} />

          <View className="flex-row items-center gap-2 mb-4">
            <View className="flex-1 flex-row items-center gap-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl px-3 h-11">
              <Search size={16} color="#9ca3af" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Filter this view by name or phone"
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

                {dayOverlapSummary.length > 0 && (() => {
                  const doubleBooked = dayOverlapSummary.filter((r) => r.overlapMinutes > 0);
                  const backToBack = dayOverlapSummary.filter((r) => r.overlapMinutes === 0);
                  const tone = doubleBooked.length > 0;
                  return (
                  <View
                    className={`flex-row items-start gap-2 border-b px-4 py-2.5 ${
                      tone
                        ? "border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/10"
                        : "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10"
                    }`}
                  >
                    <AlertTriangle
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
                      {dayOverlapSummary.map((row) => (
                        <Text
                          key={`${row.a.id}-${row.b.id}`}
                          className={`mt-0.5 text-xs ${
                            tone
                              ? "text-rose-800 dark:text-rose-400"
                              : "text-amber-800 dark:text-amber-400"
                          }`}
                        >
                          {row.columnName}: {row.a.customerName} at{" "}
                          {slotLabel(timeToMinutes(row.a.time))}{" "}
                          {row.overlapMinutes > 0
                            ? `overlaps ${row.b.customerName} at ${slotLabel(timeToMinutes(row.b.time))} by ${row.overlapMinutes} min`
                            : `ends as ${row.b.customerName} starts at ${slotLabel(timeToMinutes(row.b.time))} — no time to reset the space`}
                        </Text>
                      ))}
                    </View>
                  </View>
                  );
                })()}

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
                      {/* A line per quarter hour, darker on the hour — the web's own weighting,
                          so the eye can still find 4:00 among its quarters. */}
                      {daySlots.map((minutes) => (
                        <View
                          key={minutes}
                          style={{
                            height: dayScale.spanHeight(
                              minutes,
                              minutes + SLOT_MINUTES,
                            ),
                          }}
                          className={`px-3 pt-1 border-b ${
                            (minutes + SLOT_MINUTES) % 60 === 0
                              ? "border-gray-200 dark:border-neutral-700"
                              : "border-gray-100 dark:border-neutral-800"
                          }`}
                        >
                          <Text
                            className={`text-xs text-[#0644C7] ${
                              minutes % 60 === 0
                                ? "font-bold"
                                : "font-medium opacity-70"
                            }`}
                          >
                            {slotLabel(minutes)}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      // Picking a time IS a drag, so the grid must hold still under it.
                      scrollEnabled={!picking}
                    >
                      <View className="flex-row">
                        {dayColumns.map((column, columnIndex) => {
                          const schedule = daySchedules.get(column.key);
                          const band = schedule
                            ? bandGeometry(
                                schedule.open,
                                schedule.close,
                                dayTimeWindow,
                                dayScale,
                              )
                            : null;
                          // A past day is read-only, and a space with no window
                          // yet is drawn but never tappable.
                          const bookable =
                            !!band && !!schedule?.bookable && !isPastDate;

                          return (
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
                                {column.virtual && (
                                  <View className="flex-row items-center gap-1 mt-0.5">
                                    <AlertTriangle size={10} color="#F59E0B" />
                                    <Text className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                      No room
                                    </Text>
                                  </View>
                                )}
                                {/* which venue this space belongs to, whenever more than one is on screen */}
                                {showColumnLocation && (
                                  <View className="flex-row items-center gap-1 mt-0.5">
                                    <MapPin size={10} color="#9ca3af" />
                                    <Text
                                      className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink"
                                      numberOfLines={1}
                                    >
                                      {locationNameById.get(
                                        columnLocationId(column) ?? -1,
                                      ) ?? "Unknown"}
                                    </Text>
                                  </View>
                                )}
                                <DayColumnStatus
                                  status={dayStatuses.get(column.key)}
                                  onWalkIn={() => startWalkIn(column)}
                                />
                              </View>

                              <View
                                style={{
                                  height: dayScale.height,
                                }}
                              >
                                {daySlots.map((minutes) => (
                                  <View
                                    key={minutes}
                                    style={{
                                      height: dayScale.spanHeight(
                                        minutes,
                                        minutes + SLOT_MINUTES,
                                      ),
                                    }}
                                    className={`border-b ${
                                      (minutes + SLOT_MINUTES) % 60 === 0
                                        ? "border-gray-200 dark:border-neutral-700"
                                        : "border-gray-100 dark:border-neutral-800"
                                    }`}
                                  />
                                ))}

                                {/* The hours this space is open. Tapping one
                                    starts a booking there; breaks, closures and
                                    bookings sit on top and the tap is walked
                                    forward to the next minute that is free. */}
                                {band &&
                                  (() => {
                                    // The web puts these hours in a hover tooltip. There is no
                                    // hover here, so the band says them itself — otherwise the
                                    // only way to learn them is to tap and find out.
                                    const hours =
                                      schedule?.open != null &&
                                      schedule?.close != null
                                        ? rangeLabel(
                                            schedule.open,
                                            schedule.close,
                                          )
                                        : null;
                                    const bandOrigin = schedule
                                      ? bandOriginFor(schedule)
                                      : dayWindow.start;
                                    const atFinger = (y: number) =>
                                      minuteAtOffset(
                                        bandOrigin,
                                        y,
                                        dayScale,
                                      );
                                    return bookable ? (
                                      <Pressable
                                        // A tap books the minute tapped, as it always has. Holding
                                        // instead starts a pick: the grid stops scrolling, the
                                        // marker follows the finger, and lifting books where it
                                        // ended up. A long press never also fires onPress.
                                        onPress={(e) =>
                                          openSlot(
                                            column,
                                            atFinger(e.nativeEvent.locationY),
                                          )
                                        }
                                        onLongPress={() => {
                                          pickingRef.current = true;
                                          setPicking(true);
                                          if (pickedMinuteRef.current !== null) {
                                            markerRef.current?.show(
                                              columnIndex,
                                              pickedMinuteRef.current,
                                              true,
                                            );
                                          }
                                        }}
                                        delayLongPress={250}
                                        onTouchStart={(e) =>
                                          trackHover(
                                            column,
                                            columnIndex,
                                            atFinger(e.nativeEvent.locationY),
                                          )
                                        }
                                        onTouchMove={(e) =>
                                          trackHover(
                                            column,
                                            columnIndex,
                                            atFinger(e.nativeEvent.locationY),
                                          )
                                        }
                                        onTouchEnd={() => {
                                          const minute = pickedMinuteRef.current;
                                          const picked = pickingRef.current;
                                          endHover();
                                          if (picked && minute !== null) {
                                            openSlot(column, minute);
                                          }
                                        }}
                                        onTouchCancel={endHover}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                          hours
                                            ? `Available ${hours} in ${column.name} — tap to start a booking, or hold to pick a time`
                                            : `Start a booking in ${column.name}`
                                        }
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          right: 0,
                                          top: band.top,
                                          height: band.height,
                                        }}
                                        className="overflow-hidden bg-gray-100 dark:bg-neutral-800/60 active:bg-gray-200 dark:active:bg-neutral-700/60"
                                      >
                                        {/* Untouchable, so locationY above stays measured from
                                            the band and not from whichever label was hit. */}
                                        <View pointerEvents="none">
                                          <View className="flex-row items-center gap-1 px-1 pt-1">
                                            <Plus size={10} color="#9ca3af" />
                                            {/* The hold gesture is only useful if staff know it
                                                is there, so the band says so. */}
                                            <Text className="text-[9px] font-semibold text-gray-400 dark:text-gray-500">
                                              Tap · hold to pick
                                            </Text>
                                          </View>
                                          {/* Only when the band has the room for it — a sliver of
                                              free time must not paint its hours over a booking. */}
                                          {!!hours && band.height >= 34 && (
                                            <Text
                                              className="px-1 text-[9px] leading-tight text-gray-400 dark:text-gray-500"
                                              numberOfLines={1}
                                            >
                                              {hours}
                                            </Text>
                                          )}
                                        </View>
                                      </Pressable>
                                    ) : (
                                      <View
                                        accessible={!!hours}
                                        accessibilityLabel={
                                          hours
                                            ? `${column.name} available ${hours}`
                                            : undefined
                                        }
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          right: 0,
                                          top: band.top,
                                          height: band.height,
                                        }}
                                        className="bg-gray-50 dark:bg-neutral-900/40"
                                      />
                                    );
                                  })()}

                                {(schedule?.closedRanges ?? []).map(
                                  (closure, index) => {
                                    const geometry = bandGeometry(
                                      closure.startMinutes,
                                      closure.endMinutes,
                                      dayTimeWindow,
                                      dayScale,
                                    );
                                    if (!geometry) return null;
                                    return (
                                      <View
                                        key={`closed-${index}`}
                                        pointerEvents="none"
                                        style={{
                                          position: "absolute",
                                          left: 2,
                                          right: 2,
                                          top: geometry.top,
                                          height: geometry.height,
                                        }}
                                        className="rounded border border-dashed border-red-200 bg-red-50/90 dark:border-red-900/40 dark:bg-red-950/50 px-1 pt-0.5"
                                      >
                                        <Text
                                          className="text-[10px] font-medium text-red-500"
                                          numberOfLines={1}
                                        >
                                          {closure.reason ?? "Closed"}
                                        </Text>
                                      </View>
                                    );
                                  },
                                )}

                                {(column.roomId != null
                                  ? (dayBreaks.get(column.roomId) ?? [])
                                  : []
                                ).map((brk, index) => {
                                  const geometry = bandGeometry(
                                    brk.start,
                                    brk.end,
                                    dayTimeWindow,
                                    dayScale,
                                  );
                                  if (!geometry) return null;
                                  return (
                                    <View
                                      key={`break-${index}`}
                                      pointerEvents="none"
                                      style={{
                                        position: "absolute",
                                        left: 2,
                                        right: 2,
                                        top: geometry.top,
                                        height: geometry.height,
                                      }}
                                      className="rounded border border-dashed border-gray-300 bg-gray-200/80 dark:border-neutral-600 dark:bg-neutral-800 px-1 pt-0.5"
                                    >
                                      <Text
                                        className="text-[10px] font-medium text-gray-500 dark:text-gray-400"
                                        numberOfLines={1}
                                      >
                                        Break
                                      </Text>
                                    </View>
                                  );
                                })}

                                {schedule?.closedAllDay && (
                                  <View
                                    pointerEvents="none"
                                    className="absolute inset-0 items-center pt-3 bg-gray-200/60 dark:bg-neutral-900/60"
                                  >
                                    <Text
                                      className="rounded-full border border-gray-200 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-neutral-700 dark:bg-black/50 dark:text-gray-400"
                                      numberOfLines={1}
                                    >
                                      {schedule.reason ?? "Closed"}
                                    </Text>
                                  </View>
                                )}

                                {/* The space is still being reset here, so the
                                    gap after a booking must not read as free.
                                    Blocks are drawn snapped to whole slots, so
                                    only the part of the reset that sticks out
                                    below one needs its own strip. */}
                                {(dayPlacements.get(column.key) ?? []).map(
                                  (placement) => {
                                    const turnaround =
                                      schedule?.turnaround ?? 0;
                                    if (turnaround <= 0) return null;
                                    const top = dayScale.at(
                                      placementMinutes(placement, dayWindow).to,
                                    );
                                    const bottom = dayScale.at(
                                      Math.min(
                                        dayWindow.end,
                                        placement.endMin + turnaround,
                                      ),
                                    );
                                    if (bottom <= top) return null;
                                    return (
                                      <View
                                        key={`reset-${placement.item.id}`}
                                        pointerEvents="none"
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          right: 0,
                                          top,
                                          height: bottom - top,
                                        }}
                                        className="border-y border-amber-200 bg-amber-100/70 dark:border-amber-900/40 dark:bg-amber-900/20"
                                      />
                                    );
                                  },
                                )}

                                {(dayPlacements.get(column.key) ?? []).map(
                                  (placement) => (
                                    <DayBookingBlock
                                      key={placement.item.id}
                                      placement={placement}
                                      scale={dayScale}
                                      windowStart={dayWindow.start}
                                      onPress={() =>
                                        openBooking(placement.item.id)
                                      }
                                    />
                                  ),
                                )}
                              </View>
                            </View>
                          );
                        })}

                        {/* One marker for the whole grid, positioned by column. */}
                        <SlotMarker
                          ref={markerRef}
                          columnWidth={DAY_COL_WIDTH}
                          topOffset={GRID_HEADER_HEIGHT}
                          scale={dayScale}
                          spanMinutes={previewSpanMinutes}
                        />
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* The web grid's footer: what is on the day, and what the two
                    background tones mean. A virtual column is a booking with no
                    space of its own, so it is not counted as one. */}
                <View className="px-4 py-2.5 border-t border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50">
                  <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      <Text className="font-semibold text-[#0644C7]">
                        {dayBookings.length}
                      </Text>{" "}
                      {dayBookings.length === 1 ? "booking" : "bookings"} across{" "}
                      <Text className="font-semibold text-gray-700 dark:text-gray-200">
                        {daySpaceCount}
                      </Text>{" "}
                      {daySpaceCount === 1 ? "space" : "spaces"}
                      {hiddenSpaceCount > 0
                        ? ` · ${hiddenSpaceCount} empty space${hiddenSpaceCount === 1 ? "" : "s"} hidden`
                        : ""}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      <View className="h-2.5 w-3.5 rounded-sm border border-gray-300 bg-gray-100 dark:border-neutral-600 dark:bg-neutral-800" />
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Available
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      <View className="h-2.5 w-3.5 rounded-sm border-l-4 border-green-400 bg-green-50 dark:bg-green-900/30" />
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Booked
                      </Text>
                    </View>
                  </View>
                  {scheduleWindow?.has_schedule === false && (
                    <Text className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      No package schedule for this day — showing a default
                      window.
                    </Text>
                  )}
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
                  {emptyGridTitle}
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                  {isSearching
                    ? `Nothing in ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()} matches that customer name or phone.`
                    : categoryFilter.isAll
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
