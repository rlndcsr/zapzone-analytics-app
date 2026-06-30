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
