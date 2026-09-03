import { useColorScheme } from "nativewind";
import React, { useEffect, useId } from "react";
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

const SWEEP_MS = 1400;
const BAND_RATIO = 0.55;

const HIGHLIGHT_OPACITY = { light: 0.7, dark: 0.12 };

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: `${BAND_RATIO * 100}%`,
  },
});

export type Shimmer = {
  progress: SharedValue<number>;
  highlight: number;
};

export function useShimmer(): Shimmer {
  const progress = useSharedValue(0);
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);

  return {
    progress,
    highlight:
      colorScheme === "dark" ? HIGHLIGHT_OPACITY.dark : HIGHLIGHT_OPACITY.light,
  };
}

export function SkeletonShimmer({
  shimmer,
  radius = "rounded-2xl",
}: {
  shimmer: Shimmer;
  radius?: string;
}) {
  const { progress, highlight } = shimmer;
  const cardWidth = useSharedValue(0);
  const gradientId = `skeletonShimmer${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const bandStyle = useAnimatedStyle(() => {
    const width = cardWidth.value;
    return {
      opacity: width > 0 ? 1 : 0,
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
      className={`${radius} overflow-hidden`}
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        cardWidth.value = e.nativeEvent.layout.width;
      }}
    >
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
