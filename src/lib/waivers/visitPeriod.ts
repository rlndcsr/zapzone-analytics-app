export type WaiverTimeframe =
  "today" | "last_24h" | "last_7d" | "last_30d" | "all_time" | "custom";

export const VISIT_PERIOD_OPTIONS: {
  label: string;
  value: WaiverTimeframe;
}[] = [
  { label: "Today", value: "today" },
  { label: "Last 24 Hours", value: "last_24h" },
  { label: "Last 7 Days", value: "last_7d" },
  { label: "Last 30 Days", value: "last_30d" },
  { label: "All Time", value: "all_time" },
  { label: "Custom Range", value: "custom" },
];

/** The date half of a waiver request. Never more than one of these is set. */
export type VisitPeriodScope = {
  all?: boolean;
  timeframe?: WaiverTimeframe;
  startDate?: string;
  endDate?: string;
};

export function visitPeriodScope(
  period: WaiverTimeframe,
  customStart?: string,
  customEnd?: string,
): VisitPeriodScope {
  if (period === "all_time") return { all: true };
  if (period === "custom") {
    return {
      timeframe: "custom",
      // Omitted rather than sent blank: a half-open custom range would other-
      // wise read server-side as a period nobody asked for.
      ...(customStart ? { startDate: customStart } : {}),
      ...(customEnd ? { endDate: customEnd } : {}),
    };
  }
  return { timeframe: period };
}
