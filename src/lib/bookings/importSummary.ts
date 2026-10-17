import type { BulkImportResult } from "../../services/bookingsService";

/** "Row 3: …" / "Rows 4, 7: …" — one line per warning, as the web lists them. */
export const importWarningLines = (warnings: BulkImportResult["warnings"]): string[] =>
  (warnings ?? [])
    .filter((w) => w && typeof w.message === "string" && w.message.trim())
    .map((w) => {
      const rows = Array.isArray(w.rows) ? w.rows : [];
      return rows.length > 0
        ? `${rows.length === 1 ? "Row" : "Rows"} ${rows.join(", ")}: ${w.message}`
        : w.message;
    });

/**
 * The "Import complete" message: counts, the first row error, then the
 * bookings staff should check (web 37b7e04, BulkImportModal "Check these bookings").
 */
export function bookingImportSummary(result: BulkImportResult): string {
  const lines = [`Imported ${result.imported} of ${result.total_rows} row(s). Skipped ${result.skipped}.`];
  const errors = result.errors ?? [];
  if (errors.length > 0) {
    lines.push(`${errors.length} row error(s) — first: row ${errors[0].row}, ${errors[0].error}`);
  }
  const warnings = importWarningLines(result.warnings);
  if (warnings.length > 0) {
    lines.push("", "Check these bookings:", ...warnings);
  }
  return lines.join("\n");
}
