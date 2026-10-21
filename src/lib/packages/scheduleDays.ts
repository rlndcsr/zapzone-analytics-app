/**
 * Which dates a package schedule covers — the one rule every booking screen
 * uses, matching the server's PackageAvailabilitySchedule::matchesDate and the
 * web's utils/packageSchedule (web 8198ae3). Monthly days are stored as
 * "<occurrence>-<weekday>", e.g. "first-saturday" or "last-friday".
 */

import { WEEKDAY_NAMES_LOWER } from "../date/calendar.ts";

/** The occurrences a monthly day can name, in the order the web lists them. */
export const MONTHLY_OCCURRENCES = ["first", "second", "third", "fourth", "last"];

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The stored day list as strings. The server keeps it as JSON, so it can come
 * back as an object instead of an array; anything that is not a string is
 * skipped, as the server skips it.
 */
export function scheduleDayEntries(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : value !== null && typeof value === "object"
      ? Object.values(value)
      : [];
  return entries.filter((entry): entry is string => typeof entry === "string");
}

/** Whether `date` is the occurrence of the weekday a monthly day names. */
export function matchesMonthlyPattern(pattern: unknown, date: Date): boolean {
  if (typeof pattern !== "string") return false;

  const [occurrence, dayName] = pattern.toLowerCase().split("-");
  if (!dayName || dayName !== WEEKDAY_NAMES_LOWER[date.getDay()]) return false;

  if (occurrence === "last") {
    return (
      new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getMonth() !==
      date.getMonth()
    );
  }

  const position = MONTHLY_OCCURRENCES.indexOf(occurrence);
  return position >= 0 && position + 1 === Math.ceil(date.getDate() / 7);
}

/** Whether a schedule of this type and day list runs on `date` (ignores is_active). */
export function scheduleCoversDate(
  schedule: { availabilityType?: string | null; dayConfiguration?: unknown },
  date: Date,
): boolean {
  const entries = scheduleDayEntries(schedule.dayConfiguration);

  switch (schedule.availabilityType) {
    case "daily":
      return true;
    case "weekly":
      return entries.some((day) => day.toLowerCase() === WEEKDAY_NAMES_LOWER[date.getDay()]);
    case "monthly":
      return entries.some((entry) => matchesMonthlyPattern(entry, date));
    default:
      return false;
  }
}

/** "first-saturday" → "First Saturday" ("First Sat" when `short`). */
export function monthlyPatternLabel(pattern: string, short = false): string {
  const [occurrence, dayName] = String(pattern ?? "").toLowerCase().split("-");
  if (!occurrence || !dayName) return pattern;

  return `${capitalize(occurrence)} ${short ? capitalize(dayName).slice(0, 3) : capitalize(dayName)}`;
}
