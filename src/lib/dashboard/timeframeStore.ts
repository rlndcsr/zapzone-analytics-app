import { useSyncExternalStore } from "react";
import type { TimeframeType } from "../../services/metricsService";

// Shared dashboard timeframe store so the Home filter and Activity tab stay in
// sync (the web keeps both on one page; mobile splits them across two tabs).

export type TimeframeSelection = {
  timeframe: TimeframeType;
  /** Custom-range start (YYYY-MM-DD); empty unless timeframe === "custom". */
  dateFrom: string;
  /** Custom-range end (YYYY-MM-DD); empty unless timeframe === "custom". */
  dateTo: string;
};

let state: TimeframeSelection = {
  timeframe: "today",
  dateFrom: "",
  dateTo: "",
};

const listeners = new Set<() => void>();

export function getTimeframeSelection(): TimeframeSelection {
  return state;
}

/** Update the shared timeframe and notify subscribers (Home + Activity). */
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
  listeners.forEach((l) => l());
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
