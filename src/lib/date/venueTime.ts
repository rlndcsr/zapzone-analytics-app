// Venue-timezone formatting for backend timestamps.
//
// Every instant the API returns (submitted_at, checked_in_at, created_at, …) is
// UTC. The web admin renders those in Michigan time — explicitly via
// utils/timeFormat.ts `formatDateTimeET` (America/Detroit + " ET"), and
// implicitly everywhere else, because the browsers running it sit in Michigan.
// The mobile app has no such guarantee: on a device in, say, UTC+8 the same
// waiver read "Aug 1, 2026 at 5:06 AM" where the website said "July 31, 2026 at
// 5:06 PM ET". These helpers pin the app to the venue's clock so both admins
// describe an event with the same wall time, wherever the phone happens to be.
//
// Date-only values (selected_date, booking_date, purchase_date — "YYYY-MM-DD")
// are NOT instants and must not go through here; they are already parsed as
// local midnight at their call sites, which keeps the calendar day intact.

/** Matches the web admin's MICHIGAN_TZ (utils/timeFormat.ts). */
export const VENUE_TIME_ZONE = "America/Detroit";

/** Suffix the web appends to venue timestamps, so the two read identically. */
export const VENUE_TIME_ZONE_LABEL = "ET";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type VenueParts = {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  /** 0-23. */
  hour: number;
  minute: number;
};

/** Day of the month for the nth Sunday of a (0-indexed) month. */
function nthSunday(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
}

/**
 * US Eastern UTC offset in minutes for an instant, from the DST rule itself:
 * EDT (-4) from 2:00 local on the second Sunday of March until 2:00 local on
 * the first Sunday of November, EST (-5) otherwise. Only used when the runtime
 * can't do IANA zones — Hermes normally can, so this is a safety net rather
 * than the main path.
 */
function easternOffsetMinutes(date: Date): number {
  const year = date.getUTCFullYear();
  const dstStart = Date.UTC(year, 2, nthSunday(year, 2, 2), 7); // 2:00 EST
  const dstEnd = Date.UTC(year, 10, nthSunday(year, 10, 1), 6); // 2:00 EDT
  const t = date.getTime();
  return t >= dstStart && t < dstEnd ? -240 : -300;
}

/** Break an instant into its wall-clock parts at the venue. */
function venueParts(date: Date): VenueParts {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: VENUE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const read = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);

    const year = read("year");
    const month = read("month");
    const day = read("day");
    // Some ICU builds report midnight as hour 24 under hour12: false.
    const hour = read("hour") % 24;
    const minute = read("minute");

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(hour) &&
      Number.isFinite(minute)
    ) {
      return { year, month, day, hour, minute };
    }
  } catch {
    // Runtime without IANA time zone data — fall through to the DST rule.
  }

  const shifted = new Date(date.getTime() + easternOffsetMinutes(date) * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clockLabel({ hour, minute }: VenueParts): string {
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export type VenueDateTimeOptions = {
  /** "long" → "July 31, 2026"; "short" → "Jul 31, 2026". */
  month?: "long" | "short";
  /** What sits between the date and the time. */
  separator?: string;
  /** Append " ET" — on by default, matching the web's formatDateTimeET. */
  showZone?: boolean;
  /** Rendered when the value is missing or unparseable. */
  fallback?: string;
};

/**
 * A backend timestamp as venue wall time, e.g.
 * "July 31, 2026 at 5:06 PM ET" — byte-for-byte the web admin's
 * formatDateTimeET output for the same instant.
 */
export function formatDateTimeET(
  iso: string | null | undefined,
  options: VenueDateTimeOptions = {},
): string {
  const {
    month = "long",
    separator = " at ",
    showZone = true,
    fallback = "—",
  } = options;

  const date = parseInstant(iso);
  if (!date) return fallback;

  const parts = venueParts(date);
  const monthName =
    month === "short"
      ? MONTHS_SHORT[parts.month - 1]
      : MONTHS_LONG[parts.month - 1];
  const zone = showZone ? ` ${VENUE_TIME_ZONE_LABEL}` : "";

  return `${monthName} ${parts.day}, ${parts.year}${separator}${clockLabel(parts)}${zone}`;
}

/** The venue-local calendar date of an instant, e.g. "July 31, 2026". */
export function formatDateET(
  iso: string | null | undefined,
  options: { month?: "long" | "short"; fallback?: string } = {},
): string {
  const { month = "long", fallback = "—" } = options;
  const date = parseInstant(iso);
  if (!date) return fallback;

  const parts = venueParts(date);
  const monthName =
    month === "short"
      ? MONTHS_SHORT[parts.month - 1]
      : MONTHS_LONG[parts.month - 1];
  return `${monthName} ${parts.day}, ${parts.year}`;
}

/** Just the venue wall time of an instant, e.g. "5:06 PM ET". */
export function formatTimeET(
  iso: string | null | undefined,
  options: { showZone?: boolean; fallback?: string } = {},
): string {
  const { showZone = true, fallback = "—" } = options;
  const date = parseInstant(iso);
  if (!date) return fallback;
  const zone = showZone ? ` ${VENUE_TIME_ZONE_LABEL}` : "";
  return `${clockLabel(venueParts(date))}${zone}`;
}

/** "YYYY-MM-DD" for an instant, in venue time — for grouping/sorting by day. */
export function venueDateKey(iso: string | null | undefined): string | null {
  const date = parseInstant(iso);
  if (!date) return null;
  const { year, month, day } = venueParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
