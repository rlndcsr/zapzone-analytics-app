import React from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { ViewMode } from "../ViewToggle";
import { PurchasesListSkeleton } from "./AttractionPurchasesSkeleton";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

const LIST_COUNT = 5;

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

/** Matches the flat BookingCard: customer + status, reference · package line,
 *  the Date / Guests / Total strip, and the meta + actions footer. */
function BookingCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <SkeletonLine pulse={pulse} width="w-36" line="h-6" bar="h-4" />
        <SkeletonBlock pulse={pulse} className="w-20 h-5 rounded-full" />
      </View>
      <SkeletonLine
        pulse={pulse}
        width="w-44"
        line="h-4"
        bar="h-2.5"
        className="mt-1"
      />
      <SkeletonBlock pulse={pulse} className="w-full h-14 rounded-xl mt-3" />
      <View className="flex-row items-center justify-between mt-3">
        <SkeletonLine pulse={pulse} width="w-28" line="h-4" bar="h-2.5" />
        <SkeletonLine pulse={pulse} width="w-16" line="h-4" bar="h-2.5" />
      </View>
    </View>
  );
}

/**
 * Records-only placeholder for Manage Bookings: the flat selectable table
 * skeleton (shared with Manage Purchases) in table view, booking cards
 * otherwise. The page header and controls stay real above it.
 */
export function BookingsListSkeleton({
  view = "cards",
}: {
  view?: ViewMode;
} = {}) {
  const pulse = usePulse();
  if (view === "table") return <PurchasesListSkeleton flat view="table" />;
  return (
    <View>
      {Array.from({ length: LIST_COUNT }).map((_, i) => (
        <BookingCardSkeleton key={i} pulse={pulse} />
      ))}
    </View>
  );
}
