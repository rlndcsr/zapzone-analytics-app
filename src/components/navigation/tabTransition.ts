import { Dimensions, Easing } from "react-native";
import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

// Derive the transition types from the public options type instead of importing
// the library's internal (non-exported) interpolator type names — keeps this
// stable across bottom-tabs minor versions.
type SceneStyleInterpolator = NonNullable<
  BottomTabNavigationOptions["sceneStyleInterpolator"]
>;
type TabTransitionSpec = NonNullable<
  BottomTabNavigationOptions["transitionSpec"]
>;

/**
 * Single source of truth for how long a navigation slide takes. Chosen to match
 * the cadence of the iOS-style native push the root Stack uses (`ios_from_right`,
 * ~350ms), so the JS-driven tab slide and the native module-screen push read as
 * one motion system. Tune once; the tab transition stays in step with the push.
 */
export const NAV_SLIDE_DURATION = 350;

/**
 * Bottom-tab transition timing. Uses Material 3's "standard" easing
 * (cubic-bezier(0.4, 0, 0.2, 1)): a gentle ease-in for soft acceleration and a
 * smooth ease-out for a soft settle — no abrupt stop, no snap. This replaces the
 * previous emphasized-decelerate curve (0.2, 0, 0, 1), whose punchy mid-motion
 * read as slightly mechanical on a full-width slide. Runs on the native driver
 * (transform only), so it holds 60fps with no JS-thread work.
 */
export const TAB_TRANSITION_SPEC: TabTransitionSpec = {
  animation: "timing",
  config: {
    duration: NAV_SLIDE_DURATION,
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  },
};

/**
 * Direction-aware horizontal slide for the bottom-tab scenes.
 *
 * `current.progress` arrives from React Navigation already carrying direction:
 * it is -1 when a scene sits to the LEFT of the active tab (lower index) and +1
 * when it sits to the RIGHT (higher index), animating toward 0 as a scene
 * becomes active. Mapping progress → translateX by the screen width therefore
 * produces the desired motion for free:
 *
 *  • Forward (tap a tab to the RIGHT): the outgoing screen slides LEFT toward
 *    -width while the incoming screen enters from +width.
 *  • Back (tap a tab to the LEFT): the outgoing screen slides RIGHT toward
 *    +width while the incoming screen enters from -width.
 *
 * The two screens tile edge-to-edge as they move, giving a clean pager glide
 * with no fade or overlap. Any number of tabs is supported automatically, so new
 * categories/tabs need no changes here. Width is read per-render, so the slide
 * adapts to the device width (small/large phones, tablets, orientation).
 */
export const forDirectionalSlide: SceneStyleInterpolator = ({ current }) => {
  const width = Dimensions.get("window").width;
  return {
    sceneStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width],
          }),
        },
      ],
    },
  };
};

/**
 * Root Stack push/pop transition for every screen opened from Quick Navigation
 * (Bookings, Customers, Memberships, Waivers, …) — and every other native-stack
 * screen. It reuses the tabs' motion philosophy: the same horizontal directional
 * slide (push = new screen enters from the RIGHT, current slides LEFT; back = the
 * symmetric reverse) at the shared NAV_SLIDE_DURATION cadence.
 *
 * We use `ios_from_right`, the iOS-style native push, NOT `slide_from_right`.
 * Per react-native-screens, `slide_from_right` is a JS-driven *custom* animation
 * on Android (it resolves to the native default on iOS) and, on the pop, it does
 * not keep the previous screen composited underneath — so the revealed screen
 * flashes blank/white until the animation finishes. `ios_from_right` renders the
 * screen below throughout the transition (the real native push behaviour), which
 * fixes the blank frame while keeping the exact same right-to-left motion,
 * interactive swipe-back, and native/UI-thread performance. On iOS both presets
 * resolve to the identical native push, so iOS is unchanged.
 *
 * The native stack can't consume the bottom-tabs' JS `sceneStyleInterpolator`
 * (that API is JS-Animated-only), so we express the matching motion through this
 * native `animation` preset. Typed via `satisfies` so `animation` stays a literal
 * the navigator accepts, without importing the native-stack option type directly.
 *
 * NOTE on `animationDuration`: react-native-screens only honours it for the
 * `fade`, `fade_from_bottom`, `slide_from_bottom` and `simple_push` presets — it
 * is a no-op for `ios_from_right`, which is governed by the platform-native push
 * curve/duration (Apple's own on iOS). We keep it set to the shared cadence to
 * document intent and to remain correct if the preset is ever changed to a
 * duration-aware one; it does not slow or alter the current push.
 */
export const STACK_SCREEN_TRANSITION = {
  animation: "ios_from_right",
  animationDuration: NAV_SLIDE_DURATION,
} satisfies {
  animation: "ios_from_right";
  animationDuration: number;
};
