// Role-based bottom-tab config: which tabs each role sees (and their order).
// All screens are registered in _layout.tsx; the tab bar renders this subset.

/** Route names registered in app/(tabs). "navigation" is the center FAB. */
export type TabKey =
  | "home"
  | "location"
  | "activity"
  | "navigation"
  | "calendar"
  | "accounts";

/** The shared/default tab set (Company Admin and any unlisted role). */
const BASE_TABS: TabKey[] = [
  "home",
  "location",
  "navigation",
  "calendar",
  "accounts",
];

/** Location Manager swaps the Locations tab for the operational Activity tab. */
const MANAGER_TABS: TabKey[] = [
  "home",
  "activity",
  "navigation",
  "calendar",
  "accounts",
];

/** Role → ordered tab set. Unlisted roles fall back to {@link DEFAULT_TABS}. */
export const ROLE_TABS: Record<string, TabKey[]> = {
  company_admin: BASE_TABS,
  location_manager: MANAGER_TABS,
  // attendant is intentionally left on the base set for now.
};

export const DEFAULT_TABS = BASE_TABS;

/** Resolve the ordered tab set for a role, defaulting to the shared set. */
export function getRoleTabs(role?: string | null): TabKey[] {
  return (role && ROLE_TABS[role]) || DEFAULT_TABS;
}

/** Every route name registered under app/(tabs), regardless of role. */
const ALL_TAB_KEYS: TabKey[] = [
  "home",
  "location",
  "activity",
  "navigation",
  "calendar",
  "accounts",
];

/**
 * Is this pathname one of the bottom-tab screens?
 *
 * Only overlays that anchor themselves to the bottom edge need this: the tab
 * bar and the Quick Navigation FAB occupy that strip on a tab screen and
 * nothing does on a pushed stack screen, so the same overlay has to sit at two
 * different heights. Derived from the tab keys above so adding a tab can't
 * leave a floating banner sitting on top of it.
 */
export function isTabRoute(pathname: string): boolean {
  // Exact match only: `/calendar` is the tab, `/bookings/calendar` is a
  // pushed stack screen with no tab bar under it. `/profile` is pushed too —
  // it left the tab bar when Accounts took its slot.
  return ALL_TAB_KEYS.some((key) => pathname === `/${key}`);
}
