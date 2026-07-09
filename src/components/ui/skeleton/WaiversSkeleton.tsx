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

/** KPI grid placeholder (four half-width tiles). */
export function WaiversKpiSkeleton() {
  const pulse = usePulse();
  return (
    <View className="flex-row flex-wrap -mx-1.5 mb-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} className="w-1/2">
          <View
            className="bg-white dark:bg-neutral-900 rounded-2xl p-4 m-1.5 shadow-sm"
            style={CARD_SHADOW}
          >
            <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-xl" />
            <SkeletonLine pulse={pulse} width="w-20" line="h-4" bar="h-2.5" className="mt-3" />
            <SkeletonLine pulse={pulse} width="w-12" line="h-7" bar="h-6" className="mt-1" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Card placeholder shared by the three waiver lists (title + subtitle + meta). */
function RowCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-3 shadow-sm"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <SkeletonLine pulse={pulse} width="w-40" line="h-6" bar="h-4" />
          <SkeletonLine pulse={pulse} width="w-28" line="h-4" className="mt-1" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-full" />
      </View>
      <SkeletonLine pulse={pulse} width="w-48" line="h-4" bar="h-2.5" className="mt-1" />
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <SkeletonLine pulse={pulse} width="w-24" line="h-4" bar="h-2.5" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
      </View>
    </View>
  );
}

/** The waiver list placeholder — used by Records, Templates, and Invites. */
export function WaiversListSkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <RowCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
