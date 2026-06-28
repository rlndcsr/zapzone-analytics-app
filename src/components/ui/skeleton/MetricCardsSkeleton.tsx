import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

// Mirrors the 7 cards in the dashboard grid so swapping skeleton -> data
// causes no layout shift.
const CARD_COUNT = 7;

function SkeletonBlock({
  pulse,
  className,
}: {
  pulse: SharedValue<number>;
  className: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={animatedStyle}>
      <View className={`bg-gray-200 rounded-md ${className}`} />
    </Animated.View>
  );
}

function MetricCardSkeleton({ pulse }: { pulse: SharedValue<number> }) {
  return (
    <View className="bg-white rounded-xl p-4 m-1">
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
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

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
