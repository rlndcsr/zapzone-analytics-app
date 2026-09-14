import { type ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import {
  APPEAR_DISTANCE,
  APPEAR_DURATION,
  APPEAR_MAX_STAGGER_STEPS,
  APPEAR_STAGGER_MS,
} from "../../navigation/navMotion";

/**
 * Content arriving on screen: a short rise with a fade, optionally staggered
 * down a list.
 *
 * Use it for things that appear *after* the screen does — a table's rows once
 * they have loaded, a panel that opens, a result that comes back. The screen's
 * own entrance is already handled by the navigator (see navMotion.ts); this is
 * for content whose arrival the navigator knows nothing about.
 *
 * Why the stagger is capped: delaying each row by a fixed step is what makes a
 * list feel sequenced rather than dumped, but run unchecked across 50 rows it
 * becomes a two-second reveal the user has to sit through. Past
 * {@link APPEAR_MAX_STAGGER_STEPS} every remaining row shares the final delay,
 * so the top of the list reads as a cascade and the rest simply arrives.
 *
 * Reduced motion drops the rise and the stagger, keeping a plain fade — the
 * content still resolves rather than snapping in, but nothing travels.
 */
export function Appear({
  children,
  index = 0,
  /** Extra delay before this element's own animation, in ms. */
  delay = 0,
  style,
  className,
}: {
  children: ReactNode;
  /** Position in a list; drives the stagger. Omit for a standalone element. */
  index?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  const stagger =
    Math.min(index, APPEAR_MAX_STAGGER_STEPS) * APPEAR_STAGGER_MS + delay;

  const entering = reduceMotion
    ? FadeIn.duration(APPEAR_DURATION)
    : FadeInDown.duration(APPEAR_DURATION)
        .delay(stagger)
        .withInitialValues({ transform: [{ translateY: APPEAR_DISTANCE }] });

  return (
    <Animated.View entering={entering} style={style} className={className}>
      {children}
    </Animated.View>
  );
}
