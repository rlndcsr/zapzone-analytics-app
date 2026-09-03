import React from "react";
import { View } from "react-native";
import { SkeletonSurface } from "./SkeletonBlock";
import { SkeletonShimmer, useShimmer, type Shimmer } from "./SkeletonShimmer";

/** `topLocations` is `sortedLocations.slice(0, 3)` — see app/(tabs)/location.tsx. */
const TOP_COUNT = 3;
/** The overview list is paginated; this matches the screen's default perPage. */
const DEFAULT_OVERVIEW_COUNT = 5;

/**
 * Mirrors the inline shadow both location cards carry (see `TopLocationCard`
 * and `OverviewCard` in app/(tabs)/location.tsx), so placeholder and card sit
 * on the page with the same lift.
 */
const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 6,
  elevation: 1,
} as const;

/**
 * A skeleton bar vertically centered within a text line's height.
 *
 * `line` is the line-height Tailwind pairs with the real text's font size, in
 * the same rem units — text-xs -> 1rem (h-4), text-base -> 1.5rem (h-6),
 * text-lg -> 1.75rem (h-7) — and RN lays a single line out at exactly its
 * line-height, so the placeholder occupies the space the text will.
 */
function SkeletonLine({
  width,
  line,
  bar = "h-3",
  className = "",
}: {
  width: string;
  line: string;
  bar?: string;
  className?: string;
}) {
  return (
    <View className={`${line} justify-center ${className}`}>
      <SkeletonSurface className={`${width} ${bar}`} />
    </View>
  );
}

/**
 * Mirrors StatCell: `flex-1 pr-2`, a text-xs label (mb-0.5) over a text-lg
 * figure, plus the optional text-[10px] caption the Waivers cell carries.
 *
 * That caption is the one row here whose height can't be derived: `text-[10px]`
 * is an arbitrary font size, so Tailwind pairs no line-height with it and RN
 * falls back to the font's own (~12px). h-3 is the closest rem step.
 */
function StatCellSkeleton({
  value = "w-10",
  sub = false,
}: {
  value?: string;
  sub?: boolean;
}) {
  return (
    <View className="flex-1 pr-2">
      <SkeletonLine width="w-14" line="h-4" className="mb-0.5" />
      <SkeletonLine width={value} line="h-7" bar="h-5" />
      {sub && <SkeletonLine width="w-12" line="h-3" bar="h-2" />}
    </View>
  );
}

/**
 * Mirrors RevenueCell: `flex-1 pr-2`, a text-[10px] label (mb-0.5) over a
 * text-xs figure.
 */
function RevenueCellSkeleton() {
  return (
    <View className="flex-1 pr-2">
      <SkeletonLine width="w-16" line="h-3" bar="h-2" className="mb-0.5" />
      <SkeletonLine width="w-12" line="h-4" />
    </View>
  );
}

/**
 * Mirrors UtilizationBar: a flex-1 h-2 track beside the text-xs percentage,
 * which reserves min-w-[34px].
 */
function UtilizationBarSkeleton() {
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <SkeletonSurface className="w-full h-2 rounded-full" />
      </View>
      <SkeletonLine width="w-[34px]" line="h-4" />
    </View>
  );
}

/** Mirrors TopLocationCard: rank circle + name with the revenue figure opposite,
 *  the four-stat row, the utilization bar, then the revenue breakdown. */
function TopLocationCardSkeleton({ shimmer }: { shimmer: Shimmer }) {
  return (
    <View
      className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl mb-3 shadow-sm border-2 border-[#0644C7]"
      style={CARD_SHADOW}
    >
      {/* The card's padding lives on this inner box so the shimmer overlay's
          absolute inset lines up with the card's edges rather than its content. */}
      <View className="p-4">
        {/* Rank + name, total revenue on the right */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-3 flex-1 mr-3">
            <SkeletonSurface className="w-10 h-10 rounded-full" />
            {/* name (text-lg) */}
            <SkeletonLine width="w-36" line="h-7" bar="h-5" />
          </View>
          <View className="items-end">
            {/* "Revenue" (text-xs, mb-0.5) */}
            <SkeletonLine width="w-14" line="h-4" className="mb-0.5" />
            {/* figure (text-lg) */}
            <SkeletonLine width="w-20" line="h-7" bar="h-5" />
          </View>
        </View>

        {/* Bookings / Tickets / Events / Waivers */}
        <View className="flex-row mb-3">
          <StatCellSkeleton />
          <StatCellSkeleton />
          <StatCellSkeleton />
          <StatCellSkeleton />
        </View>

        {/* Utilization label (text-xs, mb-1) + bar */}
        <View className="mb-3">
          <SkeletonLine width="w-16" line="h-4" className="mb-1" />
          <UtilizationBarSkeleton />
        </View>

        {/* Revenue split by source */}
        <View className="flex-row pt-3 border-t border-[#0644C7]/20">
          <RevenueCellSkeleton />
          <RevenueCellSkeleton />
          <RevenueCellSkeleton />
        </View>
      </View>

      <SkeletonShimmer shimmer={shimmer} />
    </View>
  );
}

/** Mirrors OverviewCard: pin badge + name with the utilization dot opposite,
 *  the four-stat row, the revenue/utilization row, then the revenue breakdown. */
function OverviewCardSkeleton({ shimmer }: { shimmer: Shimmer }) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl mb-3 shadow-sm border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="p-5">
        {/* Pin badge + name, utilization dot on the right */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2 flex-1 mr-2">
            <SkeletonSurface className="w-8 h-8 rounded-lg" />
            {/* name (text-base) */}
            <SkeletonLine width="w-36" line="h-6" bar="h-4" />
          </View>
          <SkeletonSurface className="w-3 h-3 rounded-full" />
        </View>

        {/* Bookings / Tickets / Events / Waivers — the last captions its signed count */}
        <View className="flex-row mb-3">
          <StatCellSkeleton />
          <StatCellSkeleton />
          <StatCellSkeleton />
          <StatCellSkeleton sub />
        </View>

        {/* Revenue + Utilization */}
        <View className="flex-row mb-3">
          <StatCellSkeleton value="w-20" />
          <View className="flex-1">
            <SkeletonLine width="w-16" line="h-4" className="mb-1" />
            <View className="h-7 justify-center">
              <UtilizationBarSkeleton />
            </View>
          </View>
        </View>

        <View className="flex-row pt-3 border-t border-gray-100 dark:border-neutral-800">
          <RevenueCellSkeleton />
          <RevenueCellSkeleton />
          <RevenueCellSkeleton />
        </View>
      </View>

      <SkeletonShimmer shimmer={shimmer} />
    </View>
  );
}

/** Skeletons for the "Top Performing Locations" cards. */
export function TopCardsSkeleton() {
  const shimmer = useShimmer();

  return (
    <View>
      {Array.from({ length: TOP_COUNT }).map((_, index) => (
        <TopLocationCardSkeleton key={index} shimmer={shimmer} />
      ))}
    </View>
  );
}

/** Skeletons for the "All Locations Overview" cards. */
export function OverviewCardsSkeleton({
  count = DEFAULT_OVERVIEW_COUNT,
}: {
  /** Mirrors the list's page size so the placeholder fills the same space. */
  count?: number;
} = {}) {
  const shimmer = useShimmer();

  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <OverviewCardSkeleton key={index} shimmer={shimmer} />
      ))}
    </View>
  );
}
