import { useColorScheme } from "nativewind";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { SkeletonSurface } from "./SkeletonBlock";

// Matches the number of cards in the dashboard grid so swapping skeleton ->
// data causes no layout shift. Defaults to the company_admin card count.
const DEFAULT_CARD_COUNT = 7;

/** One full left-to-right pass of the highlight. */
const SWEEP_MS = 1400;
/** Highlight width as a fraction of the card — wide enough to read as a wave. */
const BAND_RATIO = 0.55;

/**
 * Peak opacity of the white highlight. Light mode only lifts the grey bars (a
 * white highlight can't lighten a white card), which is the sweep you want;
 * dark mode needs a far weaker one or the whole card flares.
 */
const HIGHLIGHT_OPACITY = { light: 0.7, dark: 0.12 };

const styles = StyleSheet.create({
  // A percentage width keeps the band proportional to the card without the
  // animation having to touch a layout prop.
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: `${BAND_RATIO * 100}%`,
  },
});

/**
 * The looping 0 -> 1 sweep progress. One value drives every card in the grid, so
 * the whole thing waves in lockstep off a single animation loop instead of each
 * card running its own and drifting out of phase.
 *
 * Reanimated animations default to `ReduceMotion.System`, so the OS "reduce
 * motion" setting already suppresses this without extra handling here.
 */
function useShimmer(): SharedValue<number> {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);

  return progress;
}

/**
 * The travelling highlight, laid over a card's placeholder bars.
 *
 * The rounded clip lives on this overlay rather than on the card itself on
 * purpose: `overflow: "hidden"` on the shadowed card would cut its shadow off at
 * the bounding box and leave grey wedges outside the corner radius — the same
 * artifact just fixed on the notification cards. This overlay has no background
 * and no shadow of its own, so clipping it is free.
 *
 * Only `transform` is animated, so the sweep stays on the UI thread with no
 * layout pass and no React re-render: the card's measured width goes straight
 * into a shared value from `onLayout`, and the band's width is a percentage.
 */
function ShimmerOverlay({
  progress,
  highlight,
  gradientId,
}: {
  progress: SharedValue<number>;
  highlight: number;
  gradientId: string;
}) {
  const cardWidth = useSharedValue(0);

  const bandStyle = useAnimatedStyle(() => {
    const width = cardWidth.value;
    return {
      // Hidden until the card has been measured, so nothing flashes at x=0.
      opacity: width > 0 ? 1 : 0,
      // Enters fully off the left edge and leaves fully off the right one, so
      // the loop's restart happens out of sight.
      transform: [
        {
          translateX: width * (progress.value * (1 + BAND_RATIO) - BAND_RATIO),
        },
      ],
    };
  });

  return (
    <View
      pointerEvents="none"
      className="rounded-2xl overflow-hidden"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        cardWidth.value = e.nativeEvent.layout.width;
      }}
    >
      {/* Positioned via `style` rather than a className so the one node that
          actually animates stays plain Reanimated, with no interop in between. */}
      <Animated.View style={[styles.band, bandStyle]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={highlight} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill={`url(#${gradientId})`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

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

/** Matches MetricCard: label + title, icon badge, value, subtitle. */
function MetricCardSkeleton({
  progress,
  highlight,
  gradientId,
}: {
  progress: SharedValue<number>;
  highlight: number;
  gradientId: string;
}) {
  return (
    <View
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl m-1.5 shadow-sm"
      style={{
        shadowColor: "#424242",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* The card's padding lives on this inner box so the shimmer overlay's
          absolute inset lines up with the card's edges rather than its content. */}
      <View className="p-5">
        {/* Row 1: label + title (left) + icon badge (right) */}
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-1 mr-2">
            {/* label (text-xs, uppercase) */}
            <SkeletonLine width="w-16" line="h-4" />
            {/* title (text-sm, mt-1) */}
            <SkeletonLine width="w-24" line="h-5" bar="h-4" className="mt-1" />
          </View>
          <SkeletonSurface className="w-10 h-10 rounded-xl" />
        </View>

        {/* value (text-3xl) */}
        <SkeletonLine width="w-16" line="h-9" bar="h-7" />
        {/* subtitle (text-xs, mt-1.5) */}
        <SkeletonLine width="w-20" line="h-4" className="mt-1.5" />
      </View>

      <ShimmerOverlay
        progress={progress}
        highlight={highlight}
        gradientId={gradientId}
      />
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
  const progress = useShimmer();
  const { colorScheme } = useColorScheme();
  const highlight =
    colorScheme === "dark" ? HIGHLIGHT_OPACITY.dark : HIGHLIGHT_OPACITY.light;

  return (
    <View className="flex-row flex-wrap -mx-1.5">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className={columns === 2 ? "w-1/2" : "w-full"}>
          <MetricCardSkeleton
            progress={progress}
            highlight={highlight}
            // Gradient ids are looked up per <Svg> root; keeping them distinct
            // avoids any cross-card collision.
            gradientId={`metricShimmer${index}`}
          />
        </View>
      ))}
    </View>
  );
}
