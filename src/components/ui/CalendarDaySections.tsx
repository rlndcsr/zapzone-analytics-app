import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { convertTo12Hour } from "../../lib/time";
import type { PurchaseRow } from "../../services/attractionPurchasesService";
import type { CalendarBooking } from "../../services/bookingsService";
import type { EventPurchaseRow } from "../../services/eventPurchasesService";
import { StatusBadge } from "./StatusBadge";

const MUTED = "#9CA3AF";

// Per-activity tints, matching the web day modal: -600 on section icons,
// -800 on the count chips (same pair the month-grid chips already use).
const BOOKING_TINT = "#2563EB";
const ATTRACTION_TINT = "#9333EA";
const EVENT_TINT = "#D97706";
const BOOKING_CHIP_TINT = "#1E40AF";
const ATTRACTION_CHIP_TINT = "#6B21A8";
const EVENT_CHIP_TINT = "#92400E";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Icon + label meta line, the repeated unit inside both cards. */
const Meta = ({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
}) => (
  <View className="flex-row items-center gap-1.5 flex-1 min-w-[42%]">
    <Feather name={icon} size={12} color={MUTED} />
    <Text
      className="text-xs text-gray-600 dark:text-gray-300 flex-1"
      numberOfLines={1}
    >
      {label}
    </Text>
  </View>
);

/** Section heading with its count, e.g. "Package Bookings (2)". */
const SectionHeader = ({
  icon,
  title,
  count,
  tint,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  count: number;
  tint: string;
}) => (
  <View className="flex-row items-center gap-2 mb-2.5">
    <Feather name={icon} size={14} color={tint} />
    <Text className="text-sm font-bold text-gray-900 dark:text-white">
      {title} ({count})
    </Text>
  </View>
);

/** One count pill in the sheet's summary row (web modal's chip strip). */
const SummaryChip = ({
  icon,
  tint,
  className,
  label,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  className: string;
  label: string;
}) => (
  <View
    className={`flex-row items-center gap-1.5 rounded-full px-3 py-1 ${className}`}
  >
    <Feather name={icon} size={13} color={tint} />
    <Text className="text-xs font-medium" style={{ color: tint }}>
      {label}
    </Text>
  </View>
);

/**
 * One package booking. Neutral card (no status tint / package accent) so the
 * status pill is the only colour, matching the web day modal.
 */
const DayBookingCard = ({
  booking,
  onPress,
}: {
  booking: CalendarBooking;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="rounded-2xl p-4 mb-2.5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 active:opacity-80"
    accessibilityRole="button"
    accessibilityLabel={`View booking for ${booking.customerName}`}
  >
    {/* Guest + status */}
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {booking.customerName}
        </Text>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
          numberOfLines={1}
        >
          {booking.customerEmail || "No email"}
        </Text>
      </View>
      <View className="items-end gap-1">
        <StatusBadge status={booking.status} />
        {!!booking.referenceNumber && (
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            #{booking.referenceNumber}
          </Text>
        )}
      </View>
    </View>

    {/* Time · participants · package · location */}
    <View className="flex-row flex-wrap gap-y-2 mt-3">
      <Meta icon="clock" label={convertTo12Hour(booking.time) || "—"} />
      <Meta icon="users" label={`${booking.participants} participants`} />
      <Meta icon="package" label={booking.packageName || "N/A"} />
      {!!booking.locationName && (
        <Meta icon="map-pin" label={booking.locationName} />
      )}
    </View>

    {/* Attraction / add-on counts, as chips */}
    {(booking.attractionCount > 0 || booking.addOnCount > 0) && (
      <View className="flex-row flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        {booking.attractionCount > 0 && (
          <View className="rounded bg-purple-50 dark:bg-purple-900/20 px-2 py-1">
            <Text className="text-xs text-purple-700 dark:text-purple-300">
              {booking.attractionCount} attraction
              {booking.attractionCount === 1 ? "" : "s"}
            </Text>
          </View>
        )}
        {booking.addOnCount > 0 && (
          <View className="rounded bg-blue-50 dark:bg-blue-900/20 px-2 py-1">
            <Text className="text-xs text-blue-700 dark:text-blue-300">
              {booking.addOnCount} add-on{booking.addOnCount === 1 ? "" : "s"}
            </Text>
          </View>
        )}
      </View>
    )}

    {/* Payment method + total (green when settled, amber otherwise) */}
    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="credit-card" size={12} color={MUTED} />
        <Text className="text-xs text-gray-600 dark:text-gray-300 capitalize">
          {booking.paymentMethod || "N/A"}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className={`text-sm font-semibold ${
            booking.paymentStatus === "paid"
              ? "text-green-600 dark:text-green-400"
              : "text-yellow-600 dark:text-yellow-400"
          }`}
        >
          {money(booking.totalAmount)}
        </Text>
        {booking.paymentStatus === "partial" && (
          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
            (Paid: {money(booking.amountPaid)})
          </Text>
        )}
      </View>
    </View>

    <Text className="text-[11px] text-center text-gray-400 dark:text-gray-500 mt-3">
      Tap to view full details
    </Text>
  </Pressable>
);

