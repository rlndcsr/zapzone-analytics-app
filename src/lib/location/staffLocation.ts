import type { AuthUser } from "../../services/auth";

// A location manager can be assigned several locations and works in one at a
// time. The server keeps the active one on the sign-in token and scopes every
// request to it; the app only mirrors that choice onto the session user.

export type WorkLocation = {
  id: number;
  name: string;
  slug?: string | null;
  city?: string | null;
  state?: string | null;
};

/** `data` of GET /api/staff-locations and PUT /api/staff-locations/active. */
export type StaffLocationState = {
  active_location_id: number | null;
  active_location_name: string | null;
  home_location_id: number | null;
  can_switch: boolean;
  locations: WorkLocation[];
};

/** The locations a manager may switch between — empty for every other role. */
export function workLocationsOf(user: AuthUser | null): WorkLocation[] {
  if (user?.role !== "location_manager" || !Array.isArray(user.work_locations)) {
    return [];
  }
  return user.work_locations as WorkLocation[];
}

export function homeLocationIdOf(user: AuthUser | null): number | null {
  if (typeof user?.home_location_id === "number") return user.home_location_id;
  return user?.location_id ?? null;
}

export function canSwitchLocation(user: AuthUser | null): boolean {
  return workLocationsOf(user).length > 1;
}

/** The location to reopen on sign-in: the remembered one, only while it is still assigned. */
export function reopenTarget(user: AuthUser, remembered: number | null): number | null {
  if (remembered == null || remembered === user.location_id) return null;
  return workLocationsOf(user).some((l) => l.id === remembered) ? remembered : null;
}

/** `GET /api/user` carries the same state flattened onto the user record. */
export function stateFromUserPayload(body: unknown): StaffLocationState | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || !Array.isArray(raw.work_locations)) return null;
  const activeId = typeof raw.location_id === "number" ? raw.location_id : null;
  const locations = raw.work_locations as WorkLocation[];
  return {
    active_location_id: activeId,
    active_location_name: locations.find((l) => l.id === activeId)?.name ?? null,
    home_location_id:
      typeof raw.home_location_id === "number" ? raw.home_location_id : activeId,
    can_switch: locations.length > 1,
    locations,
  };
}

/** The session user pointed at the server's active location; only location fields change. */
export function withStaffLocation(user: AuthUser, state: StaffLocationState): AuthUser {
  const activeId = state.active_location_id;
  const locations = Array.isArray(state.locations) ? state.locations : [];
  const active = locations.find((l) => l.id === activeId);
  const location =
    activeId == null
      ? null
      : user.location?.id === activeId
        ? user.location
        : {
            id: activeId,
            name: active?.name ?? state.active_location_name ?? "",
            city: active?.city ?? null,
            state: active?.state ?? null,
          };

  return {
    ...user,
    location_id: activeId,
    location,
    home_location_id: state.home_location_id,
    work_locations: locations,
  };
}
