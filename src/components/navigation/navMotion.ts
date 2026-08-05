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
//
// ── The one rule every transition here obeys ───────────────────────────────────
//
// A screen transition must never animate `opacity` on a full-screen container,
// and must never *offset* one either. Both make the screen underneath visible:
// at opacity `a` exactly `(1 - a)` of the previous screen composites through,
// and a translate leaves an uncovered strip at the edge. Either way you get two
// screens on screen at once — the "gray ghost / double render" artifact.
//
// So screen-level motion is expressed as `scale` and nothing else, always
// clamped to >= 1. A view scaled up can only ever cover MORE than the viewport,
// never less, so the topmost screen is guaranteed opaque edge-to-edge on every
// frame and every screen size. Overscan is clipped by the navigator's
// `overflow: hidden` container.
//
// Fades and offsets are fine on things that are not full-screen containers
// (icons, labels, sheet cards, dialog cards) — those have something opaque
// behind them by construction.

import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Easing } from "react-native";
import { Easing as WorkletEasing } from "react-native-reanimated";

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

/**
 * The opaque colour sitting under every screen, per theme.
 *
 * Screens paint their own root background (`bg-gray-50 dark:bg-black` and
 * friends), so this is normally never seen — it is the safety net that stops a
 * screen which forgets to set one from becoming a window onto the screen behind
 * it. It also replaces React Navigation's default theme background, which is the
 * light gray that used to show through transparent containers.
 *
 * Matched to the dominant screen surface so it is seamless if it ever does show.
 */
export const SURFACE = {
  light: "#F9FAFB", // gray-50
  dark: "#000000",
} as const;

export type ThemeName = keyof typeof SURFACE;

export const surfaceFor = (theme: ThemeName | null | undefined) =>
  SURFACE[theme === "dark" ? "dark" : "light"];

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
 * `contentStyle` gives every pushed screen an opaque backing. react-native-screens
 * composites the outgoing and incoming screens during a push, so a screen whose
 * content view has no background is a hole onto the one behind it. Screens set
 * their own root background too; this guarantees it navigator-wide.
 *
 * There is intentionally no `animationDuration` here. It is iOS-only *and*
 * explicitly not customisable for `default`/`ios_from_right` screens, so setting
 * it did nothing on either platform; it is only honoured on the fade screens
 * below.
 *
 * `gestureEnabled` is left at its `true` default (iOS-only in native-stack;
 * Android uses the system back gesture).
 */
export const stackScreenOptions = (theme: ThemeName | null | undefined) =>
  ({
    headerShown: false,
    animation: "ios_from_right",
    contentStyle: { backgroundColor: surfaceFor(theme) },
  }) as const;

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

/** How far past the viewport a scene sits before it settles. Always > 1. */
const TAB_SCENE_SCALE = 1.03;

/**
 * Tab scene motion: the arriving scene settles down from a hair over full size.
 *
 * Transform only, and scale only — see the rule at the top of this file. This
 * used to be an opacity cross-fade plus a 12px shift, which is what produced the
 * gray ghost of the previous tab: bottom-tabs keeps both scenes mounted and
 * stacked for the length of the transition, so a partially transparent incoming
 * scene composites the outgoing one straight through it, and a shifted one leaves
 * an uncovered strip at the screen edge.
 *
 * Why this version cannot ghost, on any device:
 *   • bottom-tabs gives the focused scene `zIndex: 0` and every blurred scene
 *     `zIndex: -1`, and `state.index` flips on the first frame — so the arriving
 *     scene is on top for the entire transition.
 *   • its `backgroundColor` (see `tabScreenOptions`) makes it opaque.
 *   • its scale never drops below 1, so it always covers at least the full
 *     viewport; the 3% overscan is clipped by the scene container's
 *     `overflow: hidden`.
 * Opaque + on top + full coverage on every frame ⇒ exactly one visible screen.
 *
 * The V-shaped output range means the same settle plays whichever direction you
 * move between tabs, so Home→Location and Location→Home feel identical.
 */
export const forTabScene: SceneStyleInterpolator = ({ current }) => ({
  sceneStyle: {
    transform: [
      {
        scale: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [TAB_SCENE_SCALE, 1, TAB_SCENE_SCALE],
        }),
      },
    ],
  },
});

/**
 * Shared options for every tab screen.
 *
 * `sceneStyle` is what makes the guarantee in `forTabScene` hold: bottom-tabs
 * keeps the previous scene mounted and stacked underneath for the duration of
 * the transition, so the arriving scene has to be opaque in its own right.
 * Screens paint their own root background as well — this makes it a navigator
 * invariant rather than something each screen has to remember.
 *
 * `freezeOnBlur` is deliberately NOT set. `detachInactiveScreens` (on by default
 * for iOS and Android) already takes blurred scenes out of the native view
 * hierarchy, which is where the real cost is; freezing only adds JS re-render
 * savings, and in exchange a tab you return to has to unfreeze and re-render,
 * which can cost a paint on the very first frame of the transition. Not a trade
 * worth making when the requirement is zero visual artifacts.
 *
 * `lazy` is intentionally left at its `true` default: tabs mount on first visit
 * and then stay mounted, which is what preserves their state.
 */
export const tabScreenOptions = (
  theme: ThemeName | null | undefined,
): BottomTabNavigationOptions => ({
  headerShown: false,
  sceneStyle: { backgroundColor: surfaceFor(theme) },
  transitionSpec: {
    animation: "timing",
    config: {
      duration: TAB_SCENE_DURATION,
      // Decelerate: leaves immediately on tap, settles softly.
      easing: Easing.out(Easing.cubic),
    },
  },
  sceneStyleInterpolator: forTabScene,
});

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
 * A newly pushed screen settles into place instead of arriving pre-settled.
 *
 * Deliberately shallow — the stack's own slide is the real entrance; this adds
 * the last touch of settle on top of it.
 *
 * Scale, from >= 1, for the same reason as `forTabScene`. This was previously a
 * 12px lift at 0.85 opacity, and both halves of that were wrong on a full-screen
 * container: the opacity showed 15% of the outgoing screen straight through the
 * arriving one, and the lift opened a 12px strip along the top edge — which on
 * these screens sits under the status bar, right where the blue DashboardHeader
 * has to reach the top. Scaling from 1.02 down to 1 can only ever cover more than
 * the viewport, so it exposes nothing at any point.
 */
export const SCREEN_ENTER = {
  fromScale: 1.02,
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
