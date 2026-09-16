import { forwardRef } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import {
  PRESS_DIM_CLASS,
  PRESS_SCALE_CLASS,
  type PressScale,
} from "../../navigation/navMotion";

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  className?: string;
  style?: StyleProp<ViewStyle>;
  pressScale?: PressScale;
  dim?: boolean;
};

export const PressableScale = forwardRef<View, PressableScaleProps>(
  function PressableScale(
    { pressScale = "control", dim = true, className, ...rest },
    ref,
  ) {
    const reduceMotion = useReducedMotion();

    // No `transition` class — see PRESS_SCALE_CLASS for why that matters.
    const motion = [
      reduceMotion ? "" : PRESS_SCALE_CLASS[pressScale],
      dim ? PRESS_DIM_CLASS : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <Pressable
        {...rest}
        ref={ref}
        className={className ? `${className} ${motion}` : motion}
      />
    );
  },
);
