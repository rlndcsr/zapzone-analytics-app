import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

// Mirrors the 7 cards in the dashboard grid so swapping skeleton -> data
// causes no layout shift.
const CARD_COUNT = 7;

function MetricCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-xl p-4 m-1">
      {/* Top row: timeframe pill + icon badge */}
      <View className="flex-row items-center justify-between mb-3">
        <SkeletonBlock pulse={pulse} className="w-12 h-3" />
        <SkeletonBlock pulse={pulse} className="w-10 h-10 rounded-lg" />
      </View>

      <View className="mb-3">
        <SkeletonBlock pulse={pulse} className="w-24 h-4" />
      </View>

      <SkeletonBlock pulse={pulse} className="w-16 h-8" />
    </View>
  );
}

export function MetricCardsSkeleton() {
  const pulse = usePulse();

  return (
    <View className="flex-row flex-wrap">
      {Array.from({ length: CARD_COUNT }).map((_, index) => (
        <View key={index} className="w-1/2">
          <MetricCardSkeleton pulse={pulse} />
        </View>
      ))}
    </View>
  );
}
