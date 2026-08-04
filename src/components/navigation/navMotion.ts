// The app's motion language, in one place.
//
// Every navigation-level animation — stack pushes, tab switches, screen content
// entrance, bottom sheets, centre dialogs — reads its timing from here so the
// whole app moves with one rhythm instead of each surface inventing its own.
//
// Two easing families live side by side, and they are NOT interchangeable:
//   • `Easing` from react-native      → React Navigation transition specs, which
//                                       run on RN's Animated native driver.
//   • `Easing` from react-native-reanimated (aliased `WorkletEasing`) → anything
//                                       fed to withTiming/withSpring on the UI thread.
//
// Everything here is native-driver or worklet driven; nothing animates on the JS
// thread.

import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Easing } from "react-native";
import { Easing as WorkletEasing } from "react-native-reanimated";

/* ------------------------------------------------------------------ *
 * Durations
 * ------------------------------------------------------------------ */

/** Cross-fade at the auth boundary (splash ↔ login ↔ app). */
export const AUTH_FADE_DURATION = 300;

/** Tab-to-tab scene change. Short: the tab bar already confirmed the tap. */
export const TAB_SCENE_DURATION = 260;

/** Content settling into a freshly pushed screen. */
export const SCREEN_ENTER_DURATION = 280;

/** In-place UI reactions (tab icon/label state, press feedback). */
export const UI_REACTION_DURATION = 180;

/* ------------------------------------------------------------------ *
 * Stack — the root navigator in app/_layout.tsx
 * ------------------------------------------------------------------ */

/**
 * Shared options for every screen in the root stack.
 *
 * `ios_from_right` is a deliberate cross-platform choice: on iOS it resolves to
 * the platform default push (native slide + parallax + dim, and the interactive
 * edge-swipe pop is its exact inverse — which is why back already feels
 * identical to forward and needs no extra config), while on Android it replaces
 * the OS default with that same iOS-style slide. One motion, both platforms.
 *
 * There is intentionally no `animationDuration` here. It is iOS-only *and*
 * explicitly not customisable for `default`/`ios_from_right` screens, so setting
 * it did nothing on either platform; it is only honoured on the fade screens
 * below.
 *
 * `gestureEnabled` is left at its `true` default (iOS-only in native-stack;
 * Android uses the system back gesture).
 */
export const STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "ios_from_right",
} as const;

/**
 * The auth boundary. splash → login → app are all `router.replace` hand-offs
 * between full-screen surfaces, so a horizontal slide reads as "going back"
 * (`animationTypeForReplace` defaults to `pop`). A cross-fade instead lets the
 * splash's blue backdrop dissolve straight into the login header, and makes
 * sign-in/sign-out feel like the app changing state rather than a page turn.
 *
 * `animationDuration` IS honoured here — `fade` is one of the few animations
 * whose duration iOS lets us set.
 */
export const AUTH_SCREEN_OPTIONS = {
  animation: "fade",
  animationDuration: AUTH_FADE_DURATION,
} as const;

/* ------------------------------------------------------------------ *
 * Tabs — app/(tabs)/_layout.tsx
 * ------------------------------------------------------------------ */

type SceneStyleInterpolator = NonNullable<
  BottomTabNavigationOptions["sceneStyleInterpolator"]
>;

/** How far a scene sits off-centre while it waits its turn. */
const TAB_SCENE_SHIFT = 12;

/**
 * Opacity curve for the tab cross-fade, shaped to stay *high* rather than
 * ramping linearly.
 *
 * A linear `[0, 1, 0]` cross-fade (bottom-tabs' own `shift`/`fade` presets) puts
 * both scenes at 0.5 mid-transition, so ~25% of React Navigation's theme
 * background bleeds through — very visible against the blue DashboardHeader that
 * tops every tab screen. Because the outgoing scene is always at `progress - 1`
 * of the incoming one, composite coverage here never drops below ~96% at any
 * point in the transition, whatever easing is used.
 */
const SCENE_OPACITY_INPUT = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const SCENE_OPACITY_OUTPUT = [0, 0.5, 0.8, 0.95, 1, 0.95, 0.8, 0.5, 0];

/**
 * Tab scene motion: a high-alpha cross-fade plus a small directional shift, so
 * you can feel *which way* you moved without the screen travelling far enough to
 * read as a page swipe.
 *
 * `progress` is -1 for scenes left of the active tab, 0 for the active one and
 * +1 for scenes to its right — matching the tab order, so the shift direction is
 * correct for both role-specific tab sets.
 */
export const forTabScene: SceneStyleInterpolator = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({
      inputRange: SCENE_OPACITY_INPUT,
      outputRange: SCENE_OPACITY_OUTPUT,
    }),
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-TAB_SCENE_SHIFT, 0, TAB_SCENE_SHIFT],
        }),
      },
    ],
  },
});

