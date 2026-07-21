// Shared, timezone-safe calendar date helpers. Both the range calendar
// (DateRangeSheet) and the single-date calendar (DatePickerSheet) build from
// these so there is exactly one implementation of the month grid + the
// YYYY-MM-DD <-> local-Date conversions the backend and web expect.

export const pad = (n: number) => String(n).padStart(2, "0");

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Two-letter weekday headers, Sunday-first (matches the calendar grid). */
export const WEEKDAYS_MIN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Full lowercase weekday names indexed by Date.getDay() (0 = Sunday). Matches
 *  the web `DAY_NUMBER_TO_NAME` used for availability/day-off weekday checks. */
export const WEEKDAY_NAMES_LOWER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Local calendar date -> "YYYY-MM-DD" (no UTC drift). */
export const toKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-MM-DD" -> local Date at midnight, or null when unparseable. */
export const parseKey = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(`${s.substring(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "2026-01-05" -> "Jan 5, 2026" for compact display. */
export const formatShortDate = (s?: string | null): string => {
  const d = parseKey(s);
  return d
    ? `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
    : "";
};

const WEEKDAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "2026-07-24" -> "Friday, July 24, 2026" for a prominent, unabbreviated date. */
export const formatFullDate = (s?: string | null): string => {
  const d = parseKey(s);
  return d
    ? `${WEEKDAYS_FULL[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    : "";
};

/** First-of-month for `viewMonth` shifted by `delta` months. */
export const addMonths = (viewMonth: Date, delta: number) =>
  new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);

/**
 * The cells for a month grid: leading `null`s to pad to the first weekday
 * (Sunday = 0), then one "YYYY-MM-DD" key per day of the month.
 */
export const buildMonthCells = (viewMonth: Date): (string | null)[] => {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leading = new Date(year, month, 1).getDay(); // 0 = Sunday
  const days = new Date(year, month + 1, 0).getDate();
  const out: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day++) {
    out.push(toKey(new Date(year, month, day)));
  }
  return out;
};
