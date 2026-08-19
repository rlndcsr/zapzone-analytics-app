import { Easing } from "react-native-reanimated";

/**
 * Motion vocabulary for the Quick Navigation menu.
 *
 * The menu is a full-screen page that cross-fades up over the tab screen, with
 * its sections dealt in as cards and the FAB itself growing into the "Tap to
 * close" flower at the bottom. Three drivers do all of it: `progress` (page +
 * close button), `itemsProgress` (staggered cards and tiles) and `bloom`
 * (petals) — see MorphingFabMenu.
 */

/** Page: cross-fade in while it rises the last few pixels. */
export const SHEET_OPEN_SPRING = {
  damping: 24,
  stiffness: 220,
  mass: 0.9,
} as const;
export const SHEET_CLOSE_TIMING = {
  duration: 210,
  easing: Easing.in(Easing.cubic),
} as const;
export const SHEET_TRANSLATE_Y = 26;
export const SHEET_SCALE_FROM = 0.985;

/** Staggered reveal, shared by the section cards and the tiles inside them. */
export const ITEMS_OPEN_DELAY = 60;
export const ITEMS_OPEN_DURATION = 420;
export const ITEMS_CLOSE_DURATION = 140;
export const ITEMS_EASING = Easing.out(Easing.cubic);
export const CLOSE_EASING = Easing.in(Easing.quad);

export const CARD_REVEAL = {
  stagger: 0.16,
  window: 0.6,
  translateY: 26,
  scaleFrom: 0.97,
} as const;

export const ITEM_REVEAL = {
  stagger: 0.03,
  window: 0.5,
  translateY: 14,
  scaleFrom: 0.9,
} as const;

/** Close button: the 56pt FAB grows into the labelled circle and back. */
export const CLOSE_BUTTON_SIZE = 76;
export const CLOSE_BUTTON_RING = 9;
export const CLOSE_MENU_ICON_FADE = [0, 0.4];
export const CLOSE_LABEL_FADE = [0.35, 0.9];
export const ICON_TURN = 90;
export const ICON_MIN_SCALE = 0.6;
export const CLOSE_PRESS_SCALE = 0.94;
export const CLOSE_PRESS_IN = {
  duration: 90,
  easing: Easing.out(Easing.quad),
} as const;
export const CLOSE_PRESS_OUT_SPRING = {
  damping: 13,
  stiffness: 300,
  mass: 0.6,
} as const;

/** Petals: bloom open one after another around the circle, then drift. */
export const PETAL_BLOOM_DELAY = 40;
export const PETAL_BLOOM_SPRING = {
  damping: 14,
  stiffness: 120,
  mass: 0.9,
} as const;
export const PETAL_CLOSE_TIMING = {
  duration: 190,
  easing: Easing.in(Easing.cubic),
} as const;
export const PETAL_STAGGER = 0.045;
export const PETAL_WINDOW = 0.55;
export const PETAL_SCALE_FROM = 0.3;
/** Degrees each petal sweeps through on its way out — the "bloom" twist. */
export const PETAL_SWIRL = 28;
/** How far the whole flower rises off the FAB as it opens, so its lowest petals
 *  clear the bottom edge of the screen. */
export const FLOWER_LIFT = 30;
/** The flower springs open as one shape off `bloom`, on top of the per-petal
 *  stagger: this is the scale it starts from, and the spring's overshoot on the
 *  way to 1 is the pop that lands the bloom. */
export const FLOWER_BLOOM_SCALE_FROM = 0.88;
export const FLOWER_SPIN_DURATION = 34000;
export const FLOWER_BREATHE_DURATION = 3800;
export const FLOWER_BREATHE_SCALE = 1.04;

export const CARD_SHADOW_COLOR = "#0F172A";
export const FAB_SHADOW_COLOR = "#0644C7";

/** Tab-bar FAB press feedback (QuickNavFab). */
export const FAB_PRESS_SCALE = 0.9;
export const FAB_PRESS_IN = { duration: 90, easing: Easing.out(Easing.quad) };
export const FAB_PRESS_OUT_SPRING = {
  damping: 14,
  stiffness: 320,
  mass: 0.6,
} as const;
