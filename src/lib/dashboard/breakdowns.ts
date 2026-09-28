import type { BreakdownItem } from "../../services/metricsService";

// Client-built breakdown rows (web parity: components/admin/dashboard/breakdowns.ts).

export const percentageOf = (count: number, total: number): number =>
  total > 0 ? Math.round((count / total) * 100) : 0;

/** Rows with their share of the rows' own total; zero rows are dropped. */
export const buildBreakdown = (
  rows: { label: string; count: number }[],
): BreakdownItem[] => {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows
    .filter((row) => row.count > 0)
    .map((row) => ({
      label: row.label,
      count: row.count,
      percentage: percentageOf(row.count, total),
    }));
};

/**
 * The server rows whose status slug (or, on an older payload, label) is one of
 * `keys`, re-percented over just those rows — e.g. confirmed / checked-in /
 * completed out of `packageStatusBreakdown`, without the pending share.
 */
export const rescaleBreakdown = (
  items: BreakdownItem[] | undefined,
  keys: string[],
): BreakdownItem[] => {
  const wanted = keys.map((k) => k.toLowerCase());
  const picked = (items ?? []).filter((item) =>
    wanted.includes(String(item.status ?? item.label).toLowerCase()),
  );
  return buildBreakdown(
    picked.map((item) => ({ label: item.label, count: item.count })),
  );
};

/** Count rows by a label, in first-seen order, as a breakdown. */
export function countBreakdown<T>(
  rows: T[],
  labelOf: (row: T) => string,
): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelOf(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return buildBreakdown(
    Array.from(counts, ([label, count]) => ({ label, count })),
  );
}

/** "checked-in" → "Checked-in"; a blank status reads as pending, as on the web. */
export const bookingStatusLabel = (
  status: string | null | undefined,
): string => {
  const raw = String(status || "pending").toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};
