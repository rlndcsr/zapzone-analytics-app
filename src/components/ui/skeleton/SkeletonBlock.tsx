import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

export function usePulse(): SharedValue<number> {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  return pulse;
}

/**
 * The skeleton base tone — a single unanimated placeholder. Size/shape come
 * entirely from `className`. Use this directly when the placeholder is animated
 * by something other than the opacity pulse (a shimmer sweeping over it, say),
 * so the base tone stays defined in one place.
 */
export function SkeletonSurface({ className }: { className: string }) {
  return (
    <View className={`bg-gray-200 dark:bg-neutral-700 rounded-md ${className}`} />
  );
}

/** A single pulsing placeholder. Size/shape come entirely from `className`. */
export function SkeletonBlock({
  pulse,
  className,
}: {
  pulse: SharedValue<number>;
  className: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={animatedStyle}>
      <SkeletonSurface className={className} />
    </Animated.View>
  );
}
