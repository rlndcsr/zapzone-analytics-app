import { Feather } from "@expo/vector-icons";
import { useCallback, useState, type ComponentProps } from "react";
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
import { StatusBadge } from "../../components/ui/StatusBadge";
import {
  BadgeSkeleton,
  NewBookingRowsSkeleton,
  PurchaseRowsSkeleton,
} from "../../components/ui/skeleton/ActivityScreenSkeleton";
import { usePulse } from "../../components/ui/skeleton/SkeletonBlock";
import { useTimeframeSelection } from "../../lib/dashboard/timeframeStore";
import { useManagerActivity } from "../../lib/hooks/useManagerActivity";
import { useNotifications } from "../../lib/hooks/useNotifications";
import type { CalendarBooking } from "../../services/bookingsService";
import type {
  RecentEventPurchase,
  RecentPurchase,
} from "../../services/metricsService";

const PRIMARY = "#0644C7";
type IconName = ComponentProps<typeof Feather>["name"];
type Pulse = ReturnType<typeof usePulse>;

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const MONTHS = [
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

const money = (n: number | string | null | undefined) =>
  `$${Number(n ?? 0).toFixed(2)}`;

/** "2026-01-05" | "2026-01-05T13:30:00Z" -> "Jan 5, 2026". */
function fmtDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(`${raw.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "13:30" | "13:30:00" | ISO -> "1:30 PM". */
function fmtTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m[2]} ${meridian}`;
}

/** Small muted meta line used along a card's bottom row. */
const Meta = ({ text }: { text: string }) => (
  <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
    {text}
  </Text>
);

// Section shell — title, optional "count • timeframe" badge, View All, states.
// The icon, title, and View All button are static and always render; only the
// data-driven badge and card body swap to skeletons while `loading`.
type SectionProps = {
  icon: IconName;
  title: string;
  badge?: string;
  onViewAll?: () => void;
  empty: string;
  isEmpty: boolean;
  loading?: boolean;
  pulse?: Pulse;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
};

const Section = ({
  icon,
  title,
  badge,
  onViewAll,
  empty,
  isEmpty,
  loading,
  pulse,
  skeleton,
  children,
}: SectionProps) => (
  <View className="mb-5">
    <View className="flex-row items-center mb-3">
      <View className="w-7 h-7 rounded-lg items-center justify-center bg-[#0644C7]/10 mr-2">
        <Feather name={icon} size={15} color={PRIMARY} />
      </View>
      <View className="flex-1">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {title}
        </Text>
        {badge ? (
          loading && pulse ? (
            <BadgeSkeleton pulse={pulse} />
          ) : (
            <Text className="text-[11px] font-medium text-[#0644C7] mt-0.5">
              {badge}
            </Text>
          )
        ) : null}
      </View>
      {onViewAll && (
        <Pressable
          onPress={onViewAll}
          hitSlop={8}
          className="flex-row items-center gap-1 px-3 py-1.5 rounded-full bg-[#0644C7]/10 active:opacity-80"
        >
          <Text className="text-xs font-semibold text-[#0644C7]">View All</Text>
          <Feather name="chevron-right" size={13} color={PRIMARY} />
        </Pressable>
      )}
    </View>

    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden shadow-sm"
      style={CARD_SHADOW}
    >
      {loading ? (
        skeleton
      ) : isEmpty ? (
        <View className="items-center py-8 px-4">
          <Text className="text-sm text-gray-400 dark:text-gray-500">
            {empty}
          </Text>
        </View>
      ) : (
        children
      )}
    </View>
  </View>
);

/** Shared divider wrapper so rows in a section card share a separator. */
const Row = ({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) => (
  <View
    className={`px-4 py-3 ${index > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
  >
    {children}
  </View>
);

// Row renderers — one per web table.
const NewBookingRow = ({
  b,
  index,
  onView,
}: {
  b: CalendarBooking;
  index: number;
  onView: (id: number) => void;
}) => {
  const time = fmtTime(b.time);
  return (
    <Row index={index}>
      <View className="flex-row items-start justify-between mb-1">
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white flex-1 mr-2"
          numberOfLines={1}
        >
          {b.customerName}
        </Text>
        <StatusBadge status={b.status} />
      </View>
      <Text
        className="text-xs text-gray-500 dark:text-gray-400 mb-1.5"
        numberOfLines={1}
      >
        {b.packageName}
      </Text>
      <View className="flex-row items-center justify-between">
        <Meta text={`${fmtDate(b.date)}${time ? ` · ${time}` : ""}`} />
        <View className="flex-row items-center gap-3">
          <Meta text={`${b.participants} guests · ${money(b.totalAmount)}`} />
          <Pressable
            onPress={() => onView(b.id)}
            hitSlop={6}
            className="flex-row items-center gap-0.5 active:opacity-70"
          >
            <Text className="text-xs font-semibold text-[#0644C7]">View</Text>
            <Feather name="chevron-right" size={13} color={PRIMARY} />
          </Pressable>
        </View>
      </View>
    </Row>
  );
};

const TicketPurchaseRow = ({
  p,
  index,
}: {
  p: RecentPurchase;
  index: number;
}) => {
  const when = p.purchase_date || p.created_at;
  const time = fmtTime(when);
  return (
    <Row index={index}>
      <View className="flex-row items-start justify-between mb-1">
        <Text
          className="text-sm font-semibold text-gray-900 dark:text-white flex-1 mr-2"
          numberOfLines={1}
        >
          {p.customer_name || "Guest"}
        </Text>
        <StatusBadge status={p.status} />
      </View>
      <Text
        className="text-xs text-gray-500 dark:text-gray-400 mb-1.5"
        numberOfLines={1}
      >
        {p.attraction_name || "Attraction"}
        {p.location_name ? ` · ${p.location_name}` : ""}
      </Text>
      <View className="flex-row items-center justify-between">
        <Meta text={`${fmtDate(when)}${time ? ` · ${time}` : ""}`} />
        <Meta
          text={`${p.quantity}× · ${money(p.total_amount)}${
            p.payment_method ? ` · ${p.payment_method.replace(/_/g, " ")}` : ""
          }`}
        />
      </View>
    </Row>
  );
};

const EventPurchaseRow = ({
  e,
  index,
}: {
  e: RecentEventPurchase;
  index: number;
}) => (
  <Row index={index}>
    <View className="flex-row items-start justify-between mb-1">
      <Text
        className="text-sm font-semibold text-gray-900 dark:text-white flex-1 mr-2"
        numberOfLines={1}
      >
        {e.customer_name || "Guest"}
      </Text>
      <StatusBadge status={e.status} palette="event" />
    </View>
    <Text
      className="text-xs text-gray-500 dark:text-gray-400 mb-1.5"
      numberOfLines={1}
    >
      {e.event_name || "Event"}
    </Text>
    <View className="flex-row items-center justify-between">
      <Meta
        text={`${fmtDate(e.purchase_date || e.created_at)} · ${e.quantity}×`}
      />
      <Meta text={`${money(e.total_amount)} · Paid ${money(e.amount_paid)}`} />
    </View>
  </Row>
);

// Screen
const Activity = () => {
  const insets = useSafeAreaInsets();
  const pulse = usePulse();

  // Timeframe is shared with the Home dashboard filter.
  const { timeframe, dateFrom, dateTo } = useTimeframeSelection();
  const {
    newBookings,
    newBookingsCount,
    recentPurchases,
    recentEventPurchases,
    timeframeLabel,
    loading,
    error,
    refetch,
  } = useManagerActivity({ timeframe, dateFrom, dateTo });

  const {
    totalCount: unreadNotificationsCount,
    refresh: refreshNotifications,
  } = useNotifications("unread");

  const [refreshing, setRefreshing] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    null,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refreshNotifications()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refreshNotifications]);

  const newBookingsBadge = `${newBookingsCount}${
    timeframeLabel ? ` • ${timeframeLabel}` : ""
  }`;

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
            tintColor={PRIMARY}
            colors={[PRIMARY]}
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        {/* The header (above) and this title card are static chrome — they stay
            put through initial load, pull-to-refresh, and any re-fetch. Only the
            data-driven section bodies (and the New Bookings badge) shimmer. */}
        <View className="px-5 pt-0">
          <ScreenTitleCard
            title="Activity"
            subtitle="Monitor bookings, ticket purchases, and recent event activity."
          />

          {error ? (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5">
              <Text className="text-red-600 font-semibold">
                Something went wrong
              </Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
              <Pressable
                onPress={refetch}
                className="mt-3 self-start px-4 py-2 rounded-xl bg-[#0644C7]/10 active:opacity-80"
              >
                <Text className="text-xs font-semibold text-[#0644C7]">
                  Try Again
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Section
                icon="plus-circle"
                title="New Bookings"
                badge={newBookingsBadge}
                // Button stays visible to match the web, but does nothing yet.
                // TODO: Navigate to the Bookings screen when the mobile Bookings
                // module is implemented.
                onViewAll={() => {}}
                empty="No new bookings yet"
                isEmpty={newBookings.length === 0}
                loading={loading}
                pulse={pulse}
                skeleton={<NewBookingRowsSkeleton pulse={pulse} />}
              >
                {newBookings.map((b, i) => (
                  <NewBookingRow
                    key={b.id}
                    b={b}
                    index={i}
                    onView={setSelectedBookingId}
                  />
                ))}
              </Section>

              <Section
                icon="tag"
                title="Recent Ticket Purchases"
                empty="No ticket purchases found for this week"
                isEmpty={recentPurchases.length === 0}
                loading={loading}
                pulse={pulse}
                skeleton={<PurchaseRowsSkeleton pulse={pulse} />}
              >
                {recentPurchases.map((p, i) => (
                  <TicketPurchaseRow key={p.id} p={p} index={i} />
                ))}
              </Section>

              <Section
                icon="calendar"
                title="Recent Event Purchases"
                empty="No event purchases yet"
                isEmpty={recentEventPurchases.length === 0}
                loading={loading}
                pulse={pulse}
                skeleton={<PurchaseRowsSkeleton pulse={pulse} />}
              >
                {recentEventPurchases.map((e, i) => (
                  <EventPurchaseRow key={e.id} e={e} index={i} />
                ))}
              </Section>
            </>
          )}
        </View>
      </ScrollView>

      {/* Per-booking detail (reused from the calendar tab). */}
      <BookingDetailSheet
        bookingId={selectedBookingId}
        visible={selectedBookingId !== null}
        onClose={() => setSelectedBookingId(null)}
        onChanged={refetch}
      />
    </View>
  );
};

export default Activity;
