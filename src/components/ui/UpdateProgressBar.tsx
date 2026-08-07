import { useEffect, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing as WorkletEasing,
} from "react-native-reanimated";

import {
  PROGRESS_FILL_TIMING,
  PROGRESS_INDETERMINATE_DURATION,
  PROGRESS_INDETERMINATE_RATIO,
} from "../navigation/navMotion";

type Props = {
  fraction: number | null;
  color: string;
};

export function UpdateProgressBar({ fraction, color }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(0);
  const sweep = useSharedValue(0);
  const indeterminate = fraction === null;

  useEffect(() => {
    if (indeterminate) return;
    progress.value = withTiming(fraction ?? 0, PROGRESS_FILL_TIMING);
  }, [fraction, indeterminate, progress]);

  useEffect(() => {
    if (!indeterminate) {
      cancelAnimation(sweep);
      return;
    }
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, {
        duration: PROGRESS_INDETERMINATE_DURATION,
        easing: WorkletEasing.inOut(WorkletEasing.quad),
      }),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [indeterminate, sweep]);

  const fillStyle = useAnimatedStyle(() => {
    if (indeterminate) {
      const segment = trackWidth * PROGRESS_INDETERMINATE_RATIO;
      return {
        width: segment,
        transform: [
          { translateX: -segment + sweep.value * (trackWidth + segment) },
        ],
      };
    }
    return {
      width: trackWidth * progress.value,
      transform: [{ translateX: 0 }],
    };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800"
    >
      <Animated.View
        style={[
          { height: "100%", borderRadius: 999, backgroundColor: color },
          fillStyle,
        ]}
      />
    </View>
  );
}
