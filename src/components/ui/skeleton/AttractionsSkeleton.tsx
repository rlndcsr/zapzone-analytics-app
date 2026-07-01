import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const KPI_COUNT = 4;
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

/** Matches AttractionKpiCard: icon badge, label, value, subtitle. */
function KpiCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 m-1.5 shadow-sm"
      style={CARD_SHADOW}
    >
      <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-xl" />
      <SkeletonLine pulse={pulse} width="w-20" line="h-4" className="mt-3" />
      <SkeletonLine pulse={pulse} width="w-14" line="h-8" bar="h-6" className="mt-1" />
      <SkeletonLine pulse={pulse} width="w-16" line="h-4" className="mt-1" />
    </View>
  );
}

/** The 4 KPI summary cards, in a 2-column grid. */
export function AttractionsKpiSkeleton() {
  const pulse = usePulse();
  return (
    <View className="flex-row flex-wrap -mx-1.5">
      {Array.from({ length: KPI_COUNT }).map((_, i) => (
        <View key={i} className="w-1/2">
          <KpiCardSkeleton pulse={pulse} />
        </View>
      ))}
    </View>
  );
}

/** Matches AttractionCard: name + location, status pill, description,
 *  category chip + price, and the capacity/duration stat row. */
function AttractionCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      {/* name/location (left) + status pill (right) */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
          <SkeletonLine pulse={pulse} width="w-24" line="h-4" className="mt-1" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-16 h-6 rounded-full" />
      </View>

      {/* description (2 lines) */}
      <SkeletonLine pulse={pulse} width="w-full" line="h-4" bar="h-2.5" />
      <SkeletonLine pulse={pulse} width="w-2/3" line="h-4" bar="h-2.5" className="mt-1" />

      {/* category chip + price */}
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-lg" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-5" bar="h-4" />
      </View>

      {/* capacity / duration / created stat row */}
      <View className="flex-row items-center gap-4 mt-2">
        <SkeletonLine pulse={pulse} width="w-20" line="h-4" bar="h-2.5" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
      </View>
    </View>
  );
}

/** The attraction card list placeholder. */
export function AttractionsListSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <AttractionCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
