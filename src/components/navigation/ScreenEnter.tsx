import type { ReactNode } from "react";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { SCREEN_ENTER } from "./navMotion";

/**
 * The app's one screen-content entrance: content settles into place as the
 * screen arrives, instead of appearing pre-settled the instant it mounts.
 *
 * Mounted once per screen instance via the root Stack's `screenLayout`, which
 * React Navigation applies to every descriptor — so all routes share this
 * entrance from a single line in app/_layout.tsx, with nothing to remember when
 * a new screen is added.
 *
 * Scale down from `fromScale` (> 1) and nothing else. A full-screen wrapper must
 * never animate opacity or offset — either one uncovers the screen underneath
 * while the stack is compositing both. Scaling from above 1 always covers at
 * least the viewport, and `overflow: hidden` keeps the overscan from spilling
 * outside this screen's bounds during the push. See the rule at the top of
 * navMotion.ts.
 *
 * Runs on mount only, which is exactly right: pushing a screen animates its
 * content in, while popping *back* to a screen does not re-run it (the screen
 * instance was never unmounted). Reanimated honours the OS "reduce motion"
 * setting for `withTiming`, so this is a no-op for users who ask for that.
 */
export function ScreenEnter({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, SCREEN_ENTER.timing);
  }, [progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      {
        scale:
          SCREEN_ENTER.fromScale -
          (SCREEN_ENTER.fromScale - 1) * progress.value,
      },
    ],
  }));

  return (
    <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
  );
}

/**
 * Ready-made `screenLayout` for the root Stack. Defined at module scope so the
 * element type stays stable across root re-renders — React then reconciles the
 * wrapper instead of remounting every screen underneath it.
 */
export const screenEnterLayout = ({ children }: { children: ReactNode }) => (
  <ScreenEnter>{children}</ScreenEnter>
);

const styles = StyleSheet.create({
  // overflow: hidden clips the scale overscan to this screen's own bounds. On
  // iOS views do not clip by default, so without it the 2% overhang could be
  // drawn outside the screen frame and over its neighbour mid-push.
  fill: { flex: 1, overflow: "hidden" },
});
