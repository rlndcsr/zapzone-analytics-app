import type { TrendTone } from "../customers/customerAnalyticsDisplay.ts";

/** The parts of a `key_metrics` entry the summary panel reads. */
export type MetricLike = {
  change: string | null;
  info: string | null;
};

/** What a summary cell shows under its value. */
export type MetricLine = {
  /** The percentage change, coloured by direction. */
  delta?: { text: string; tone: TrendTone };
  /** What the change is measured against, or the metric's plain note. */
  hint: string;
};

// "+12.5%", "-3.0%", "+1,250.0%", optionally followed by words
// ("+12.5% vs last period"). The backend formats with number_format, so a
// large change carries thousands commas.
const CHANGE = /^\s*([+-]?\d[\d,]*(?:\.\d+)?%)\s*(.*)$/;

/**
 * The line under a key metric's value.
 *
 * - A percentage change becomes the delta, green when up and red when down.
 *   A zero change ("0%", "+0.0%", "-0.0%") is grey: it went neither way.
 *   Any words after the percentage become the hint; otherwise `comparison`.
 * - Any other change text ("3 of 5 active") is a plain note, so it is the hint.
 * - With no change at all, the metric's `info` ("2 new packages") is the hint.
 */
export function metricLine(
  metric: MetricLike,
  comparison = "vs previous period",
): MetricLine {
  const change = metric.change?.trim() ?? "";
  const match = CHANGE.exec(change);
  if (match) {
    const pct = Number(match[1].replace(/[,%]/g, ""));
    const tone: TrendTone =
      !Number.isFinite(pct) || pct === 0 ? "neutral" : pct > 0 ? "up" : "down";
    return {
      delta: { text: match[1], tone },
      hint: match[2].trim() || comparison,
    };
  }
  if (change) return { hint: change };
  return { hint: metric.info?.trim() ?? "" };
}

/** Slice colours when the backend sends none (same order as the old pie). */
export const BREAKDOWN_PALETTE = [
  "#0644C7", "#16A34A", "#F59E0B", "#8B5CF6", "#EF4444",
  "#06B6D4", "#EC4899", "#65A30D", "#F97316", "#64748B",
];

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export type BreakdownInput = {
  label: string;
  value: number;
  /** The backend's colour for this part, when it sends a valid hex. */
  color?: string | null;
};

export type BreakdownRow = {
  key: string;
  label: string;
  value: number;
  /** 0–1 of the total, for the segmented bar. */
  share: number;
  /** Whole-number percentage for the row. */
  percent: number;
  color: string;
};

/**
 * Parts of one whole (booking statuses, package types, waiver sources) for the
 * segmented bar + rows. Like the pie it replaces: parts at zero (or below) are
 * left out, and each part's colour is the backend's when valid, otherwise the
 * palette's by position.
 */
export function breakdownRows(parts: BreakdownInput[]): BreakdownRow[] {
  const rows = parts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Number.isFinite(p.value) && p.value > 0);
  const total = rows.reduce((sum, { p }) => sum + p.value, 0);
  if (total <= 0) return [];
  return rows.map(({ p, i }) => {
    const color = p.color?.trim();
    return {
      key: `${i}-${p.label}`,
      label: p.label,
      value: p.value,
      share: p.value / total,
      percent: Math.round((p.value / total) * 100),
      color:
        color && HEX.test(color)
          ? color
          : BREAKDOWN_PALETTE[i % BREAKDOWN_PALETTE.length],
    };
  });
}