/**
 * Shared options for every tab screen.
 *
 * `freezeOnBlur` is the one perf setting here: inactive tab screens are already
 * detached from the native view hierarchy, but without this they still re-render
 * on every store/poll tick in the background (the Home dashboard is the
 * expensive one). Freezing is scoped to screens react-native-screens has already
 * marked inactive — a scene mid-transition is never frozen — and a frozen screen
 * re-renders the instant it unfreezes, so navigation state and effects are
 * unaffected. Remove this line to revert.
 *
 * `lazy` is intentionally left at its `true` default: tabs mount on first visit
 * and then stay mounted, which is what preserves their state.
 */
export const TAB_SCREEN_OPTIONS: BottomTabNavigationOptions = {
  headerShown: false,
  freezeOnBlur: true,
  transitionSpec: {
    animation: "timing",
    config: {
      duration: TAB_SCENE_DURATION,
      // Decelerate: leaves immediately on tap, settles softly.
      easing: Easing.out(Easing.cubic),
    },
  },
  sceneStyleInterpolator: forTabScene,
};

/* ------------------------------------------------------------------ *
 * Tab bar — worklet-driven, so it never competes with the scene change
 * ------------------------------------------------------------------ */

export const TAB_STATE_TIMING = {
  duration: UI_REACTION_DURATION,
  easing: WorkletEasing.out(WorkletEasing.cubic),
} as const;

/** How much the focused tab icon grows. */
export const TAB_ICON_FOCUS_SCALE = 0.1;

export const TAB_PRESS_SCALE = 0.92;
export const TAB_PRESS_IN_TIMING = {
  duration: 90,
  easing: WorkletEasing.out(WorkletEasing.quad),
} as const;
export const TAB_PRESS_OUT_SPRING = {
  damping: 15,
  stiffness: 340,
  mass: 0.6,
} as const;

/* ------------------------------------------------------------------ *
 * Screen content entrance — components/navigation/ScreenEnter.tsx
 * ------------------------------------------------------------------ */

/**
 * The content of a newly pushed screen lifts into place instead of arriving
 * pre-settled.
 *
 * Kept deliberately shallow. The stack's own slide is the real entrance; this
 * only adds the last few pixels of settle on top of it. The opacity floor is
 * 0.85 rather than 0 for a concrete reason: during an `ios_from_right` push the
 * incoming screen is drawn *over* the outgoing one, so a full fade-in would show
 * the previous screen straight through the new one. At 0.85 the arriving content
 * reads as soft, not transparent.
 */
export const SCREEN_ENTER = {
  translateY: 12,
  fromOpacity: 0.85,
  timing: {
    duration: SCREEN_ENTER_DURATION,
    easing: WorkletEasing.out(WorkletEasing.cubic),
  },
} as const;

/* ------------------------------------------------------------------ *
 * Bottom sheets — components/ui/BottomSheet.tsx
 * ------------------------------------------------------------------ */

/**
 * Sheet entrance.
 *
 * `clamp: { min: 0 }` is load-bearing. The sheet is bottom-anchored, so any
 * spring overshoot past its resting `translateY: 0` *lifts it off the bottom
 * edge* and flashes backdrop underneath. Clamping lets us keep a springy
 * dampingRatio without that gap, instead of falling back to a flat
 * critically-damped slide.
 */
export const SHEET_OPEN_SPRING = {
  duration: 380,
  dampingRatio: 0.82,
  clamp: { min: 0 },
} as const;

/**
 * Sheet exit. Physics-based (not duration-based) so the fling velocity from a
 * drag-dismiss carries through instead of being discarded — the sheet leaves as
 * fast as you threw it. Overshoot is harmless here: the target is off-screen.
 */
export const SHEET_CLOSE_SPRING = {
  damping: 26,
  stiffness: 300,
  mass: 0.7,
} as const;

/** Drag past this distance, or fling faster than this, to dismiss. */
export const SHEET_CLOSE_DISTANCE = 120;
export const SHEET_CLOSE_VELOCITY = 800;

/* ------------------------------------------------------------------ *
 * Centre dialogs — components/ui/CenterModal.tsx
 * ------------------------------------------------------------------ */

export const MODAL_BACKDROP_COLOR = "rgba(20, 20, 20, 0.6)";

/** Card scale at rest before entering / after leaving. */
export const MODAL_CARD_SCALE_FROM = 0.94;

/** A touch of overshoot: the card settles rather than snapping. */
export const MODAL_OPEN_SPRING = {
  duration: 340,
  dampingRatio: 0.8,
} as const;

export const MODAL_CLOSE_TIMING = {
  duration: 160,
  easing: WorkletEasing.in(WorkletEasing.quad),
} as const;
