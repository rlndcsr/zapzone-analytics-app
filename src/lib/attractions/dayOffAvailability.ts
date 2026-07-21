import { WEEKDAY_NAMES_LOWER, pad, toKey } from "../date/calendar";

import type { AvailabilitySchedule } from "../../services/attractionsService";
import type { DayOff } from "../../services/dayOffsService";

/*
 * Attraction visit-date availability — a 1:1 port of the web admin's
 * PurchaseAttraction day-off logic. Given the location's day-offs plus the
 * attraction's weekday availability, it produces the exact same sets the web
 * ScheduleCalendar consumes: full day-offs (unselectable), partial "limited
 * hours" days (selectable), the available weekdays, and the per-date partial
 * closures used to trim the time-slot list. The business rules live here (not
 * in the UI) so the calendar only renders state it is handed.
 */

/** One time-restricted closure on a date. Both null ⇒ full-day (never here). */
export type Closure = { timeStart: string | null; timeEnd: string | null };

export type DayOffAvailability = {
  /** YYYY-MM-DD dates that are fully blocked (not selectable). */
  fullDayOffDates: Set<string>;
  /** YYYY-MM-DD dates with limited hours (selectable, some slots closed). */
  partialDates: Set<string>;
  /** Lowercase weekday names the attraction is open (empty ⇒ no restriction). */
  availableWeekdays: Set<string>;
  /** Closures keyed by date, used to filter that date's time slots. */
  partialClosuresByDate: Record<string, Closure[]>;
};

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

const addMinutesToTime = (time: string, minutes: number): string => {
  const total = timeToMinutes(time) + minutes;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/**
 * Whether a [slotStart, slotEnd) hour overlaps any closure. Mirrors the web
 * `isSlotBlockedByDayOff`: no times = whole day; only start = closes from then
 * on; only end = closed before then; both = blocks the [start, end) window.
 */
export const isSlotBlockedByDayOff = (
  slotStart: string,
  slotEnd: string,
  closures: Closure[],
): boolean => {
  const start = timeToMinutes(slotStart);
  const end = timeToMinutes(slotEnd);
  return closures.some(({ timeStart, timeEnd }) => {
    if (!timeStart && !timeEnd) return true;
    if (timeStart && !timeEnd) {
      const close = timeToMinutes(timeStart);
      return start >= close || end > close;
    }
    if (!timeStart && timeEnd) {
      const open = timeToMinutes(timeEnd);
      return start < open;
    }
    const rangeStart = timeToMinutes(timeStart as string);
    const rangeEnd = timeToMinutes(timeEnd as string);
    return start < rangeEnd && end > rangeStart;
  });
};

/** Hourly "HH:MM" slots in [startTime, endTime). Mirrors web generateTimeSlots. */
export const generateTimeSlots = (
  startTime: string,
  endTime: string,
  intervalMinutes = 60,
): string[] => {
  const slots: string[] = [];
  let cur = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  while (cur < end) {
    slots.push(`${pad(Math.floor(cur / 60))}:${pad(cur % 60)}`);
    cur += intervalMinutes;
  }
  return slots;
};

/** Union of the availability schedule's weekday names (lowercased). */
export const availableWeekdaysFrom = (
  availability: AvailabilitySchedule[],
): Set<string> => {
  const days = new Set<string>();
  availability.forEach((slot) =>
    slot.days.forEach((d) => days.add(d.toLowerCase())),
  );
  return days;
};

/** The availability window covering a given weekday, or undefined. */
const slotForDate = (
  dateKey: string,
  availability: AvailabilitySchedule[],
): AvailabilitySchedule | undefined => {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  const dayName = WEEKDAY_NAMES_LOWER[d.getDay()];
  return availability.find((s) =>
    s.days.map((x) => x.toLowerCase()).includes(dayName),
  );
};

/**
 * Open time slots for a date: the weekday's availability window, minus any
 * partial closures on that date. Mirrors the web time-slot recompute effect.
 */
export const availableTimeSlotsForDate = (
  dateKey: string,
  availability: AvailabilitySchedule[],
  partialClosuresByDate: Record<string, Closure[]>,
): string[] => {
  const slot = slotForDate(dateKey, availability);
  if (!slot) return [];
  const slots = generateTimeSlots(slot.start_time, slot.end_time, 60);
  const closures = partialClosuresByDate[dateKey] ?? [];
  return closures.length === 0
    ? slots
    : slots.filter(
        (s) => !isSlotBlockedByDayOff(s, addMinutesToTime(s, 60), closures),
      );
};

/**
 * Compute the calendar availability for an attraction. A day-off applies when
 * it is location-wide (no package / room / attraction / event scoping) OR its
 * attraction_ids include this attraction — exactly the web filter. Recurring
 * day-offs expand to the current year (if not past) + next year using the
 * stored month/day; one-time ones apply on their own date if not past.
 * Time-restricted day-offs become partial closures; a partial date whose every
 * slot ends up blocked is promoted to a full day-off.
 */
export function computeDayOffAvailability({
  dayOffs,
  attractionId,
  availability,
  today,
}: {
  dayOffs: DayOff[];
  attractionId: number;
  availability: AvailabilitySchedule[];
  /** Local midnight "now" — dates before it are ignored. */
  today: Date;
}): DayOffAvailability {
  const fullDayOffDates = new Set<string>();
  const partialClosuresByDate: Record<string, Closure[]> = {};

  for (const off of dayOffs) {
    const isLocationWide =
      off.packageIds.length === 0 &&
      off.roomIds.length === 0 &&
      off.attractionIds.length === 0 &&
      off.eventIds.length === 0;
    const appliesToAttraction = off.attractionIds.includes(attractionId);
    if (!isLocationWide && !appliesToAttraction) continue;

    const normalized = off.date.substring(0, 10);
    const offDate = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(offDate.getTime())) continue;

    const hasTimeRestriction = !!(off.timeStart || off.timeEnd);
    const targetDates: string[] = [];
    if (off.isRecurring) {
      const curr = new Date(
        today.getFullYear(),
        offDate.getMonth(),
        offDate.getDate(),
      );
      const next = new Date(
        today.getFullYear() + 1,
        offDate.getMonth(),
        offDate.getDate(),
      );
      if (curr >= today) targetDates.push(toKey(curr));
      targetDates.push(toKey(next));
    } else if (offDate >= today) {
      targetDates.push(normalized);
    }

    for (const dateStr of targetDates) {
      if (hasTimeRestriction) {
        (partialClosuresByDate[dateStr] ??= []).push({
          timeStart: off.timeStart,
          timeEnd: off.timeEnd,
        });
      } else {
        fullDayOffDates.add(dateStr);
      }
    }
  }

  // Promote partial dates whose every slot is blocked to full day-offs; the
  // rest become "limited hours".
  const partialDates = new Set<string>();
  for (const [dateStr, closures] of Object.entries(partialClosuresByDate)) {
    if (fullDayOffDates.has(dateStr)) continue;
    const slot = slotForDate(dateStr, availability);
    if (!slot) continue;
    const openSlots = generateTimeSlots(
      slot.start_time,
      slot.end_time,
      60,
    ).filter(
      (s) => !isSlotBlockedByDayOff(s, addMinutesToTime(s, 60), closures),
    );
    if (openSlots.length === 0) fullDayOffDates.add(dateStr);
    else partialDates.add(dateStr);
  }

  return {
    fullDayOffDates,
    partialDates,
    availableWeekdays: availableWeekdaysFrom(availability),
    partialClosuresByDate,
  };
}
