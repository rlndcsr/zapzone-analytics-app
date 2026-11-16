import type { PeriodRange } from "../customers/customerAnalyticsDisplay.ts";

const PRESET_DAYS_BACK: Record<Exclude<PeriodRange, "custom">, number> = {
  "7d": 6,
  "30d": 29,
  "90d": 89,
  "1y": 364,
};

/** The UTC calendar date of `d`, as the web's `toISOString().slice(0, 10)`. */
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The from/to dates Page Analytics asks for — the web's presetToRange: a
 * preset counts today in ("Last 7 days" is today and the 6 days before), and
 * a custom range sends its own two dates.
 */
export function pageRange(
  q: { dateRange: PeriodRange; start?: string; end?: string },
  now: Date = new Date(),
): { from?: string; to?: string } {
  if (q.dateRange === "custom") return { from: q.start, to: q.end };
  const from = new Date(now);
  from.setDate(from.getDate() - PRESET_DAYS_BACK[q.dateRange]);
  return { from: utcDay(from), to: utcDay(now) };
}

/** The web's fmtDuration: "850ms", "42s", "6m 15s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return `${Math.max(0, Math.round(ms || 0))}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** The web's fmtPct: one decimal place. */
export const formatPercent = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const clock = (d: Date) => {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * When a conversion happened: "Today at 3:05 PM", "Yesterday at 9:12 AM",
 * "Nov 3 at 2:15 PM" (the year added when it isn't this year).
 */
export function formatWhen(raw: string | null, now: Date = new Date()): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, now)) return `Today at ${clock(d)}`;
  if (sameDay(d, yesterday)) return `Yesterday at ${clock(d)}`;
  const year = d.getFullYear() === now.getFullYear() ? "" : `, ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year} at ${clock(d)}`;
}

/** "2026-07-09" / ISO -> "Jul 9"; anything else (e.g. an hour bucket) as sent. */
export function shortDay(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return raw;
  return `${MONTHS[month - 1]} ${Number(m[3])}`;
}