/** One attraction purchase — purple-tinted card, as on the web. */
const AttractionPurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: PurchaseRow;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="rounded-2xl p-4 mb-2.5 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-900/40 active:opacity-80"
    accessibilityRole="button"
    accessibilityLabel={`View purchase for ${purchase.customerName}`}
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Feather name="tag" size={14} color={ATTRACTION_TINT} />
          <Text
            className="text-base font-bold text-gray-900 dark:text-white flex-1"
            numberOfLines={1}
          >
            {purchase.attractionName}
          </Text>
        </View>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
      </View>
      <View className="items-end gap-1">
        <StatusBadge status={purchase.status} />
        <View className="px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40">
          <Text className="text-[10px] font-semibold text-purple-800 dark:text-purple-300">
            Attraction
          </Text>
        </View>
      </View>
    </View>

    <View className="flex-row flex-wrap gap-y-2 mt-3">
      <Meta
        icon="clock"
        label={convertTo12Hour(purchase.scheduledTime) || "Any time"}
      />
      <Meta
        icon="tag"
        label={`${purchase.quantity} ticket${purchase.quantity === 1 ? "" : "s"}`}
      />
    </View>

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-purple-100 dark:border-purple-900/30">
      <Text className="text-xs text-gray-500 dark:text-gray-400">
        Scheduled{" "}
        {(purchase.scheduledDate ?? purchase.purchaseDate)?.substring(0, 10) ??
          "—"}
      </Text>
      <Text className="text-sm font-bold text-gray-900 dark:text-white">
        {money(purchase.totalAmount)}
      </Text>
    </View>
  </Pressable>
);

/** One event registration — amber-tinted card, as on the web. */
const EventPurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: EventPurchaseRow;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="rounded-2xl p-4 mb-2.5 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 active:opacity-80"
    accessibilityRole="button"
    accessibilityLabel={`View registration for ${purchase.customerName}`}
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Feather name="star" size={14} color={EVENT_TINT} />
          <Text
            className="text-base font-bold text-gray-900 dark:text-white flex-1"
            numberOfLines={1}
          >
            {purchase.eventName}
          </Text>
        </View>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
      </View>
      <View className="items-end gap-1">
        <StatusBadge status={purchase.status} />
        <View className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Text className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
            Event
          </Text>
        </View>
      </View>
    </View>

    <View className="flex-row flex-wrap gap-y-2 mt-3">
      <Meta icon="clock" label={convertTo12Hour(purchase.purchaseTime) || "—"} />
      <Meta
        icon="users"
        label={`${purchase.quantity} ticket${purchase.quantity === 1 ? "" : "s"}`}
      />
      {!!purchase.locationName && (
        <Meta icon="map-pin" label={purchase.locationName} />
      )}
    </View>

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-amber-100 dark:border-amber-900/30">
      <Text className="text-xs text-gray-500 dark:text-gray-400">
        #{purchase.referenceNumber || "—"}
      </Text>
      <Text className="text-sm font-bold text-gray-900 dark:text-white">
        {money(purchase.totalAmount)}
      </Text>
    </View>
  </Pressable>
);

/**
 * The body of a calendar day-detail sheet: a count-chip strip, then "Package
 * Bookings (n)" / "Attraction Purchases (n)" / "Event Registrations (n)" — the
 * web day modal's sections and colours, each card tappable to its own record.
 */
export function CalendarDaySections({
  bookings,
  purchases,
  events = [],
  onBooking,
  onPurchase,
  onEvent,
}: {
  bookings: CalendarBooking[];
  purchases: PurchaseRow[];
  events?: EventPurchaseRow[];
  onBooking: (id: number) => void;
  onPurchase: (id: number) => void;
  onEvent?: (id: number) => void;
}) {
  if (bookings.length === 0 && purchases.length === 0 && events.length === 0) {
    return (
      <View className="py-10 items-center">
        <Feather name="calendar" size={28} color={MUTED} />
        <Text className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          No scheduled activity for this day
        </Text>
      </View>
    );
  }

  // Tickets are summed by quantity, registrations counted — as on the web.
  const tickets = purchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  return (
    <View>
      <View className="flex-row flex-wrap gap-2 mb-5">
        <SummaryChip
          icon="package"
          tint={BOOKING_CHIP_TINT}
          className="bg-blue-100 dark:bg-blue-900/40"
          label={`${bookings.length} Booking${bookings.length === 1 ? "" : "s"}`}
        />
        <SummaryChip
          icon="tag"
          tint={ATTRACTION_CHIP_TINT}
          className="bg-purple-100 dark:bg-purple-900/40"
          label={`${tickets} Attraction Ticket${tickets === 1 ? "" : "s"}`}
        />
        <SummaryChip
          icon="star"
          tint={EVENT_CHIP_TINT}
          className="bg-amber-100 dark:bg-amber-900/40"
          label={`${events.length} Event Registration${events.length === 1 ? "" : "s"}`}
        />
      </View>

      {bookings.length > 0 && (
        <View className="mb-5">
          <SectionHeader
            icon="package"
            title="Package Bookings"
            count={bookings.length}
            tint={BOOKING_TINT}
          />
          {bookings.map((b) => (
            <DayBookingCard
              key={b.id}
              booking={b}
              onPress={() => onBooking(b.id)}
            />
          ))}
        </View>
      )}

      {purchases.length > 0 && (
        <View className="mb-5">
          <SectionHeader
            icon="tag"
            title="Attraction Purchases"
            count={purchases.length}
            tint={ATTRACTION_TINT}
          />
          {purchases.map((p) => (
            <AttractionPurchaseCard
              key={p.id}
              purchase={p}
              onPress={() => onPurchase(p.id)}
            />
          ))}
        </View>
      )}

      {events.length > 0 && (
        <View>
          <SectionHeader
            icon="star"
            title="Event Registrations"
            count={events.length}
            tint={EVENT_TINT}
          />
          {events.map((e) => (
            <EventPurchaseCard
              key={e.id}
              purchase={e}
              onPress={() => onEvent?.(e.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
