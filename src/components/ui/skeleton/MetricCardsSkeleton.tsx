import React from "react";
import { View } from "react-native";
import {
  METRIC_CARD_PADDING,
  METRIC_CARD_SHADOW,
  METRIC_CARD_SURFACE,
} from "../../../lib/dashboard/metricCardStyle";
import { SkeletonSurface } from "./SkeletonBlock";
import { SkeletonShimmer, useShimmer, type Shimmer } from "./SkeletonShimmer";

// Matches the number of cards in the dashboard grid so swapping skeleton ->
// data causes no layout shift. Defaults to the company_admin card count.
const DEFAULT_CARD_COUNT = 7;

/** A skeleton bar vertically centered within a text line's height. */
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
 * Mirrors MetricCard (see `MetricCard` in app/(tabs)/home.tsx) box for box: an
 * icon badge and info affordance on one row, then the title, the value and the
 * subtitle stacked beneath it.
 *
 * The `line` heights are the line-heights Tailwind pairs with the real card's
 * font sizes, in the same rem units: text-sm -> 1.25rem (h-5), text-3xl ->
 * 2.25rem (h-9), text-xs -> 1rem (h-4). RN lays a single line of text out at
 * exactly its line-height, so each placeholder row occupies the vertical space
 * of the text it stands in for whatever NativeWind's rem base is set to. Every
 * margin below is the real card's own.
 */
function MetricCardSkeleton({ shimmer }: { shimmer: Shimmer }) {
  return (
    <View className={METRIC_CARD_SURFACE} style={METRIC_CARD_SHADOW}>
      {/* The card's padding lives on this inner box so the shimmer overlay's
          absolute inset lines up with the card's edges rather than its content. */}
      <View className={METRIC_CARD_PADDING}>
        {/* Header row: MetricIconBadge on the left (w-10 h-10 rounded-xl), the
            info button on the right. `items-center` and mb-3 are MetricCard's
            own; the info glyph is `<Info size={14} />`, a pixel size rather
            than a rem one, so it is spelled out as pixels here too. */}
        <View className="flex-row items-center justify-between mb-3">
          <SkeletonSurface className="w-10 h-10 rounded-xl" />
          <SkeletonSurface className="w-[14px] h-[14px] rounded-full" />
        </View>

        {/* title (text-sm font-semibold, mb-2) */}
        <SkeletonLine width="w-24" line="h-5" bar="h-4" className="mb-2" />

        {/* value (text-3xl font-bold) */}
        <SkeletonLine width="w-16" line="h-9" bar="h-7" />

        {/* subtitle (text-xs, mt-1.5) */}
        <SkeletonLine width="w-24" line="h-4" className="mt-1.5" />
      </View>

      <SkeletonShimmer shimmer={shimmer} />
    </View>
  );
}

export function MetricCardsSkeleton({
  count = DEFAULT_CARD_COUNT,
  columns = 2,
}: {
  count?: number;
  /** Cards per row — mirrors the dashboard's grid/list toggle (2 = grid, 1 = list). */
  columns?: 1 | 2;
} = {}) {
  const shimmer = useShimmer();

  return (
    <View className="flex-row flex-wrap -mx-1.5">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className={columns === 2 ? "w-1/2" : "w-full"}>
          <MetricCardSkeleton shimmer={shimmer} />
        </View>
      ))}
    </View>
  );
}
