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

/** Matches a package card: grip/checkbox + name, power toggle, location, date,
 *  description, category/buffer tags, and price + capacity. */
function PackageCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      {/* grip + checkbox + name (left), power toggle (right) */}
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-start gap-2.5 flex-1 mr-2">
          <SkeletonBlock pulse={pulse} className="w-4 h-4 rounded" />
          <SkeletonBlock pulse={pulse} className="w-5 h-5 rounded" />
          <SkeletonLine pulse={pulse} width="w-36" line="h-5" bar="h-4" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-8 h-8 rounded-lg" />
      </View>

      {/* location */}
      <SkeletonLine pulse={pulse} width="w-40" line="h-4" bar="h-2.5" className="mt-3" />
      {/* date */}
      <SkeletonLine pulse={pulse} width="w-24" line="h-4" bar="h-2.5" className="mt-1.5" />

      {/* description (2 lines) */}
      <SkeletonLine pulse={pulse} width="w-full" line="h-5" bar="h-2.5" className="mt-3" />
      <SkeletonLine pulse={pulse} width="w-2/3" line="h-5" bar="h-2.5" className="mt-1" />

      {/* category + buffer tags */}
      <View className="flex-row items-center gap-2 mt-3">
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-md" />
        <SkeletonBlock pulse={pulse} className="w-24 h-6 rounded-md" />
      </View>

      {/* price + capacity */}
      <View className="flex-row items-center justify-between mt-4">
        <SkeletonLine pulse={pulse} width="w-16" line="h-6" bar="h-5" />
        <SkeletonLine pulse={pulse} width="w-10" line="h-5" bar="h-3.5" />
      </View>
    </View>
  );
}

/** The package card list placeholder. */
export function PackagesListSkeleton() {
  const pulse = usePulse();
  return (
    <View className="mt-4 gap-4">
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <PackageCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
