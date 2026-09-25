import type { TimeframeType } from "../../services/metricsService";
import { venueDateKey } from "../date/venueTime.ts";

/*
 * What a dashboard timeframe means, in one place (web parity:
 * utils/dashboardTimeframe.ts). "Today" is the venue's day, not the device's:
 * a phone set to another time zone must not start "today" at its own midnight.
 */

export const TIMEFRAME_LABELS: Record<TimeframeType, string> = {
  today: "Today",
  last_24h: "Last 24 Hours",
  last_7d: "Last 7 Days",
  last_30d: "Last 30 Days",
  all_time: "All Time",
  custom: "Custom Range",
};

/** The label the dashboard shows — the client's, so it always matches the picker. */
export const timeframeLabel = (timeframe: TimeframeType): string =>
  TIMEFRAME_LABELS[timeframe] ?? TIMEFRAME_LABELS.today;

/** Today's date at the venue, "YYYY-MM-DD". */
export const venueTodayKey = (now: Date = new Date()): string =>
  venueDateKey(now.toISOString()) ?? "";

const ROLLING_HOURS: Partial<Record<TimeframeType, number>> = {
  last_24h: 24,
  last_7d: 24 * 7,
  last_30d: 24 * 30,
};

/**
 * Whether a booking created at `createdAt` falls in the timeframe. Today and a
 * custom range are compared as venue calendar days (both ends inclusive); the
 * rolling windows are exact hours back from now.
 */
export function createdWithinTimeframe(
  createdAt: string | null | undefined,
  timeframe: TimeframeType,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): boolean {
  if (timeframe === "all_time") return true;
  if (!createdAt) return false;

  if (timeframe === "today") {
    return venueDateKey(createdAt) === venueTodayKey(now);
  }

  if (timeframe === "custom") {
    const day = venueDateKey(createdAt);
    if (!day) return false;
    if (customFrom && day < customFrom) return false;
    if (customTo && day > customTo) return false;
    return true;
  }

  const hours = ROLLING_HOURS[timeframe];
  if (!hours) return true;

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return created >= now.getTime() - hours * 60 * 60 * 1000;
}

/**
 * The dashboard's New Bookings: created within the timeframe, and not
 * cancelled — a booking that was made and then called off is not new business.
 */
export function filterNewBookings<
  T extends { createdAt: string | null; status?: string | null },
>(
  bookings: T[],
  timeframe: TimeframeType,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): T[] {
  return bookings.filter(
    (b) =>
      String(b.status ?? "").toLowerCase() !== "cancelled" &&
      createdWithinTimeframe(b.createdAt, timeframe, customFrom, customTo, now),
  );
}
