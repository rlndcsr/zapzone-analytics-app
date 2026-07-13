import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

// A single company-wide "active location" that scopes every location-aware
// module for a company_admin — the mobile equivalent of the web admin's
// sidebar location selector. Follows the reactive module-store pattern of
// dashboard/timeframeStore.ts, plus SecureStore persistence (theme.ts idiom)
// so the choice survives app restarts.
//
// Role-safety without per-consumer checks: only company_admins ever see the
// selector, so for managers/attendants the store stays at the default "all",
// getActiveLocationId() returns undefined, and every data hook behaves exactly
// as before (the backend scopes them to their own location).

export type ActiveLocation = {
  /** Location id, or "all" for company-wide (no location filter). */
  id: number | "all";
  /** Display name; "All Locations" when id === "all". */
  name: string;
};

const STORAGE_KEY = "zapzone_active_location";
const ALL_LOCATIONS: ActiveLocation = { id: "all", name: "All Locations" };

let state: ActiveLocation = ALL_LOCATIONS;

const listeners = new Set<() => void>();

export function getActiveLocation(): ActiveLocation {
  return state;
}

/**
 * The effective `location_id` for API calls: a number when a specific location
 * is active, or `undefined` for "All Locations" (so callers omit the param and
 * receive company-wide data).
 */
export function getActiveLocationId(): number | undefined {
  return state.id === "all" ? undefined : state.id;
}

/** Update the active location, notify subscribers, and persist (best-effort). */
export function setActiveLocation(next: ActiveLocation): void {
  // Skip no-op writes so subscribers don't re-render/refetch needlessly.
  if (next.id === state.id && next.name === state.name) return;
  state = next;
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {
    // Secure storage unavailable — selection holds for this run only.
  });
}

/** Reset to "All Locations" (call on sign-out so it can't leak across accounts). */
export function resetActiveLocation(): void {
  setActiveLocation(ALL_LOCATIONS);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe a component to the active-location selection. */
export function useActiveLocation(): ActiveLocation {
  return useSyncExternalStore(subscribe, getActiveLocation, getActiveLocation);
}

/**
 * Rehydrate the active location from secure storage. Call once on launch
 * (alongside restoreSession / applyStoredTheme) so it's ready before first paint.
 */
export async function restoreActiveLocation(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ActiveLocation;
    if (
      parsed &&
      (parsed.id === "all" || typeof parsed.id === "number") &&
      typeof parsed.name === "string"
    ) {
      state = parsed;
    }
  } catch {
    // Keep the default "All Locations" on any read/parse failure.
  }
}
