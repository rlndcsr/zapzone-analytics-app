import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** A stat-tile placeholder (icon + label + value). */
function TileSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2">
        <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-xl" />
        <SkeletonBlock pulse={pulse} className="w-20 h-3" />
      </View>
      <SkeletonBlock pulse={pulse} className="w-14 h-6 mt-3" />
    </View>
  );
}

/** A titled panel placeholder with a tall chart/table block. */
function PanelSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2 mb-4">
        <SkeletonBlock pulse={pulse} className="w-4 h-4 rounded" />
        <SkeletonBlock pulse={pulse} className="w-40 h-4" />
      </View>
      <SkeletonBlock pulse={pulse} className="w-full h-40 rounded-xl" />
      <View className="flex-row justify-center gap-4 mt-3">
        <SkeletonBlock pulse={pulse} className="w-20 h-3" />
        <SkeletonBlock pulse={pulse} className="w-20 h-3" />
      </View>
    </View>
  );
}

/**
 * Loading placeholder for the analytics dashboards — a grid of stat tiles plus
 * a set of chart/table panels. Tune `tiles`/`panels` per screen.
 */
export function AnalyticsSkeleton({
  tiles = 4,
  panels = 3,
}: {
  tiles?: number;
  panels?: number;
}) {
  const pulse = usePulse();
  return (
    <View className="gap-4">
      {tiles > 0 && (
        <View className="flex-row flex-wrap gap-3">
          {Array.from({ length: tiles }).map((_, i) => (
            <TileSkeleton key={i} pulse={pulse} />
          ))}
        </View>
      )}
      {Array.from({ length: panels }).map((_, i) => (
        <PanelSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
