import React from "react";
import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const WEEK_DAYS = 7;
const WEEK_ROWS = 6;

/** A single grid cell: day number block plus two faint count lines. */
function DayCellSkeleton({ pulse }: { pulse: ReturnType<typeof usePulse> }) {
  return (
    <View className="flex-1 aspect-square border border-gray-100 dark:border-neutral-800 p-1.5">
      <SkeletonBlock pulse={pulse} className="w-5 h-3 mb-2" />
      <SkeletonBlock pulse={pulse} className="w-full h-2 mb-1" />
      <SkeletonBlock pulse={pulse} className="w-2/3 h-2" />
    </View>
  );
}

/** Placeholder for the month grid while the month's bookings load. */
export function CalendarSkeleton() {
  const pulse = usePulse();

  return (
    <View className="rounded-2xl overflow-hidden border border-gray-200 dark:border-neutral-700">
      {/* Weekday header row */}
      <View className="flex-row bg-gray-50 dark:bg-neutral-900">
        {Array.from({ length: WEEK_DAYS }).map((_, i) => (
          <View key={i} className="flex-1 items-center py-2.5">
            <SkeletonBlock pulse={pulse} className="w-6 h-3" />
          </View>
        ))}
      </View>

      {/* 6 weeks of day cells */}
      {Array.from({ length: WEEK_ROWS }).map((_, row) => (
        <View key={row} className="flex-row">
          {Array.from({ length: WEEK_DAYS }).map((_, col) => (
            <DayCellSkeleton key={col} pulse={pulse} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Placeholder matching a single `BookingCard` (time + badge, name + amount,
 * customer, then location/participants). */
function BookingCardSkeleton({ pulse }: { pulse: ReturnType<typeof usePulse> }) {
  return (
    <View className="border border-gray-100 dark:border-neutral-800 rounded-2xl p-4 mb-3">
      <View className="flex-row items-start justify-between mb-1">
        <SkeletonBlock pulse={pulse} className="w-20 h-4" />
        <SkeletonBlock pulse={pulse} className="w-20 h-5 rounded-full" />
      </View>
      <View className="flex-row items-center justify-between">
        <SkeletonBlock pulse={pulse} className="w-40 h-5" />
        <SkeletonBlock pulse={pulse} className="w-16 h-5" />
      </View>
      <SkeletonBlock pulse={pulse} className="w-32 h-4 mt-1.5" />
      <View className="flex-row items-center gap-4 mt-2.5">
        <SkeletonBlock pulse={pulse} className="w-24 h-3" />
        <SkeletonBlock pulse={pulse} className="w-28 h-3" />
      </View>
    </View>
  );
}

/** One day section: bold day label + count, then its booking cards. */
function DaySectionSkeleton({
  pulse,
  cards,
}: {
  pulse: ReturnType<typeof usePulse>;
  cards: number;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center gap-2 mb-2">
        <SkeletonBlock pulse={pulse} className="w-14 h-4" />
        <SkeletonBlock pulse={pulse} className="w-16 h-3" />
      </View>
      {Array.from({ length: cards }).map((_, i) => (
        <BookingCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}

// Per-day card counts so the week agenda reads as a realistic mix of days.
const WEEK_CARD_COUNTS = [1, 2, 1, 1, 2, 1, 1];

/** Placeholder for the week agenda: 7 day sections, each with booking cards. */
export function CalendarWeekSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {WEEK_CARD_COUNTS.map((cards, i) => (
        <DaySectionSkeleton key={i} pulse={pulse} cards={cards} />
      ))}
    </View>
  );
}

/** Placeholder for the single-day view: a short stack of booking cards. */
export function CalendarDaySkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: 3 }).map((_, i) => (
        <BookingCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
