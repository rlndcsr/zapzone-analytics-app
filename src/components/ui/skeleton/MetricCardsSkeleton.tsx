import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

// Matches the number of cards in the dashboard grid so swapping skeleton ->
// data causes no layout shift. Defaults to the company_admin card count.
const DEFAULT_CARD_COUNT = 7;

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

/** Matches MetricCard: label + title, icon badge, value, subtitle. */
function MetricCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-5 m-1.5 shadow-sm"
      style={{
        shadowColor: "#424242",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Row 1: label + title (left) + icon badge (right) */}
      <View className="flex-row items-start justify-between mb-4">
        <View className="flex-1 mr-2">
          {/* label (text-xs, uppercase) */}
          <SkeletonLine pulse={pulse} width="w-16" line="h-4" />
          {/* title (text-sm, mt-1) */}
          <SkeletonLine
            pulse={pulse}
            width="w-24"
            line="h-5"
            bar="h-4"
            className="mt-1"
          />
        </View>
        <SkeletonBlock pulse={pulse} className="w-10 h-10 rounded-xl" />
      </View>

      {/* value (text-3xl) */}
      <SkeletonLine pulse={pulse} width="w-16" line="h-9" bar="h-7" />
      {/* subtitle (text-xs, mt-1.5) */}
      <SkeletonLine pulse={pulse} width="w-20" line="h-4" className="mt-1.5" />
    </View>
  );
}

export function MetricCardsSkeleton({
  count = DEFAULT_CARD_COUNT,
  columns = 2,
}: {
  count?: number;
  /** Cards per row — mirrors the dashboard's grid/list toggle (2 = grid, 1 = list). */
  columns?: 1 | 2;
} = {}) {
  const pulse = usePulse();

  return (
    <View className="flex-row flex-wrap -mx-1.5">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className={columns === 2 ? "w-1/2" : "w-full"}>
          <MetricCardSkeleton pulse={pulse} />
        </View>
      ))}
    </View>
  );
}
