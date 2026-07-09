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

function PaymentCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start justify-between">
        <View className="gap-2">
          <SkeletonBlock pulse={pulse} className="w-32 h-4" />
          <SkeletonBlock pulse={pulse} className="w-16 h-2.5" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-full" />
      </View>
      <View className="gap-2 mt-3">
        <SkeletonBlock pulse={pulse} className="w-40 h-3.5" />
        <SkeletonBlock pulse={pulse} className="w-52 h-2.5" />
      </View>
      <View className="flex-row items-center justify-between mt-3">
        <SkeletonBlock pulse={pulse} className="w-28 h-3" />
        <SkeletonBlock pulse={pulse} className="w-16 h-5" />
      </View>
      <View className="gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
        <SkeletonBlock pulse={pulse} className="w-24 h-2.5" />
        <SkeletonBlock pulse={pulse} className="w-36 h-2.5" />
      </View>
    </View>
  );
}

/** Stat tiles + payment card list placeholder for the Payments screen. */
export function PaymentsListSkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center gap-2">
              <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-xl" />
              <SkeletonBlock pulse={pulse} className="w-20 h-3" />
            </View>
            <SkeletonBlock pulse={pulse} className="w-12 h-6 mt-3" />
            <SkeletonBlock pulse={pulse} className="w-24 h-2.5 mt-2" />
          </View>
        ))}
      </View>
      <View className="gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <PaymentCardSkeleton key={i} pulse={pulse} />
        ))}
      </View>
    </View>
  );
}
