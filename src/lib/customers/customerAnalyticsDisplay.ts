import { formatShortDate } from "../date/calendar.ts";

export type TrendTone = "up" | "down" | "neutral";

type KpiMeta = {
  info: string;
  comparison: string;

  comparable: boolean;
};

const KPI_META: Record<string, KpiMeta> = {
  "Total Customers": {
    info: "Unique customers (by email) who have made a booking, an attraction purchase or an event purchase. This counts all time, not just the selected period.",
    comparison: "vs prev. period",
    comparable: false,
  },
  "Active Customers": {
    info: "Customers with at least one booking in the last 30 days. Always the last 30 days, whatever period is selected.",
    comparison: "vs prior 30 days",
    comparable: true,
  },
  "Total Revenue": {
    info: "Revenue from bookings, attraction purchases and event purchases in the selected period, leaving out cancelled ones.",
    comparison: "vs prev. period",
    comparable: true,
  },
  "Repeat Rate": {
    info: "Share of this month's booking customers who had booked before. Always this calendar month, whatever period is selected.",
    comparison: "vs last month",
    comparable: true,
  },
  "Avg. Revenue/Customer": {
    info: "Revenue in the selected period divided by Total Customers (which is all time).",
    comparison: "vs prev. period",
    comparable: false,
  },
  "New Customers (30d)": {
    info: "Customers with a booking in the last 30 days. Always the last 30 days, whatever period is selected.",
    comparison: "vs prior 30 days",
    comparable: true,
  },
};

/** "+12.5%" -> 12.5, "-3%" -> -3, "" / junk -> null. */
export function parseChangePercent(
  change: string | null | undefined,
): number | null {
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*%?\s*$/.exec(change ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export type KpiDisplay = {
  delta: string;
  tone: TrendTone;
  comparison: string;
  info?: string;
};

export function kpiDisplay(kpi: { label: string; change: string }): KpiDisplay {
  const meta = KPI_META[kpi.label];
  const pct = parseChangePercent(kpi.change);
  let tone: TrendTone = "neutral";
  if (meta?.comparable && pct !== null && pct !== 0) {
    tone = pct > 0 ? "up" : "down";
  }
  return {
    delta: pct === null ? "" : kpi.change.trim(),
    tone,
    comparison:
      pct === null ? "No comparison" : (meta?.comparison ?? "vs prev. period"),
    info: meta?.info,
  };
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function sliceColor(
  color: string | null | undefined,
  fallback: string,
): string {
  return color && HEX.test(color.trim()) ? color.trim() : fallback;
}

export type StatusRow = {
  key: string;
  label: string;
  description?: string;
  count: number;
  color: string;
};

const STATUS_META: Record<
  string,
  { label: string; description: string; color: string }
> = {
  active: {
    label: "Active",
    description: "Booked in the last 30 days",
    color: "#10B981",
  },
  inactive: {
    label: "Inactive",
    description: "Booked more than 30 days ago",
    color: "#EF4444",
  },
  new: {
    label: "New",
    description: "New customers in the last 30 days",
    color: "#3B82F6",
  },
};

const titleCase = (s: string) =>
  s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function statusRows(
  slices: { status: string; count: number; color?: string }[],
): StatusRow[] {
  return slices.map((s) => {
    const key = s.status.trim().toLowerCase();
    const meta = STATUS_META[key];
    return {
      key,
      label: meta?.label ?? titleCase(s.status),
      description: meta?.description,
      count: s.count,
      color: sliceColor(s.color, meta?.color ?? "#9CA3AF"),
    };
  });
}

export type SegmentRow = {
  key: string;
  label: string;
  threshold?: string;
  percent: number;
  share: number;
  color: string;
};

const SEGMENT_META: Record<string, { threshold: string; color: string }> = {
  "high value": { threshold: "$1,000 or more spent", color: "#10B981" },
  "medium value": { threshold: "$500 – $999 spent", color: "#3B82F6" },
  "low value": { threshold: "Under $500 spent", color: "#EF4444" },
};

export function segmentRows(
  slices: { segment: string; value: number; color?: string }[],
): SegmentRow[] {
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  return slices.map((s) => {
    const key = s.segment.trim().toLowerCase();
    const meta = SEGMENT_META[key];
    return {
      key,
      label: s.segment,
      threshold: meta?.threshold,
      percent: s.value,
      share: total > 0 ? Math.max(0, s.value) / total : 0,
      color: sliceColor(s.color, meta?.color ?? "#9CA3AF"),
    };
  });
}

export type RankedRow = {
  rank: number;
  name: string;
  value: number;
  share: number;
};

export function rankedRows(
  rows: { name: string; value: number }[],
): RankedRow[] {
  const top = Math.max(0, ...rows.map((r) => r.value));
  return rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    value: r.value,
    share: top > 0 ? Math.max(0, r.value) / top : 0,
  }));
}

const groupThousands = (digits: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  const [int, frac] = String(Math.round(Math.abs(n) * 100) / 100).split(".");
  return `${sign}${groupThousands(int)}${frac ? `.${frac}` : ""}`;
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  const sign = n < 0 ? "-" : "";
  const [int, frac] = Math.abs(n).toFixed(2).split(".");
  return `${sign}$${groupThousands(int)}.${frac}`;
}

export type PeriodRange = "7d" | "30d" | "90d" | "1y" | "custom";

export const PERIOD_PRESETS: {
  value: Exclude<PeriodRange, "custom">;
  label: string;
}[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "1y", label: "1 year" },
];

const PRESET_LONG: Record<Exclude<PeriodRange, "custom">, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
};

export type AnalyticsQuery = {
  dateRange: PeriodRange;
  start?: string;
  end?: string;
  locationId?: number;
};

export function periodLabel(
  q: Pick<AnalyticsQuery, "dateRange" | "start" | "end">,
): string {
  if (q.dateRange !== "custom") return PRESET_LONG[q.dateRange];
  if (!q.start || !q.end) return "Custom range";
  return `${formatShortDate(q.start)} – ${formatShortDate(q.end)}`;
}

/** Identity of a request. Data is only "current" when its key matches the picker's. */
export function queryKey(q: AnalyticsQuery): string {
  const range =
    q.dateRange === "custom"
      ? `custom:${q.start ?? ""}:${q.end ?? ""}`
      : q.dateRange;
  return `${range}|${q.locationId ?? "all"}`;
}

export type AnalyticsViewState = {
  body: "skeleton" | "error" | "content";
  stale: boolean;
  updating: boolean;
  banner: boolean;
};

export function analyticsViewState(s: {
  loading: boolean;
  error: string | null;
  hasData: boolean;
  loadedKey: string | null;
  currentKey: string;
}): AnalyticsViewState {
  if (!s.hasData) {
    return {
      body: s.loading || !s.error ? "skeleton" : "error",
      stale: false,
      updating: false,
      banner: false,
    };
  }
  return {
    body: "content",
    stale: s.loadedKey !== s.currentKey,
    updating: s.loading,
    banner: !s.loading && !!s.error,
  };
}

/** "3:05 PM" for the "Updated …" caption. */
export function formatClockTime(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export function exportBlockReason(v: {
  sections: readonly string[];
  dateRange: string;
  start: string;
  end: string;
}): string | null {
  if (v.sections.length === 0) return "Select at least one section to export.";
  if (v.dateRange === "custom" && (!v.start || !v.end)) {
    return "Pick a start and end date for the custom range.";
  }
  return null;
}
