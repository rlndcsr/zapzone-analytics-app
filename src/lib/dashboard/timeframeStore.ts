import { useSyncExternalStore } from "react";
import type { TimeframeType } from "../../services/metricsService";

// ---------------------------------------------------------------------------
// Shared dashboard timeframe.
//
// The web keeps the timeframe on a single /manager/dashboard page. On mobile the
// dashboard is split across the Home (KPI cards) and Activity (operational
// lists) tabs, so the selected timeframe lives in this tiny external store and
// both screens read it via useTimeframeSelection(). Changing the filter on Home
// keeps Activity in sync, exactly like the single web page.
// ---------------------------------------------------------------------------

export type TimeframeSelection = {
  timeframe: TimeframeType;
  /** Custom-range start (YYYY-MM-DD); empty unless timeframe === "custom". */
  dateFrom: string;
  /** Custom-range end (YYYY-MM-DD); empty unless timeframe === "custom". */
  dateTo: string;
};

let state: TimeframeSelection = {
  timeframe: "all_time",
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
