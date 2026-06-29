import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const TOP_COUNT = 3;
const OVERVIEW_COUNT = 4;

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

/** Matches TopLocationCard: rank circle, name + stats line, revenue. */
function TopLocationCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="border border-blue-200 dark:border-blue-900 bg-blue-50/40 rounded-2xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-3 flex-1 mr-2">
          <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-full" />
          <View className="flex-1">
            {/* name (text-base, 1 line) + stats (text-xs, wraps to 2 lines) */}
            <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
            <SkeletonLine
              pulse={pulse}
              width="w-48"
              line="h-4"
              className="mt-0.5"
            />
            <SkeletonLine pulse={pulse} width="w-28" line="h-4" />
          </View>
        </View>
        {/* revenue (text-lg) */}
        <SkeletonLine pulse={pulse} width="w-24" line="h-7" bar="h-5" />
      </View>
      <View className="h-4" />
    </View>
  );
}

/** One stat column: label (text-xs, mb-1) + value (text-xl). */
function StatColumnSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="flex-1">
      <SkeletonLine pulse={pulse} width="w-14" line="h-4" className="mb-1" />
      <SkeletonLine pulse={pulse} width="w-10" line="h-7" bar="h-5" />
    </View>
  );
}

/** Matches OverviewCard: name + dot, 3 stat columns, revenue. */
function OverviewCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-4">
        {/* name (text-base) */}
        <SkeletonLine pulse={pulse} width="w-36" line="h-6" bar="h-4" />
        <SkeletonBlock pulse={pulse} className="w-2.5 h-2.5 rounded-full" />
      </View>

      <View className="flex-row mb-4">
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
      </View>

      <View className="flex-row items-end justify-between">
        <View>
          {/* Revenue label (text-xs, mb-1) + value (text-lg) */}
          <SkeletonLine
            pulse={pulse}
            width="w-14"
            line="h-4"
            className="mb-1"
          />
          <SkeletonLine pulse={pulse} width="w-20" line="h-7" bar="h-5" />
        </View>
      </View>
    </View>
  );
}

/** Skeletons for the "Top Performing Locations" cards. */
export function TopCardsSkeleton() {
  const pulse = usePulse();

  return (
    <View>
      {Array.from({ length: TOP_COUNT }).map((_, index) => (
        <TopLocationCardSkeleton key={index} pulse={pulse} />
      ))}
    </View>
  );
}

/** Skeletons for the "All Locations Overview" cards. */
export function OverviewCardsSkeleton() {
  const pulse = usePulse();

  return (
    <View>
      {Array.from({ length: OVERVIEW_COUNT }).map((_, index) => (
        <OverviewCardSkeleton key={index} pulse={pulse} />
      ))}
    </View>
  );
}
