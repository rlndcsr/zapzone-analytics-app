import React from "react";
import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const WEEK_DAYS = 7;
const WEEK_ROWS = 6;

/** A single grid cell — mirrors the real month cell: minHeight 80, internal
 * borders, a day-number circle plus two faint status-count lines. */
function DayCellSkeleton({
  pulse,
  isLastCol,
  isLastRow,
}: {
  pulse: ReturnType<typeof usePulse>;
  isLastCol: boolean;
  isLastRow: boolean;
}) {
  return (
    <View
      style={{ minHeight: 80 }}
      className={`flex-1 p-1.5 ${
        !isLastCol ? "border-r border-gray-100 dark:border-neutral-800" : ""
      } ${!isLastRow ? "border-b border-gray-100 dark:border-neutral-800" : ""}`}
    >
      {/* day number (w-8 h-8 rounded-full, mb-1) */}
      <SkeletonBlock pulse={pulse} className="w-8 h-8 rounded-full mb-1" />
      {/* two status-count lines (dot + text-[10px], mb-0.5) */}
      <View className="flex-row items-center gap-1 mb-0.5">
        <SkeletonBlock pulse={pulse} className="w-1.5 h-1.5 rounded-full" />
        <SkeletonBlock pulse={pulse} className="w-5 h-2" />
      </View>
      <View className="flex-row items-center gap-1 mb-0.5">
        <SkeletonBlock pulse={pulse} className="w-1.5 h-1.5 rounded-full" />
        <SkeletonBlock pulse={pulse} className="w-4 h-2" />
      </View>
    </View>
  );
}

/** Placeholder for the month grid while the month's bookings load. `rows`
 * matches the real month (`cells.length / 7`) so there is no layout shift. */
export function CalendarSkeleton({ rows = WEEK_ROWS }: { rows?: number }) {
  const pulse = usePulse();

  return (
    <>
      <View className="rounded-2xl overflow-hidden bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800">
        {/* Weekday header row (flex-1 items-center py-3, text-xs) */}
        <View className="flex-row bg-gray-50 dark:bg-neutral-800/50">
          {Array.from({ length: WEEK_DAYS }).map((_, i) => (
            <View key={i} className="flex-1 items-center py-3">
              <View className="h-4 justify-center">
                <SkeletonBlock pulse={pulse} className="w-6 h-3" />
              </View>
            </View>
          ))}
        </View>

        {/* Day cells */}
        {Array.from({ length: rows }).map((_, row) => (
          <View key={row} className="flex-row">
            {Array.from({ length: WEEK_DAYS }).map((_, col) => (
              <DayCellSkeleton
                key={col}
                pulse={pulse}
                isLastCol={col === WEEK_DAYS - 1}
                isLastRow={row === rows - 1}
              />
            ))}
          </View>
        ))}
      </View>

      {/* Status legend (flex-row justify-center gap-4 mt-3 mb-1) */}
      <View className="flex-row items-center justify-center gap-4 mt-3 mb-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} className="flex-row items-center gap-1.5">
            <SkeletonBlock pulse={pulse} className="w-3 h-3 rounded-full" />
            <View className="h-4 justify-center">
              <SkeletonBlock pulse={pulse} className="w-16 h-3" />
            </View>
          </View>
        ))}
      </View>
    </>
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
