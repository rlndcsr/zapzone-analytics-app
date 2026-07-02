// ---------------------------------------------------------------------------
// Role-based bottom-tab configuration.
//
// The tab screens are all registered in app/(tabs)/_layout.tsx, but which tabs
// a role actually SEES (and their order) is decided here — the same
// config-driven approach as dashboardConfig.ts. The custom tab bar renders the
// routes named in this list, so adding/reordering a role's tabs is a one-line
// change with no conditional logic scattered through the navigator.
//
//   Company Admin  -> Home · Location · [FAB] · Calendar · Profile
//   Location Manager -> Home · Activity · [FAB] · Calendar · Profile
// ---------------------------------------------------------------------------

/** Route names registered in app/(tabs). "navigation" is the center FAB. */
export type TabKey =
  | "home"
  | "location"
  | "activity"
  | "navigation"
  | "calendar"
  | "profile";

/** The shared/default tab set (Company Admin and any unlisted role). */
const BASE_TABS: TabKey[] = [
  "home",
  "location",
  "navigation",
  "calendar",
  "profile",
];

/** Location Manager swaps the Locations tab for the operational Activity tab. */
const MANAGER_TABS: TabKey[] = [
  "home",
  "activity",
  "navigation",
  "calendar",
  "profile",
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
