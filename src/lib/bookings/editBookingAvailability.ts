import { pad, toKey } from "../date/calendar.ts";

import type { AvailableSlot } from "../../services/bookingsService";
import type { DayOff } from "../../services/dayOffsService";

/*
 * What the admin Edit Booking screen is allowed to offer — dates and start
 * times — worked out the way the web admin's EditBooking works it out.
 *
 * Three rules live here, all of them the web's:
 *
 *   1. Day-offs. A location-wide, whole-day closure takes the date off the
 *      calendar. A closure that only covers part of a day, or that names this
 *      package, trims that date's start times instead.
 *   2. The booking window. A package may only be bookable N days out; beyond
 *      that the calendar stops.
 *   3. The booking's own start time. Availability stops offering starts that
 *      have gone by, so a booking edited later the same day would lose its own
 *      time from the list. It is put back, still selectable.
 *
 * Deliberately NOT here: the package's advance booking notice. That is a rule
 * for customers booking online — staff at the desk are not held to it, so it
 * never removes a date or a time from this screen (web parity, commit "Offer
 * only the walk-in staff picked, and stop advance notice gating admin").
 */

/** One closure on a date. Both null ⇒ the whole day is closed. */
export type Closure = { timeStart: string | null; timeEnd: string | null };

export type PackageClosures = {
  /** YYYY-MM-DD dates closed for the whole location — not selectable. */
  fullDayKeys: Set<string>;
  /** Closures that apply to this package, keyed by YYYY-MM-DD. */
  closuresByDate: Record<string, Closure[]>;
};

export const EMPTY_CLOSURES: PackageClosures = {
  fullDayKeys: new Set(),
  closuresByDate: {},
};

const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/**
 * Whether a closure that names packages or spaces reaches this package.
 * Mirrors the web's `dayOffAppliesToPackage`: a package list decides it
 * outright, a space-only list never blocks a package, and a closure that names
 * neither covers everything at the location.
 */
export function dayOffAppliesToPackage(
  dayOff: Pick<DayOff, "packageIds" | "roomIds">,
  packageId: number | null,
): boolean {
  if (dayOff.packageIds.length > 0) {
    return packageId != null && dayOff.packageIds.includes(packageId);
  }
  if (dayOff.roomIds.length > 0) return false;
  return true;
}

/**
 * Sort a location's day-offs into the two things this screen needs: dates that
 * are off the calendar entirely, and closures that trim a date's start times.
 *
 * `todayKey` bounds the result the way the web does — a closure that has
 * already passed is dropped, and a recurring one is expanded onto this year
 * (when it is still to come) and the next.
 */
export function packageClosures(
  dayOffs: DayOff[],
  packageId: number | null,
  todayKey: string,
): PackageClosures {
  const fullDayKeys = new Set<string>();
  const closuresByDate: Record<string, Closure[]> = {};
  const thisYear = Number(todayKey.slice(0, 4));

  dayOffs.forEach((dayOff) => {
    // A closure aimed only at attractions or events has nothing to say about a
    // package booking.
    const targetsAttractionOrEvent =
      dayOff.attractionIds.length > 0 || dayOff.eventIds.length > 0;
    const targetsPackageOrRoom =
      dayOff.packageIds.length > 0 || dayOff.roomIds.length > 0;
    if (targetsAttractionOrEvent && !targetsPackageOrRoom) return;

    const date = (dayOff.date ?? "").slice(0, 10);
    if (date.length !== 10) return;

    const keys: string[] = [];
    if (dayOff.isRecurring) {
      // Same month and day, this year and next — the year it was recorded in
      // is irrelevant once it repeats.
      const monthDay = date.slice(5);
      const current = `${thisYear}-${monthDay}`;
      if (current >= todayKey) keys.push(current);
      keys.push(`${thisYear + 1}-${monthDay}`);
    } else if (date >= todayKey) {
      keys.push(date);
    }
    if (keys.length === 0) return;

    const hasTimeRestriction = !!(dayOff.timeStart || dayOff.timeEnd);
    const closure: Closure = {
      timeStart: hasTimeRestriction ? dayOff.timeStart : null,
      timeEnd: hasTimeRestriction ? dayOff.timeEnd : null,
    };

    // Whole day, whole location: the date itself goes.
    const closesWholeLocationAllDay = !hasTimeRestriction && !targetsPackageOrRoom;

    keys.forEach((key) => {
      if (closesWholeLocationAllDay) {
        fullDayKeys.add(key);
        return;
      }
      if (!dayOffAppliesToPackage(dayOff, packageId)) return;
      (closuresByDate[key] ??= []).push(closure);
    });
  });

  return { fullDayKeys, closuresByDate };
}

