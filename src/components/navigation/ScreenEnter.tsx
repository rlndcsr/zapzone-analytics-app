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
 * The app's one screen-content entrance: content lifts and firms up as the
 * screen arrives, instead of appearing pre-settled the instant it mounts.
 *
 * Mounted once per screen instance via the root Stack's `screenLayout`, which
 * React Navigation applies to every descriptor — so all routes share this
 * entrance from a single line in app/_layout.tsx, with nothing to remember when
 * a new screen is added.
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
    opacity:
      SCREEN_ENTER.fromOpacity +
      (1 - SCREEN_ENTER.fromOpacity) * progress.value,
    transform: [
      { translateY: (1 - progress.value) * SCREEN_ENTER.translateY },
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
  fill: { flex: 1 },
});
