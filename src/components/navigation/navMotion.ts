import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { Easing } from "react-native";
import { Easing as WorkletEasing } from "react-native-reanimated";

export const SURFACE = {
  light: "#F9FAFB",
  dark: "#000000",
} as const;

export type ThemeName = keyof typeof SURFACE;

export const surfaceFor = (theme: ThemeName | null | undefined) =>
  SURFACE[theme === "dark" ? "dark" : "light"];

export const AUTH_FADE_DURATION = 300;
export const TAB_SCENE_DURATION = 260;
export const SCREEN_ENTER_DURATION = 280;
export const UI_REACTION_DURATION = 180;

export const stackScreenOptions = (theme: ThemeName | null | undefined) =>
  ({
    headerShown: false,
    animation: "ios_from_right",
    contentStyle: { backgroundColor: surfaceFor(theme) },
  }) as const;

export const AUTH_SCREEN_OPTIONS = {
  animation: "fade",
  animationDuration: AUTH_FADE_DURATION,
} as const;

type SceneStyleInterpolator = NonNullable<
  BottomTabNavigationOptions["sceneStyleInterpolator"]
>;

const TAB_SCENE_SCALE = 1.03;

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

export const TAB_STATE_TIMING = {
  duration: UI_REACTION_DURATION,
  easing: WorkletEasing.out(WorkletEasing.cubic),
} as const;

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

export const SCREEN_ENTER = {
  fromScale: 1.02,
  timing: {
    duration: SCREEN_ENTER_DURATION,
    easing: WorkletEasing.out(WorkletEasing.cubic),
  },
} as const;

export const SHEET_OPEN_SPRING = {
  duration: 380,
  dampingRatio: 0.82,
  clamp: { min: 0 },
} as const;

export const SHEET_CLOSE_SPRING = {
  damping: 26,
  stiffness: 300,
  mass: 0.7,
} as const;

export const SHEET_CLOSE_DISTANCE = 120;
export const SHEET_CLOSE_VELOCITY = 800;
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

export const PROGRESS_FILL_TIMING = {
  duration: 240,
  easing: WorkletEasing.out(WorkletEasing.cubic),
} as const;

export const PROGRESS_INDETERMINATE_DURATION = 1100;

/** Width of the travelling indeterminate segment, as a share of the track. */
export const PROGRESS_INDETERMINATE_RATIO = 0.4;

export const PRESS_TRANSITION = "transition duration-150 ease-out";

export const PRESS_SCALE_CLASS = {
  surface: "active:scale-97",
  control: "active:scale-95",
  icon: "active:scale-90",

  flat: "",
} as const;

export type PressScale = keyof typeof PRESS_SCALE_CLASS;
export const PRESS_DIM_CLASS = "active:opacity-90";
export const APPEAR_DURATION = 260;
export const APPEAR_DISTANCE = 10;
export const APPEAR_STAGGER_MS = 35;
export const APPEAR_MAX_STAGGER_STEPS = 8;
