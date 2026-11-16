/**
 * The company Performance Analytics export, built from GET /analytics/company.
 *
 * The backend's POST /analytics/company/export is routed to the location
 * export, which requires a location_id, so it cannot export a company. These
 * build the same two files from the company report instead:
 * - JSON: the report as the backend sends it, plus `generated_at` — the shape
 *   of the backend's location JSON export, pretty-printed like the web's
 *   download.
 * - CSV: the backend's location CSV layout (a header block, Key Metrics, then
 *   one titled table per section), quoted the way PHP's fputcsv does.
 */

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** "total_revenue" -> "Total Revenue", like PHP's ucwords(str_replace('_', ' ', …)). */
export function titleOf(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/(^|\s)(\S)/g, (_, space: string, c: string) => space + c.toUpperCase());
}

/** One CSV field, quoted when it holds a comma, quote, space or line break (as fputcsv). */
export function csvField(value: unknown): string {
  let s: string;
  if (value == null) s = "";
  else if (typeof value === "boolean") s = value ? "1" : "";
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  return /[",\r\n\t ]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells: unknown[]) => cells.map(csvField).join(",");

/**
 * A titled table from a list of rows: one column per field (in first-seen
 * order), leaving out the chart `color`. Nothing for an empty list.
 */
function table(title: string, rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const objects = rows.filter(isObject);
  if (objects.length === 0) return [];
  const keys: string[] = [];
  for (const row of objects) {
    for (const key of Object.keys(row)) {
      if (key !== "color" && !keys.includes(key)) keys.push(key);
    }
  }
  return [
    line([title]),
    line(keys.map(titleOf)),
    ...objects.map((row) => line(keys.map((k) => row[k]))),
    "",
  ];
}

/** Report sections, in the screen's order. */
const SECTIONS: [key: string, title: string][] = [
  ["revenue_trend", "Revenue Trend"],
  ["daily_performance", "Daily Performance"],
  ["peak_hours", "Peak Activity Hours"],
  ["package_distribution", "Package Distribution"],
  ["booking_status", "Booking Status"],
  ["location_performance", "Location Performance"],
  ["top_attractions", "Top Attractions"],
  ["top_events", "Top Events"],
];

const WAIVER_SECTIONS: [key: string, title: string][] = [
  ["per_day", "Waivers Per Day"],
  ["age_brackets", "Adult Age Brackets"],
  ["minor_age_brackets", "Minor Age Brackets"],
  ["by_source", "Waivers by Source"],
];

export function companyExportJson(report: Json, generatedAt: string): string {
  return JSON.stringify({ ...report, generated_at: generatedAt }, null, 2);
}

/**
 * @param scope Which locations the export covers, e.g. "All locations" or the
 *   selected names — the report itself only carries their ids.
 */
export function companyExportCsv(
  report: Json,
  generatedAt: string,
  scope: string,
): string {
  const company = isObject(report.company) ? report.company : {};
  const range = isObject(report.date_range) ? report.date_range : {};

  const out: string[] = [
    line(["Company Analytics Export"]),
    line(["Generated At", generatedAt]),
    line(["Company", company.name]),
    line(["Locations", scope]),
    line(["Period", range.period]),
    line(["Start Date", range.start_date]),
    line(["End Date", range.end_date]),
    "",
  ];

  if (isObject(report.key_metrics)) {
    out.push(line(["Key Metrics"]), line(["Metric", "Value", "Change", "Trend", "Info"]));
    for (const [key, metric] of Object.entries(report.key_metrics)) {
      const m = isObject(metric) ? metric : {};
      out.push(line([titleOf(key), m.value, m.change, m.trend, m.info]));
    }
    out.push("");
  }

  for (const [key, title] of SECTIONS) out.push(...table(title, report[key]));

  if (isObject(report.waivers)) {
    const waivers = report.waivers;
    if (isObject(waivers.summary)) {
      out.push(line(["Waiver Summary"]), line(["Metric", "Value"]));
      for (const [key, value] of Object.entries(waivers.summary)) {
        out.push(line([titleOf(key), value]));
      }
      out.push("");
    }
    for (const [key, title] of WAIVER_SECTIONS) out.push(...table(title, waivers[key]));
  }

  // fputcsv ends every row, blank ones included, with "\n".
  return out.map((row) => `${row}\n`).join("");
}

/** "Zap Zone Inc." -> "zap-zone-inc-analytics-2026-11-16.csv" (the web's name, file-safe). */
export function exportFileName(name: string, date: Date, format: "json" | "csv"): string {
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
  return `${slug}-analytics-${ymd}.${format}`;
}
