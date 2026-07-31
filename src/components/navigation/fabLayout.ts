// Geometry shared by the floating tab bar and the app-wide Quick Navigation FAB.
//
// The FAB is mounted once in the root shell (app/_layout.tsx) so every
// authenticated screen gets it, but on tab screens it must still land in the tab
// bar's notch exactly as it did when the tab bar rendered it. Both consumers
// derive from the numbers below so that placement can't drift apart.

/** FAB diameter (h-14 / w-14). */
export const FAB_SIZE = 56;

/** Height of the tab bar pill. */
export const TAB_BAR_HEIGHT = 64;

/** Transparent strip above the pill that the FAB overhangs into. */
export const TAB_BAR_TOP_INSET = 28;

/** The FAB's top edge within the tab bar container (overlaps the pill's top). */
export const FAB_TOP_IN_TAB_BAR = 10;

/** Safe-area bottom padding of the tab bar container, with a floor for devices
 *  that report no inset. */
export function tabBarBottomPadding(insetBottom: number): number {
  return insetBottom > 0 ? insetBottom : 14;
}

/**
 * Distance from the bottom of the window to the FAB's bottom edge.
 *
 * Derived from the tab bar box — container height (top inset + pill + bottom
 * padding) minus the FAB's offset inside that container — so the root-mounted
 * FAB is pixel-identical to the old tab-bar-owned one. Yoga positions a child
 * with defined insets from its parent's border box (parent padding is not added
 * on top), which is why the top inset counts once here.
 */
export function fabBottomOffset(insetBottom: number): number {
  return (
    TAB_BAR_TOP_INSET +
    TAB_BAR_HEIGHT +
    tabBarBottomPadding(insetBottom) -
    (FAB_TOP_IN_TAB_BAR + FAB_SIZE)
  );
}
