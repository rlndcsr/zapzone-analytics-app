import { pad, toKey } from "../date/calendar.ts";
import {
  isSlotBlockedByClosure,
  isSpanBlockedByClosure,
  type Closure,
} from "../dayOffClosure.ts";

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

export type { Closure };

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
 * Whether a [start, end) booking runs into one of a date's closures, read the
 * way the backend reads them (see dayOffClosure). A closure with neither time
 * is a whole day, which the backend already keeps out of availability; it is
 * treated as closed here too rather than as open.
 */
export function isSlotClosed(
  closures: Closure[] | undefined,
  startTime: string,
  endTime: string,
): boolean {
  if (!closures || closures.length === 0) return false;
  return isSlotBlockedByClosure(startTime, endTime, closures);
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
  /** YYYY-MM-DD the booking is saved on; its start only belongs on that day. */
  date?: string;
};

/**
 * Availability no longer offers starts that have already gone by, so a booking
 * edited later the same day would lose its own time from the list. Put it back
 * where it belongs in the order, exactly once — but only on the booking's own
 * date, and never inside a closure: a time the venue is now shut would only
 * be refused on save.
 */
export function withCurrentTimeSlot(
  slots: AvailableSlot[],
  selectedTime: string,
  current: CurrentSlotSeed | null,
  { selectedDate, closures }: { selectedDate?: string; closures?: Closure[] } = {},
): AvailableSlot[] {
  if (!selectedTime || !current) return slots;
  if (current.time !== selectedTime) return slots;
  if (current.date && selectedDate !== undefined && current.date !== selectedDate)
    return slots;
  if (slots.some((slot) => slot.startTime === selectedTime)) return slots;

  const startMinutes = toMinutes(selectedTime);
  const duration = Math.max(0, current.durationMinutes);
  if (
    closures &&
    closures.length > 0 &&
    isSpanBlockedByClosure(startMinutes, startMinutes + duration, closures)
  ) {
    return slots;
  }

  const endTotal = (startMinutes + duration) % (24 * 60);

  const seeded: AvailableSlot = {
    startTime: selectedTime,
    endTime: `${pad(Math.floor(endTotal / 60))}:${pad(endTotal % 60)}`,
    roomId: current.roomId,
    roomName: null,
    // Seeded from the booking itself, not offered by the server, so nothing is
    // known about which other spaces are free for this start.
    availableRoomIds: [],
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
