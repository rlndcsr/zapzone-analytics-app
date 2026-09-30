/** Most days one library request may cover — the server's `days` maximum. */
export const MAX_LIBRARY_DAYS = 120;
/** What the server shows when no range is chosen. */
export const DEFAULT_LIBRARY_DAYS = 14;

/**
 * How many days the chosen From–To range spans (To defaults to today), and how
 * many to ask the server for, so a long range is covered rather than cut to the
 * default 14 (web: PhotoLibrary `rangeDays` / `dayLimit`).
 */
export function libraryDayWindow(
  from: string,
  to: string,
  todayKey: string,
): { rangeDays: number; dayLimit: number } {
  if (!from) return { rangeDays: 0, dayLimit: DEFAULT_LIBRARY_DAYS };
  const end = to || todayKey;
  const rangeDays = Math.round((Date.parse(end) - Date.parse(from)) / 86400000) + 1;
  const dayLimit =
    rangeDays > 0 ? Math.min(MAX_LIBRARY_DAYS, rangeDays) : DEFAULT_LIBRARY_DAYS;
  return { rangeDays, dayLimit };
}

/** The "earlier days were left out" note, or null when the whole range is shown. */
export function libraryDaysNotice(
  window: { rangeDays: number; dayLimit: number },
  daysShown: number,
  truncated: boolean,
  hasFrom: boolean,
): string | null {
  if (truncated || daysShown < window.dayLimit || window.rangeDays === window.dayLimit)
    return null;
  return `Showing the ${window.dayLimit} most recent days with photos. ${
    hasFrom ? "Narrow the date range" : "Pick a From date"
  } to see earlier days.`;
}
