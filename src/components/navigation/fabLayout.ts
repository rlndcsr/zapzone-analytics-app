export const FAB_SIZE = 56;
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_TOP_INSET = 28;
export const FAB_TOP_IN_TAB_BAR = 10;

export function tabBarBottomPadding(insetBottom: number): number {
  return insetBottom > 0 ? insetBottom : 14;
}

export function fabBottomOffset(insetBottom: number): number {
  return (
    TAB_BAR_TOP_INSET +
    TAB_BAR_HEIGHT +
    tabBarBottomPadding(insetBottom) -
    (FAB_TOP_IN_TAB_BAR + FAB_SIZE)
  );
}
