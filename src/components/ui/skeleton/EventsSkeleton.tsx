import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const LIST_COUNT = 5;

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** A skeleton bar vertically centered within a text line's height. */
function SkeletonLine({
  pulse,
  width,
  line,
  bar = "h-3",
  className = "",
}: {
  pulse: SharedValue<number>;
  width: string;
  line: string;
  bar?: string;
  className?: string;
}) {
  return (
    <View className={`${line} justify-center ${className}`}>
      <SkeletonBlock pulse={pulse} className={`${width} ${bar}`} />
    </View>
  );
}

/** Matches EventCard: name + date/time, status pill, description, price +
 *  interval, and the features/capacity stat row. */
function EventCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* name/date (left) + status pill (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
          <SkeletonLine pulse={pulse} width="w-28" line="h-4" className="mt-1" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-16 h-6 rounded-full" />
      </View>

      {/* description (2 lines) */}
      <SkeletonLine pulse={pulse} width="w-full" line="h-4" bar="h-2.5" />
      <SkeletonLine pulse={pulse} width="w-2/3" line="h-4" bar="h-2.5" className="mt-1" />

      {/* date-type chip + price */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <SkeletonBlock pulse={pulse} className="w-24 h-6 rounded-lg" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-5" bar="h-4" />
      </View>

      {/* time / interval / capacity stat row */}
      <View className="flex-row items-center gap-4 mt-2">
        <SkeletonLine pulse={pulse} width="w-24" line="h-4" bar="h-2.5" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
      </View>
    </View>
  );
}

/** The event card list placeholder. */
export function EventsListSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <EventCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
