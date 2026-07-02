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

/** One section: title bar + a few row placeholders. */
function SectionSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="mb-5">
      <SkeletonBlock pulse={pulse} className="w-40 h-5 mb-3" />
      <View
        className="bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm"
        style={CARD_SHADOW}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            className={`${i > 0 ? "border-t border-gray-100 dark:border-neutral-800 pt-3 mt-3" : ""}`}
          >
            <View className="flex-row items-center justify-between mb-2">
              <SkeletonBlock pulse={pulse} className="w-36 h-4" />
              <SkeletonBlock pulse={pulse} className="w-16 h-5 rounded-full" />
            </View>
            <SkeletonBlock pulse={pulse} className="w-28 h-3 mb-2" />
            <View className="flex-row items-center justify-between">
              <SkeletonBlock pulse={pulse} className="w-24 h-3" />
              <SkeletonBlock pulse={pulse} className="w-16 h-3" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Loading placeholder for the Activity screen's three list sections. */
export function ActivitySkeleton() {
  const pulse = usePulse();
  return (
    <View>
      {Array.from({ length: 3 }).map((_, i) => (
        <SectionSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
