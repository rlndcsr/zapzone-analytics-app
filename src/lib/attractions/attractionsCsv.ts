import type { AttractionRow } from "../../services/attractionsService";
import { formatDateTimeET } from "../date/venueTime";
import { normalizeCategory } from "../venueCategories";
import { formatDurationDisplay } from "./attractionDisplay";
import { buildPurchaseLink } from "./purchaseLink";

/*
 * CSV export for the Attractions table — a port of the web admin's
 * `exportToCSV` (components/admin/table/csv.ts + ManageAttractions). Same
 * columns in the same order, the same extra columns appended, and the same
 * escaping (quote-wrapped cells, CRLF rows, UTF-8 BOM) so a file exported from
 * either platform opens identically in Excel.
 */

const PRICING_TYPE_LABELS: Record<string, string> = {
  per_person: "Per Person",
  per_group: "Per Group",
  per_hour: "Per Hour",
  per_game: "Per Game",
  fixed: "Fixed Price",
};

type Cell = string | number | null | undefined;

const escapeCell = (value: Cell): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** Header row + data rows → a CSV string (BOM-prefixed, CRLF-delimited). */
export const toCsv = (headers: string[], rows: Cell[][]): string => {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  return `﻿${lines.join("\r\n")}`;
};

/** Column order and cell values, matching the web export exactly. */
const COLUMNS: { label: string; value: (a: AttractionRow) => Cell }[] = [
  { label: "Order", value: (a) => a.displayOrder ?? 0 },
  { label: "ID", value: (a) => a.id },
  { label: "Attraction", value: (a) => a.name },
  // Grouped, as the web's export is: its row mapper normalises before the CSV
  // is built. The JSON export deliberately stays raw — see AttractionsExportSheet.
  { label: "Category", value: (a) => normalizeCategory(a.category) },
  { label: "Description", value: (a) => a.description },
  { label: "Location", value: (a) => a.locationName },
  { label: "Price", value: (a) => Number(a.price).toFixed(2) },
  {
    label: "Pricing Type",
    value: (a) => PRICING_TYPE_LABELS[a.pricingType] ?? a.pricingType,
  },
  { label: "Capacity", value: (a) => a.maxCapacity },
  {
    label: "Capacity Visibility",
    value: (a) => (a.displayCapacityToCustomers === false ? "Hidden" : "Shown"),
  },
  {
    label: "Duration",
    value: (a) =>
      !a.duration ? "Unlimited" : formatDurationDisplay(a.duration, a.durationUnit),
  },
  { label: "Status", value: (a) => a.status },
  { label: "Purchase Link", value: (a) => buildPurchaseLink(a) },
  {
    label: "Created",
    value: (a) =>
      a.createdAt
        ? formatDateTimeET(a.createdAt, { month: "short", showZone: false })
        : "",
  },
  {
    label: "Updated",
    value: (a) =>
      a.updatedAt
        ? formatDateTimeET(a.updatedAt, { month: "short", showZone: false })
        : "",
  },
  // The web's `extraColumns` — raw values the display columns above format.
  { label: "Location ID", value: (a) => a.locationId ?? "" },
  { label: "Duration Value", value: (a) => a.duration || "0" },
  { label: "Duration Unit", value: (a) => a.durationUnit },
  { label: "Images", value: (a) => a.images.join(" | ") },
  { label: "Availability", value: (a) => JSON.stringify(a.availability ?? {}) },
];

/** Build the CSV text for the given (already filtered) attraction rows. */
export const buildAttractionsCsv = (rows: AttractionRow[]): string =>
  toCsv(
    COLUMNS.map((c) => c.label),
    rows.map((row) => COLUMNS.map((c) => c.value(row))),
  );

/** `zapzone-attractions-YYYY-MM-DD.csv`, matching the web's filename. */
export const attractionsCsvFilename = (): string =>
  `zapzone-attractions-${new Date().toISOString().split("T")[0]}.csv`;
