import { Easing } from "react-native-reanimated";

export const MORPH_OPEN_SPRING = {
  damping: 19,
  stiffness: 190,
  mass: 0.9,
} as const;

export const MORPH_CLOSE_SPRING = {
  damping: 26,
  stiffness: 240,
  mass: 0.85,
} as const;

export const CLOSE_COLLAPSE_LEAD = 70;

export const PANEL_RADIUS = 28;

export const SHADOW_OPACITY_RANGE = [0.1, 0.22];
export const SHADOW_RADIUS_RANGE = [6, 26];
export const SHADOW_ELEVATION_RANGE = [3, 18];

export const BODY_FADE_RANGE = [0.4, 1];

export const ICON_MENU_FADE = [0, 0.55];
export const ICON_CLOSE_FADE = [0.45, 1];
export const ICON_TURN = 90;
export const ICON_MIN_SCALE = 0.6;

export const BACKDROP_COLOR = "#0B1220";
export const BACKDROP_MAX_OPACITY = 0.35;

export const ITEMS_OPEN_DELAY = 110;
export const ITEMS_OPEN_DURATION = 440;
export const ITEMS_CLOSE_DURATION = 120;
export const ITEM_STAGGER = 0.05;
export const ITEM_WINDOW = 0.5;
export const ITEM_TRANSLATE_Y = 10;
export const ITEM_SCALE_FROM = 0.95;

export const ITEMS_EASING = Easing.out(Easing.cubic);
export const CLOSE_EASING = Easing.in(Easing.quad);

export const FAB_PRESS_SCALE = 0.9;
export const FAB_PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
export const FAB_PRESS_OUT_SPRING = {
  damping: 14,
  stiffness: 320,
  mass: 0.6,
} as const;
