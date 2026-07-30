import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { convertTo12Hour } from "../../lib/time";
import type { PurchaseRow } from "../../services/attractionPurchasesService";
import type { CalendarBooking } from "../../services/bookingsService";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";
const MUTED = "#9CA3AF";

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
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  count: number;
}) => (
  <View className="flex-row items-center gap-2 mb-2.5">
    <Feather name={icon} size={14} color={PRIMARY} />
    <Text className="text-sm font-bold text-gray-900 dark:text-white">
      {title} ({count})
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
    {/* Customer + status */}
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {booking.customerName}
        </Text>
        {!!booking.customerEmail && (
          <Text
            className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
            numberOfLines={1}
          >
            {booking.customerEmail}
          </Text>
        )}
      </View>
      <View className="items-end gap-1">
        <StatusBadge status={booking.status} />
        {!!booking.referenceNumber && (
          <Text className="text-[10px] text-gray-400 dark:text-gray-500">
            #{booking.referenceNumber}
          </Text>
        )}
      </View>
    </View>

    {/* Time · participants · package · location */}
    <View className="flex-row flex-wrap gap-y-2 mt-3">
      <Meta icon="clock" label={convertTo12Hour(booking.time) || "—"} />
      <Meta icon="users" label={`${booking.participants} participants`} />
      <Meta icon="package" label={booking.packageName} />
      {!!booking.locationName && (
        <Meta icon="map-pin" label={booking.locationName} />
      )}
    </View>

    {/* Payment + total */}
    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-1.5">
        <Feather name="credit-card" size={12} color={MUTED} />
        <Text className="text-xs text-gray-600 dark:text-gray-300 capitalize">
          {booking.paymentMethod || "—"}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-sm font-bold text-gray-900 dark:text-white">
          {money(booking.totalAmount)}
        </Text>
        <Text className="text-[10px] text-gray-400 dark:text-gray-500">
          (Paid: {money(booking.amountPaid)})
        </Text>
      </View>
    </View>

    <Text className="text-[11px] text-center text-gray-400 dark:text-gray-500 mt-2.5">
      Tap to view full details
    </Text>
  </Pressable>
);

/** One attraction purchase — same neutral card, with its own type pill. */
const AttractionPurchaseCard = ({
  purchase,
  onPress,
}: {
  purchase: PurchaseRow;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="rounded-2xl p-4 mb-2.5 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 active:opacity-80"
    accessibilityRole="button"
    accessibilityLabel={`View purchase for ${purchase.customerName}`}
  >
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text
          className="text-base font-bold text-gray-900 dark:text-white"
          numberOfLines={1}
        >
          {purchase.attractionName}
        </Text>
        <Text
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
          numberOfLines={1}
        >
          {purchase.customerName}
        </Text>
      </View>
      <View className="items-end gap-1">
        <StatusBadge status={purchase.status} />
        <View className="px-2 py-1 rounded-full bg-gray-100 dark:bg-neutral-800">
          <Text className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
            Attraction
          </Text>
        </View>
      </View>
    </View>

    <View className="flex-row flex-wrap gap-y-2 mt-3">
      <Meta
        icon="clock"
        label={convertTo12Hour(purchase.scheduledTime) || "—"}
      />
      <Meta
        icon="tag"
        label={`${purchase.quantity} ticket${purchase.quantity === 1 ? "" : "s"}`}
      />
    </View>

    <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        Scheduled {purchase.scheduledDate?.substring(0, 10) ?? "—"}
      </Text>
      <Text className="text-sm font-bold text-gray-900 dark:text-white">
        {money(purchase.totalAmount)}
      </Text>
    </View>
  </Pressable>
);

/**
 * The body of a calendar day-detail sheet: "Package Bookings (n)" then
 * "Attraction Purchases (n)", each card tappable through to its own record.
 * Deliberately minimal — one neutral card style, colour only in status pills.
 */
export function CalendarDaySections({
  bookings,
  purchases,
  onBooking,
  onPurchase,
}: {
  bookings: CalendarBooking[];
  purchases: PurchaseRow[];
  onBooking: (id: number) => void;
  onPurchase: (id: number) => void;
}) {
  if (bookings.length === 0 && purchases.length === 0) {
    return (
      <View className="py-10 items-center">
        <Feather name="calendar" size={28} color={MUTED} />
        <Text className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Nothing scheduled for this day
        </Text>
      </View>
    );
  }

  return (
    <View>
      {bookings.length > 0 && (
        <View className="mb-4">
          <SectionHeader
            icon="package"
            title="Package Bookings"
            count={bookings.length}
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
        <View>
          <SectionHeader
            icon="tag"
            title="Attraction Purchases"
            count={purchases.length}
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
    </View>
  );
}
