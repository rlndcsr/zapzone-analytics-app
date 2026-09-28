import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  DoorOpen,
  Hammer,
  Info,
  Layers,
  PartyPopper,
  Sparkles,
  Ticket,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  ACTIVITY_PANEL_INFO,
  activityDateLabel,
  attractionsForDate,
  bucketItemCount,
  bucketSubline,
  buildActivityBuckets,
  eventsForDate,
  shiftDateKey,
  type ActivityBucket,
  type ActivityBucketKey,
} from "../../lib/dashboard/activityCategories";
import { venueDateKey } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import { convertTo12Hour } from "../../lib/time";
import {
  fetchAttractionPurchases,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import {
  fetchDayBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import {
  fetchEventPurchases,
  type EventPurchaseRow,
} from "../../services/eventPurchasesService";
import { BookingDetailSheet } from "./BookingDetailSheet";
import { BottomSheet } from "./BottomSheet";
import {
  AttractionPurchaseCard,
  EventPurchaseCard,
} from "./CalendarDaySections";
import { DatePickerSheet } from "./DatePickerSheet";
import { StatusBadge } from "./StatusBadge";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** The web's per-bucket icon and tints. */
const BUCKET_STYLES: Record<
  ActivityBucketKey,
  { icon: LucideIcon; iconBg: string; iconColor: string; value: string }
> = {
  party_packages: {
    icon: PartyPopper,
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "#1D4ED8",
    value: "text-blue-700 dark:text-blue-400",
  },
  attractions: {
    icon: Ticket,
    iconBg: "bg-purple-100 dark:bg-purple-900/40",
    iconColor: "#7E22CE",
    value: "text-purple-700 dark:text-purple-400",
  },
  escape_rooms: {
    icon: DoorOpen,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "#047857",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  rage_rooms: {
    icon: Hammer,
    iconBg: "bg-rose-100 dark:bg-rose-900/40",
    iconColor: "#BE123C",
    value: "text-rose-700 dark:text-rose-400",
  },
  events: {
    icon: Sparkles,
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "#B45309",
    value: "text-amber-700 dark:text-amber-400",
  },
};

/** Stepping through days fires one load, not one per tap (web: 200 ms). */
const STEP_DEBOUNCE_MS = 200;
/** The day picker reaches back this far; any day can be looked at. */
const EARLIEST_DAY = "2015-01-01";

type DayActivity = {
  scopeKey: string;
  bookings: CalendarBooking[];
  purchases: PurchaseRow[];
  events: EventPurchaseRow[];
  /** One leg failed, so the counts may be short. */
  failed: boolean;
};

const NO_ACTIVITY: DayActivity = {
  scopeKey: "",
  bookings: [],
  purchases: [],
  events: [],
  failed: false,
};

const scopeKeyOf = (dateKey: string, locationId: number | null) =>
  `${dateKey}|${locationId ?? "all"}`;

/** One day's bookings, attraction tickets and event registrations, each leg
 *  best-effort (web parity: useDayActivity). */
function useDayActivity(
  dateKey: string,
  locationId: number | null,
  reloadKey: number,
) {
  const scopeKey = scopeKeyOf(dateKey, locationId);
  const [activity, setActivity] = useState<DayActivity>(NO_ACTIVITY);

  useEffect(() => {
    const token = getToken();
    const userId = getCurrentUser()?.id;
    const controller = new AbortController();
    let cancelled = false;
    let failed = false;

    const guard = <T,>(promise: Promise<T>, what: string, fallback: T) =>
      promise.catch((err) => {
        if (!cancelled)
          console.warn(`[CategoryActivityPanel] Could not load ${what}:`, err);
        failed = true;
        return fallback;
      });

    const timer = setTimeout(() => {
      if (!token || !userId) {
        setActivity({ ...NO_ACTIVITY, scopeKey, failed: true });
        return;
      }
      const location = locationId ?? undefined;
      Promise.all([
        guard(
          fetchDayBookings({
            token,
            date: dateKey,
            locationId: location,
            signal: controller.signal,
          }),
          "the day's bookings",
          [] as CalendarBooking[],
        ),
        guard(
          fetchAttractionPurchases({
            token,
            userId,
            locationId: location,
            scheduledFrom: dateKey,
            scheduledTo: dateKey,
            signal: controller.signal,
          }),
          "the day's attraction tickets",
          [] as PurchaseRow[],
        ),
        guard(
          fetchEventPurchases({
            token,
            userId,
            locationId: location,
            startDate: dateKey,
            endDate: dateKey,
            signal: controller.signal,
          }),
          "the day's event registrations",
          [] as EventPurchaseRow[],
        ),
      ]).then(([bookings, purchases, events]) => {
        if (cancelled) return;
        setActivity({ scopeKey, bookings, purchases, events, failed });
      });
    }, STEP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [dateKey, locationId, scopeKey, reloadKey]);

  return { activity, ready: activity.scopeKey === scopeKey, scopeKey };
}

/** One package booking in a bucket's list (web parity: BookingRow). */
const BookingRow = ({
  booking,
  onPress,
}: {
  booking: CalendarBooking;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`View booking for ${booking.customerName}`}
    className="rounded-xl p-3 mb-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 active:opacity-80"
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {booking.packageNameRaw || "Package booking"}
        </Text>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400"
          numberOfLines={1}
        >
          {booking.customerName}
        </Text>
      </View>
      <StatusBadge status={booking.status} />
    </View>
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mt-2">
      <Text className="text-xs font-medium text-gray-800 dark:text-gray-200">
        {convertTo12Hour(booking.time) || "—"}
      </Text>
      <View className="flex-row items-center gap-1">
        <Feather name="users" size={12} color="#9CA3AF" />
        <Text className="text-xs text-gray-600 dark:text-gray-300">
          {booking.participants} guest{booking.participants === 1 ? "" : "s"}
        </Text>
      </View>
      {!!booking.roomName && (
        <Text
          className="text-xs text-gray-600 dark:text-gray-300"
          numberOfLines={1}
        >
          {booking.roomName}
        </Text>
      )}
      <Text className="ml-auto text-xs font-medium text-gray-900 dark:text-white">
        ${Number(booking.totalAmount || 0).toFixed(2)}
      </Text>
    </View>
  </Pressable>
);

/** A bucket's card in the grid (web parity: the panel's card buttons). */
const BucketCard = ({
  bucket,
  loading,
  onPress,
}: {
  bucket: ActivityBucket;
  loading: boolean;
  onPress: () => void;
}) => {
  const style = BUCKET_STYLES[bucket.key];
  const Icon = style.icon;
  const canOpen = !loading && bucketItemCount(bucket) > 0;

  return (
    <Pressable
      onPress={canOpen ? onPress : undefined}
      disabled={!canOpen}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canOpen }}
      accessibilityLabel={`${bucket.label}: ${loading ? "still counting" : `${bucket.primary} ${bucket.primaryUnit}`}`}
      className={`flex-1 m-1.5 min-h-[124px] rounded-2xl border p-3.5 bg-white dark:bg-neutral-900 ${
        canOpen
          ? "border-gray-100 dark:border-neutral-800 active:opacity-80"
          : "border-gray-100 dark:border-neutral-800 opacity-70"
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View
          className={`w-8 h-8 rounded-lg items-center justify-center ${style.iconBg}`}
        >
          <Icon size={15} color={style.iconColor} strokeWidth={2} />
        </View>
        {canOpen && <Feather name="chevron-right" size={14} color="#D1D5DB" />}
      </View>

      <Text
        className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mt-2 leading-tight"
        numberOfLines={2}
      >
        {bucket.label}
      </Text>

      {loading ? (
        <View className="mt-1.5 gap-1.5">
          <View className="h-6 w-12 rounded bg-gray-200 dark:bg-neutral-700" />
          <View className="h-2.5 w-20 rounded bg-gray-200 dark:bg-neutral-700" />
        </View>
      ) : (
        <>
          <Text
            className={`text-xl font-bold mt-0.5 ${
              canOpen ? style.value : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {bucket.primary.toLocaleString("en-US")}
            <Text className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {" "}
              {bucket.primaryUnit}
            </Text>
          </Text>
          <Text className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            {bucketSubline(bucket)}
          </Text>
          {bucket.categories.length > 0 && (
            <Text
              className="text-[10px] text-gray-400 dark:text-gray-500 mt-auto pt-1"
              numberOfLines={1}
            >
              {bucket.categories.join(", ")}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
};

/** What's inside one bucket — counts, what made them up, and the rows
 *  (web parity: BucketDetail). */
const BucketDetail = ({
  bucket,
  dateLabel,
  scopeLabel,
  onBooking,
  onPurchase,
  onEvent,
}: {
  bucket: ActivityBucket;
  dateLabel: string;
  scopeLabel: string;
  onBooking: (id: number) => void;
  onPurchase: (id: number) => void;
  onEvent: (id: number) => void;
}) => (
  <ScrollView
    className="px-5"
    contentContainerStyle={{ paddingBottom: 24 }}
    showsVerticalScrollIndicator={false}
  >
    <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
      {dateLabel} · {scopeLabel}
    </Text>

    <View className="flex-row gap-3 mb-4">
      {(
        [
          [bucket.primary, bucket.primaryUnit],
          [bucket.secondary, bucket.secondaryUnit],
        ] as const
      ).map(([value, unit]) => (
        <View
          key={unit}
          className="flex-1 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 p-3"
        >
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            {value.toLocaleString("en-US")}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 capitalize">
            {unit}
          </Text>
        </View>
      ))}
    </View>

    <Text className="text-xs leading-5 text-gray-500 dark:text-gray-400 mb-4">
      {bucket.explanation}
    </Text>

    {bucket.sources.length > 0 && (
      <View className="mb-4">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          What made up the {bucket.primaryUnit}
        </Text>
        {bucket.sources.map((source) => (
          <View
            key={source.label}
            className="flex-row items-center justify-between gap-3 py-1"
          >
            <Text
              className="flex-1 text-sm text-gray-700 dark:text-gray-200"
              numberOfLines={1}
            >
              {source.label}
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                {"  "}
                {source.category}
              </Text>
            </Text>
            <Text className="text-sm font-medium text-gray-900 dark:text-white">
              {source.count.toLocaleString("en-US")}
            </Text>
          </View>
        ))}
      </View>
    )}

    {bucket.cancelled > 0 && (
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {bucket.cancelled} cancelled or refunded{" "}
        {bucket.cancelled === 1 ? "row is" : "rows are"} not counted above.
      </Text>
    )}

    {bucketItemCount(bucket) === 0 ? (
      <View className="py-6 rounded-xl border border-dashed border-gray-200 dark:border-neutral-700">
        <Text className="text-sm text-center text-gray-500 dark:text-gray-400">
          Nothing scheduled in {bucket.label} on {dateLabel}.
        </Text>
      </View>
    ) : (
      <View>
        {bucket.bookings.map((booking) => (
          <BookingRow
            key={`booking-${booking.id}`}
            booking={booking}
            onPress={() => onBooking(booking.id)}
          />
        ))}
        {bucket.purchases.map((purchase) => (
          <AttractionPurchaseCard
            key={`purchase-${purchase.id}`}
            purchase={purchase}
            onPress={() => onPurchase(purchase.id)}
          />
        ))}
        {bucket.eventPurchases.map((purchase) => (
          <EventPurchaseCard
            key={`event-${purchase.id}`}
            purchase={purchase}
            onPress={() => onEvent(purchase.id)}
          />
        ))}
      </View>
    )}
  </ScrollView>
);

/**
 * Activity by Category — everything scheduled for one day at the dashboard's
 * location, grouped by what the guest is here to do (web parity:
 * components/admin/dashboard/CategoryActivityPanel.tsx). Counts follow the day
 * the activity happens, not the day it was booked, so they will not agree
 * with the created-at cards above. Tap a card for the rows behind it.
 */
export function CategoryActivityPanel({
  locationId,
  scopeLabel,
  refreshSignal = 0,
}: {
  /** null = every location the account can see (company admin, "All"). */
  locationId: number | null;
  /** "Waterford only", "All locations combined — …". */
  scopeLabel: string;
  /** Bump to reload, e.g. on the dashboard's pull-to-refresh. */
  refreshSignal?: number;
}) {
  const todayKey = venueDateKey(new Date().toISOString()) ?? "";
  const [dateKey, setDateKey] = useState(todayKey);
  const [openBucket, setOpenBucket] = useState<ActivityBucketKey | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [changes, setChanges] = useState(0);

  const { activity, ready, scopeKey } = useDayActivity(
    dateKey,
    locationId,
    refreshSignal + changes,
  );
  const loading = !ready;

  const buckets = useMemo(
    () =>
      ready
        ? buildActivityBuckets({
            bookings: activity.bookings,
            purchases: attractionsForDate(activity.purchases, dateKey),
            events: eventsForDate(activity.events, dateKey),
          })
        : buildActivityBuckets({}),
    [ready, activity, dateKey],
  );

  // A new day or location closes whatever was open.
  useEffect(() => {
    setOpenBucket(null);
  }, [scopeKey]);

  const goToDay = useCallback((next: string) => {
    setOpenBucket(null);
    setDateKey(next);
  }, []);

  const isToday = dateKey === todayKey;
  const dateLabel = activityDateLabel(dateKey);
  const active =
    ready && openBucket
      ? (buckets.find((b) => b.key === openBucket) ?? null)
      : null;
  const activeStyle = active ? BUCKET_STYLES[active.key] : null;

  // Leaving the sheet to a purchase page closes it first, as the calendar does.
  const openPurchase = (id: number) => {
    setOpenBucket(null);
    router.push({
      pathname: "/attractions/purchase-details",
      params: { id: String(id) },
    });
  };
  const openEvent = (id: number) => {
    setOpenBucket(null);
    router.push({
      pathname: "/events/purchase-details",
      params: { id: String(id) },
    });
  };

  const rows = [buckets.slice(0, 2), buckets.slice(2, 4), buckets.slice(4)];

  return (
    <View
      className="mt-6 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 p-4"
      style={CARD_SHADOW}
    >
      {/* Title. Android sized a text box that fitted its words exactly for a
          narrower face than the bold Montserrat it draws, so "Category" wrapped
          onto a second line the one-line box then clipped. Filling the row
          (flex-1) leaves the words spare room; simple line breaking avoids the
          high-quality breaker's own trailing-word drops with custom fonts. */}
      <View className="flex-row items-center gap-2">
        <Layers size={18} color="#6B7280" strokeWidth={2} />
        <Text
          className="flex-1 text-base font-bold text-gray-900 dark:text-white"
          textBreakStrategy="simple"
        >
          Activity by Category
        </Text>
        {/* Same ⓘ and sheet as the metric cards above. */}
        <Pressable
          onPress={() => setShowInfo(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="About Activity by Category"
        >
          <Info size={14} color="#9CA3AF" strokeWidth={2} />
        </Pressable>
        {loading && <ActivityIndicator size="small" color="#9CA3AF" />}
      </View>

      {/* Day controls: ‹ [date] › Today */}
      <View className="flex-row items-center gap-2 mt-3">
        <Pressable
          onPress={() => goToDay(shiftDateKey(dateKey, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-neutral-700 items-center justify-center active:opacity-70"
        >
          <Feather name="chevron-left" size={16} color="#4B5563" />
        </Pressable>
        <Pressable
          onPress={() => setPickingDate(true)}
          accessibilityRole="button"
          accessibilityLabel={`Pick a day, currently ${dateLabel}`}
          className="flex-1 h-9 flex-row items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 active:opacity-70"
        >
          <Feather name="calendar" size={14} color="#0644C7" />
          <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {dateLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => goToDay(shiftDateKey(dateKey, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          className="w-9 h-9 rounded-lg border border-gray-200 dark:border-neutral-700 items-center justify-center active:opacity-70"
        >
          <Feather name="chevron-right" size={16} color="#4B5563" />
        </Pressable>
        <Pressable
          onPress={() => goToDay(todayKey)}
          disabled={isToday}
          accessibilityRole="button"
          accessibilityState={{ disabled: isToday }}
          className={`h-9 px-3 rounded-lg border border-gray-200 dark:border-neutral-700 items-center justify-center ${
            isToday ? "opacity-50" : "active:opacity-70"
          }`}
        >
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Today
          </Text>
        </Pressable>
      </View>

      <Text className="text-xs text-gray-500 dark:text-gray-400 mt-3 mb-2">
        {scopeLabel}
      </Text>

      {ready && activity.failed && (
        <Text className="text-xs text-red-600 dark:text-red-400 mb-2">
          Part of this day could not be loaded, so the counts below may be
          short. Step off this day and back to try again.
        </Text>
      )}

      {/* Two cards a row, as the web lays them out at phone width. */}
      <View className="-mx-1.5">
        {rows.map((row, i) => (
          <View key={i} className="flex-row">
            {row.map((bucket) => (
              <BucketCard
                key={bucket.key}
                bucket={bucket}
                loading={loading}
                onPress={() => setOpenBucket(bucket.key)}
              />
            ))}
            {row.length === 1 && <View className="flex-1 m-1.5" />}
          </View>
        ))}
      </View>

      <BottomSheet
        visible={!!active}
        onClose={() => setOpenBucket(null)}
        title={active?.label ?? ""}
        icon={
          active && activeStyle ? (
            <View
              className={`w-9 h-9 rounded-lg items-center justify-center ${activeStyle.iconBg}`}
            >
              <activeStyle.icon
                size={18}
                color={activeStyle.iconColor}
                strokeWidth={2}
              />
            </View>
          ) : undefined
        }
      >
        {active && (
          <BucketDetail
            bucket={active}
            dateLabel={dateLabel}
            scopeLabel={scopeLabel}
            onBooking={setBookingId}
            onPurchase={openPurchase}
            onEvent={openEvent}
          />
        )}
      </BottomSheet>

      <BottomSheet
        visible={showInfo}
        onClose={() => setShowInfo(false)}
        title="Activity by Category"
      >
        <View className="px-5 pb-8">
          <Text className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            {ACTIVITY_PANEL_INFO}
          </Text>
        </View>
      </BottomSheet>

      <DatePickerSheet
        visible={pickingDate}
        value={dateKey}
        minDate={EARLIEST_DAY}
        title="Jump to a day"
        onClose={() => setPickingDate(false)}
        onSelect={(next) => {
          setPickingDate(false);
          goToDay(next);
        }}
      />

      {/* The booking opens over the list, as the calendar's day sheet does. */}
      <BookingDetailSheet
        bookingId={bookingId}
        visible={bookingId !== null}
        onClose={() => setBookingId(null)}
        onChanged={() => setChanges((n) => n + 1)}
      />
    </View>
  );
}