/**
 * Whether a [start, end) start time falls inside one of a date's closures.
 *
 * The web reads the two fields the way the venue means them: `timeStart` is
 * when the venue closes early (nothing may start at or after it, and nothing
 * may run past it), `timeEnd` is when it opens late (nothing may start before
 * it). A closure with neither is a whole day, which the backend already keeps
 * out of availability; it is treated as closed here too rather than as open.
 */
export function isSlotClosed(
  closures: Closure[] | undefined,
  startTime: string,
  endTime: string,
): boolean {
  if (!closures || closures.length === 0) return false;
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  return closures.some(({ timeStart, timeEnd }) => {
    if (!timeStart && !timeEnd) return true;
    if (timeStart) {
      const closesAt = toMinutes(timeStart);
      if (start >= closesAt) return true;
      if (end > closesAt) return true;
    }
    if (timeEnd) {
      const opensAt = toMinutes(timeEnd);
      if (start < opensAt) return true;
    }
    return false;
  });
}

/**
 * The last date the calendar may offer, as YYYY-MM-DD. `booking_window_days`
 * is a package column (no venue carries one), and with none set the web walks
 * two years ahead — so this does too.
 */
export function bookingWindowEndKey(
  todayKey: string,
  bookingWindowDays: number | null,
): string {
  const days = bookingWindowDays == null ? 730 : Math.max(1, bookingWindowDays);
  const start = new Date(`${todayKey}T00:00:00`);
  if (Number.isNaN(start.getTime())) return todayKey;
  // The web's loop offers today plus the next N−1 days.
  start.setDate(start.getDate() + days - 1);
  return toKey(start);
}

/**
 * Whether a calendar day can be picked: inside the booking window, not in the
 * past, not a location-wide closure, and a day the package actually runs.
 *
 * The date already on the booking is always selectable, however far back it
 * is — the web unshifts it into its own list for the same reason. Without that
 * an old booking could not be edited at all: its date would be greyed out.
 */
export function isDateSelectable({
  dateKey,
  todayKey,
  windowEndKey,
  runsOnDate,
  fullDayKeys,
  currentDateKey,
}: {
  dateKey: string;
  todayKey: string;
  windowEndKey: string;
  /** The package's availability schedules say it runs on this date. */
  runsOnDate: boolean;
  fullDayKeys: Set<string>;
  currentDateKey: string | null;
}): boolean {
  if (currentDateKey && dateKey === currentDateKey) return true;
  if (dateKey < todayKey) return false;
  if (dateKey > windowEndKey) return false;
  if (fullDayKeys.has(dateKey)) return false;
  return runsOnDate;
}

/** The booking's own start, rebuilt as a slot so it stays selectable. */
export type CurrentSlotSeed = {
  /** "HH:MM" — the time saved on the booking. */
  time: string;
  durationMinutes: number;
  roomId: number | null;
};

/**
 * Availability no longer offers starts that have already gone by, so a booking
 * edited later the same day would lose its own time from the list. Put it back
 * where it belongs in the order, exactly once.
 */
export function withCurrentTimeSlot(
  slots: AvailableSlot[],
  selectedTime: string,
  current: CurrentSlotSeed | null,
): AvailableSlot[] {
  if (!selectedTime || !current) return slots;
  if (current.time !== selectedTime) return slots;
  if (slots.some((slot) => slot.startTime === selectedTime)) return slots;

  const endTotal =
    (toMinutes(selectedTime) + Math.max(0, current.durationMinutes)) %
    (24 * 60);

  const seeded: AvailableSlot = {
    startTime: selectedTime,
    endTime: `${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}`,
    roomId: current.roomId,
    roomName: null,
    remainingTickets: null,
    minParticipants: null,
  };

  return [seeded, ...slots].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
}

/** A booking's stored duration in minutes, whatever unit it was saved in. */
export function bookingDurationMinutes(
  duration: number | null | undefined,
  durationUnit: string | null | undefined,
): number {
  const raw = Number(duration) || 0;
  if (durationUnit === "minutes") return Math.round(raw);
  if (durationUnit === "hours and minutes") {
    return Math.floor(raw) * 60 + Math.round((raw % 1) * 60);
  }
  return Math.round(raw * 60);
}
