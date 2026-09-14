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
  PRESS_TRANSITION,
  type PressScale,
} from "../../navigation/navMotion";

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  className?: string;
  /**
   * Plain styles only. Pressable also allows `({ pressed }) => style`, which is
   * exactly the instant state swap this component exists to replace — a type
   * error here beats a call site whose press feedback silently does nothing.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * How far it presses in, chosen by target size — see {@link PRESS_SCALE_CLASS}.
   * Defaults to "control", which suits chips, rows and ordinary buttons.
   */
  pressScale?: PressScale;
  /** Set false to keep the scale but skip the opacity dip. */
  dim?: boolean;
};

/**
 * The app's standard touch feedback: a short, eased push-in under the finger.
 *
 * It is an ordinary `Pressable`. All it does is append motion utilities to the
 * className it is given — and that restraint is the whole point. The version
 * this replaced built an `Animated.createAnimatedComponent(Pressable)` and fed
 * it a `useAnimatedStyle`, which crashed on first render: react-native-css-interop
 * knows Reanimated's own `Animated.*` components but not a custom one, so it
 * walked the animated style itself and tripped Reanimated's "animated style on
 * a non-animated component" guard. Handing the transition to css-interop
 * instead — which upgrades the component to animated internally when it sees a
 * transition class — keeps both libraries doing what they each expect.
 *
 * Because it stays a single `Pressable` with the caller's className intact, it
 * is layout-identical to what it replaced. That matters more than it sounds:
 * 40 of the call sites are `flex-1` inside a flex row, and any wrapper-based
 * approach would have quietly collapsed every one of them.
 *
 * Reduced motion drops the scale and keeps the fade — someone who has asked the
 * OS to stop animations still needs the control to acknowledge their touch.
 * `PRESS_TRANSITION` stays on either way, so the class set never changes shape
 * after mount (css-interop remounts a component that becomes animated late).
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(
  function PressableScale(
    { pressScale = "control", dim = true, className, ...rest },
    ref,
  ) {
    const reduceMotion = useReducedMotion();

    const motion = [
      PRESS_TRANSITION,
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
