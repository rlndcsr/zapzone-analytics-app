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

/**
 * A calendar date as "YYYY-MM-DD" — from a date, or from a timestamp such as an
 * event's "2026-10-26T04:00:00.000000Z" (the venue's midnight in UTC) — or ""
 * when there is none to read. The day is taken as written, never re-read through
 * the device's time zone, which would move it a day on a device west of the venue.
 */
export const dateKeyOf = (s?: string | null): string => {
  const m = /^\d{4}-\d{2}-\d{2}/.exec((s ?? "").trim());
  return m && parseKey(m[0]) ? m[0] : "";
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

/**
 * "2026-10-26", or an event's "2026-10-26T04:00:00.000000Z", -> "Mon, Oct 26":
 * the calendar day as written, never shifted by the device's time zone (web
 * parity: the cart's `parseLocalDate(...).toLocaleDateString` line date).
 */
export const formatDayMonth = (s?: string | null): string => {
  const d = parseKey(s);
  return d
    ? `${WEEKDAYS_FULL[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
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

/**
 * The same month grid as rows of exactly seven cells, trailing row padded with
 * `null`.
 *
 * Render a calendar week-by-week with `flex-1` cells, never as one wrapping row
 * of `width: ${100 / 7}%` cells: 100/7 is not exactly representable, seven of
 * them measure a hair over 100%, and the seventh cell wraps. That empties the
 * Saturday column and shifts every following date one column left, which reads
 * as a plausible calendar rather than an obviously broken one.
 */
export const buildMonthWeeks = (viewMonth: Date): (string | null)[][] => {
  const cells = buildMonthCells(viewMonth);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};
