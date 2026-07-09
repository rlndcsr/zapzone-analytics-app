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

/** One member row: name + email (left), status pill + dates (right). */
function MembershipRowSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-2 gap-2">
          <SkeletonBlock pulse={pulse} className="w-40 h-4" />
          <SkeletonBlock pulse={pulse} className="w-52 h-3" />
        </View>
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-full" />
      </View>
      <View className="flex-row items-center justify-between mt-4">
        <SkeletonBlock pulse={pulse} className="w-24 h-3" />
        <SkeletonBlock pulse={pulse} className="w-24 h-3" />
      </View>
    </View>
  );
}

/** The stat-card row + member list placeholder for the Memberships screen. */
export function MembershipsListSkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-4">
      {/* Stat cards (2×2) */}
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
            style={CARD_SHADOW}
          >
            <SkeletonBlock pulse={pulse} className="w-9 h-9 rounded-xl" />
            <SkeletonBlock pulse={pulse} className="w-16 h-3 mt-3" />
            <SkeletonBlock pulse={pulse} className="w-10 h-6 mt-2" />
          </View>
        ))}
      </View>

      {/* Member rows */}
      <View className="gap-4 mt-1">
        {Array.from({ length: LIST_COUNT }).map((_, i) => (
          <MembershipRowSkeleton key={i} pulse={pulse} />
        ))}
      </View>
    </View>
  );
}

/** One plan card: name + status toggle, then interval/usage/access chips. */
function PlanCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center justify-between">
        <SkeletonBlock pulse={pulse} className="w-36 h-5" />
        <SkeletonBlock pulse={pulse} className="w-14 h-7 rounded-full" />
      </View>
      <SkeletonBlock pulse={pulse} className="w-20 h-6 mt-3" />
      <View className="flex-row items-center gap-2 mt-3">
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-md" />
        <SkeletonBlock pulse={pulse} className="w-20 h-6 rounded-md" />
        <SkeletonBlock pulse={pulse} className="w-16 h-6 rounded-md" />
      </View>
      <View className="flex-row items-center gap-2 mt-4">
        <SkeletonBlock pulse={pulse} className="flex-1 h-9 rounded-xl" />
        <SkeletonBlock pulse={pulse} className="flex-1 h-9 rounded-xl" />
        <SkeletonBlock pulse={pulse} className="flex-1 h-9 rounded-xl" />
      </View>
    </View>
  );
}

/** The plan card list placeholder for the Membership Plans screen. */
export function MembershipPlansListSkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <PlanCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
