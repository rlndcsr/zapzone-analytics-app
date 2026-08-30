import { scheduleWindowMinutes } from "./time.ts";

/** One schedule row's times, as typed (not the save payload's defaults). */
export type PackageScheduleTimes = { start: string; end: string };

export type PackageSetupInput = {
  minParticipants: number | null;
  maxTicketsPerSlot: number | null;
  durationMinutes: number;
  schedules: PackageScheduleTimes[];
  bookingWindowDays: number | null;
  minBookingNoticeHours: number | null;
};

/** Package duration in whole minutes — the web's `durationToMinutes`. */
export function packageDurationMinutes(
  unit: string,
  duration: string,
  hours: string,
  minutes: string,
): number {
  if (unit === "hours and minutes") {
    return (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);
  }
  const value = parseFloat(duration) || 0;
  return unit === "hours" ? Math.round(value * 60) : Math.round(value);
}

/**
 * The first setup rule this package breaks, or null when it is bookable.
 *
 * Every rule guards against a package that saves cleanly but can never produce a
 * bookable slot. Blank fields stay falsy and skip their rule, so a half-filled
 * form is never blocked on a value the user has not reached yet.
 */
export function validatePackageSetup({
  minParticipants,
  maxTicketsPerSlot,
  durationMinutes,
  schedules,
  bookingWindowDays,
  minBookingNoticeHours,
}: PackageSetupInput): string | null {
  if (
    minParticipants &&
    maxTicketsPerSlot &&
    maxTicketsPerSlot < minParticipants
  ) {
    return "Max tickets per time slot cannot be lower than the minimum participants, or no time slot could ever be booked";
  }

  for (const [index, schedule] of schedules.entries()) {
    const windowMins = scheduleWindowMinutes(schedule.start, schedule.end);
    if (windowMins === 0) {
      return `Schedule ${index + 1}: start and end time cannot be the same. Use 00:00 as the end time for a window that runs to midnight.`;
    }
    if (
      windowMins !== null &&
      durationMinutes > 0 &&
      durationMinutes > windowMins
    ) {
      return `Schedule ${index + 1}: the ${windowMins} min window is shorter than the ${durationMinutes} min duration, so no time slot could ever be offered.`;
    }
  }

  if (
    bookingWindowDays &&
    minBookingNoticeHours !== null &&
    minBookingNoticeHours >= bookingWindowDays * 24
  ) {
    return `Advance booking time must be shorter than the booking window (${bookingWindowDays} days = ${bookingWindowDays * 24} hours), or no date could ever be booked.`;
  }

  return null;
}
