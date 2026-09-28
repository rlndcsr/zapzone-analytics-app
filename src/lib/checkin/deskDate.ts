import { MONTHS, toKey } from "../date/calendar.ts";
import { venueDateKey } from "../date/venueTime.ts";

/** The desk's day at the venue — Michigan, never UTC (web: michiganToday). */
export function deskTodayKey(now: Date = new Date()): string {
  return venueDateKey(now.toISOString()) ?? toKey(now);
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-09-24" → "Thu, September 24, 2026" — the weekday spelled out under the field. */
export function deskDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return "";
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}
