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

/** Matches TopLocationCard: rank circle, name + stats line + revenue
 *  breakdown line, revenue figure, utilization bar. */
function TopLocationCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 mb-3 shadow-sm border-2 border-[#0644C7]"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Row 1: rank + name, revenue label/value on the right */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-3 flex-1 mr-3">
          <SkeletonBlock pulse={pulse} className="w-10 h-10 rounded-full" />
          <SkeletonLine pulse={pulse} width="w-36" line="h-7" bar="h-5" />
        </View>
        <View className="items-end">
          <SkeletonLine
            pulse={pulse}
            width="w-14"
            line="h-4"
            className="mb-0.5"
          />
          <SkeletonLine pulse={pulse} width="w-20" line="h-6" bar="h-5" />
        </View>
      </View>

      {/* Row 2: Bookings / Tickets / Events / Guests */}
      <View className="flex-row mb-3">
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
      </View>

      {/* Row 3: utilization label + track (flex-1 h-2) + percentage */}
      <View className="mb-3">
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" className="mb-1" />
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <SkeletonBlock pulse={pulse} className="w-full h-2 rounded-full" />
          </View>
          <SkeletonLine pulse={pulse} width="w-8" line="h-4" />
        </View>
      </View>

      {/* Row 4: revenue split by source */}
      <View className="flex-row pt-3 border-t border-[#0644C7]/20">
        <RevenueColumnSkeleton pulse={pulse} />
        <RevenueColumnSkeleton pulse={pulse} />
        <RevenueColumnSkeleton pulse={pulse} />
      </View>
    </View>
  );
}

/** One stat column: label (text-xs, mb-0.5) + value (text-lg). */
function StatColumnSkeleton({
  pulse,
  value = "w-10",
}: {
  pulse: SharedValue<number>;
  value?: string;
}) {
  return (
    <View className="flex-1">
      <SkeletonLine pulse={pulse} width="w-14" line="h-4" className="mb-0.5" />
      <SkeletonLine pulse={pulse} width={value} line="h-6" bar="h-5" />
    </View>
  );
}

/** One revenue-breakdown column: tiny label (text-[10px]) + value (text-xs). */
function RevenueColumnSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="flex-1">
      <SkeletonLine pulse={pulse} width="w-16" line="h-3" bar="h-2" />
      <SkeletonLine pulse={pulse} width="w-12" line="h-4" />
    </View>
  );
}

/** Matches OverviewCard: name + dot, Bookings/Tickets/Events,
 *  Revenue/Utilization, then the Bookings/Tickets/Events revenue breakdown. */
function OverviewCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-3">
        {/* name (text-base) */}
        <SkeletonLine pulse={pulse} width="w-36" line="h-6" bar="h-4" />
        <SkeletonBlock pulse={pulse} className="w-3 h-3 rounded-full" />
      </View>

      <View className="flex-row mb-3">
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
        <StatColumnSkeleton pulse={pulse} />
      </View>

      {/* Revenue + Utilization */}
      <View className="flex-row mb-3">
        <StatColumnSkeleton pulse={pulse} value="w-20" />
        <View className="flex-1">
          <SkeletonLine
            pulse={pulse}
            width="w-16"
            line="h-4"
            className="mb-0.5"
          />
          <View className="flex-row items-center gap-3 h-6">
            <View className="flex-1">
              <SkeletonBlock
                pulse={pulse}
                className="w-full h-2 rounded-full"
              />
            </View>
            <SkeletonLine pulse={pulse} width="w-8" line="h-4" />
          </View>
        </View>
      </View>

      <View className="flex-row pt-3 border-t border-gray-100 dark:border-neutral-800">
        <RevenueColumnSkeleton pulse={pulse} />
        <RevenueColumnSkeleton pulse={pulse} />
        <RevenueColumnSkeleton pulse={pulse} />
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
