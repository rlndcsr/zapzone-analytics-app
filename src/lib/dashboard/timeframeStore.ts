import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import type { TimeframeType } from "../../services/metricsService";
import { getCurrentUser } from "../session";

// Shared dashboard timeframe store so the Home filter and Activity tab stay in
// sync (the web keeps both on one page; mobile splits them across two tabs).
//
// Persistence mirrors the web admin exactly. CompanyDashboard keeps the choice
// in localStorage under `dashboard_timeframe_<userId>` (getDefaultTimeframe /
// handleTimeframeChange) and re-reads it per user as the dashboard initialises.
// Mobile previously held this in memory only, so it reset to "today" on every
// cold start while the web reopened on the remembered window — the two clients
// then requested different date ranges and their cards disagreed.

/** Per-user key, matching the web's `dashboard_timeframe_<userId>`. */
function storageKey(): string {
  const id = getCurrentUser()?.id;
  return id ? `dashboard_timeframe_${id}` : "dashboard_timeframe";
}

/** The allow-list the web validates a stored value against before trusting it. */
const VALID_TIMEFRAMES: readonly TimeframeType[] = [
  "today",
  "last_24h",
  "last_7d",
  "last_30d",
  "all_time",
  "custom",
];

export type TimeframeSelection = {
  timeframe: TimeframeType;
  /** Custom-range start (YYYY-MM-DD); empty unless timeframe === "custom". */
  dateFrom: string;
  /** Custom-range end (YYYY-MM-DD); empty unless timeframe === "custom". */
  dateTo: string;
};

const DEFAULT_SELECTION: TimeframeSelection = {
  timeframe: "today",
  dateFrom: "",
  dateTo: "",
};

let state: TimeframeSelection = DEFAULT_SELECTION;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function getTimeframeSelection(): TimeframeSelection {
  return state;
}

/** Update the shared timeframe, notify subscribers (Home + Activity), persist. */
export function setTimeframeSelection(next: Partial<TimeframeSelection>): void {
  const merged = { ...state, ...next };
  // Skip no-op writes so subscribers don't re-render/refetch needlessly.
  if (
    merged.timeframe === state.timeframe &&
    merged.dateFrom === state.dateFrom &&
    merged.dateTo === state.dateTo
  ) {
    return;
  }
  state = merged;
  emit();
  // The web persists only the timeframe key (handleTimeframeChange), never the
  // custom range. Kept identical so a restored "custom" sends no date_from /
  // date_to on either client and both get the same window back.
  SecureStore.setItemAsync(storageKey(), merged.timeframe).catch(() => {
    // Secure storage unavailable — selection holds for this run only.
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe a component to the shared timeframe selection. */
export function useTimeframeSelection(): TimeframeSelection {
  return useSyncExternalStore(
    subscribe,
    getTimeframeSelection,
    getTimeframeSelection,
  );
}

/**
 * Load the signed-in user's stored timeframe — the web's `getDefaultTimeframe`.
 * Call after the session is available: on launch (once `restoreSession` has
 * resolved, since the key is per user) and again after login, which is when the
 * web remounts its dashboard and re-reads the new user's key.
 *
 * Always resets to the default when nothing valid is stored, so one account
 * never inherits another's in-memory selection.
 */
export async function restoreTimeframeSelection(): Promise<void> {
  let restored: TimeframeSelection = DEFAULT_SELECTION;
  try {
    const saved = await SecureStore.getItemAsync(storageKey());
    if (saved && VALID_TIMEFRAMES.includes(saved as TimeframeType)) {
      restored = { timeframe: saved as TimeframeType, dateFrom: "", dateTo: "" };
    }
  } catch {
    // Keep the default selection on any read failure.
  }
  state = restored;
  // Notify: the post-login call happens after subscribers have mounted.
  emit();
}
