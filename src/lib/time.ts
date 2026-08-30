// Shared availability time formatting — mirrors the web admin's utils/timeFormat.ts
// so detail views read identically across the app ("16:30:00" → "4:30 PM").

/** Convert a 24-hour time ("16:30:00") to 12-hour with AM/PM and no seconds. */
export function convertTo12Hour(time24: string | null): string {
  if (!time24) return "";
  const [hourStr, minuteStr] = time24.substring(0, 5).split(":");
  let hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return time24;
  const minute = minuteStr || "00";
  const period = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour = hour - 12;
  return `${hour}:${minute} ${period}`;
}

/**
 * Sort key for a "HH:mm" time — the web admin's calendar `timeToMinutes`.
 * Missing / unparseable times sort LAST, so "Any time" rows land at the end.
 */
export function timeToMinutes(time?: string | null): number {
  if (!time) return Number.MAX_SAFE_INTEGER;
  const [h, m] = time.split(":");
  const hours = parseInt(h, 10);
  if (Number.isNaN(hours)) return Number.MAX_SAFE_INTEGER;
  const mins = parseInt(m ?? "0", 10);
  return hours * 60 + (Number.isNaN(mins) ? 0 : mins);
}

/** "4:30 PM - 9:00 PM" (mirrors the web admin's formatTimeRange). */
export function formatTimeRange(
  start: string | null,
  end: string | null,
): string {
  if (!start || !end) return "";
  return `${convertTo12Hour(start)} - ${convertTo12Hour(end)}`;
}

/**
 * "2 hours" / "1 hr 30 min" / "45 min" — the web admin's
 * formatDurationDisplay, so a package reads the same in both admins. 0 is
 * "Unlimited" (how the backend stores an open-ended package).
 */
export function formatDuration(
  duration: number | null | undefined,
  durationUnit: string | null | undefined,
): string {
  if (duration == null || Number.isNaN(duration)) return "Not specified";
  if (duration === 0) return "Unlimited";

  if (durationUnit === "hours and minutes") {
    const hours = Math.floor(duration);
    const minutes = Math.round((duration % 1) * 60);
    if (hours > 0 && minutes > 0) return `${hours} hr ${minutes} min`;
    if (hours > 0) return hours === 1 ? "1 hour" : `${hours} hours`;
    if (minutes > 0) return `${minutes} min`;
    return "Not specified";
  }

  if (durationUnit === "minutes") {
    if (duration >= 60) {
      const hours = Math.floor(duration / 60);
      const mins = Math.round(duration % 60);
      if (mins === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
      return `${hours} hr ${mins} min`;
    }
    return `${Math.round(duration)} min`;
  }

  // hours (or an unknown unit, kept verbatim like the web does)
  const whole = Math.floor(duration);
  if (durationUnit === "hours" || !durationUnit) {
    const value = duration % 1 < 0.01 ? whole : duration;
    return value === 1 ? "1 hour" : `${value} hours`;
  }
  return `${duration % 1 < 0.01 ? whole : duration} ${durationUnit}`;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Length of an "HH:MM"→"HH:MM" window in minutes — the web admin's
 * `scheduleWindowMinutes`. Null when either side is blank or unparseable, 0 when
 * the two times are identical, and wrapped by a day when the end is earlier than
 * the start so an overnight window measures forwards.
 */
export function scheduleWindowMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  if (!startTime || !endTime) return null;

  const [startHours, startMins] = startTime.split(":").map(Number);
  const [endHours, endMins] = endTime.split(":").map(Number);
  // A time missing its minutes destructures to undefined, which Number.isNaN
  // would let through — the web only ever sees a complete <input type="time">.
  if (![startHours, startMins, endHours, endMins].every(Number.isFinite))
    return null;

  const diff = endHours * 60 + endMins - (startHours * 60 + startMins);
  if (diff === 0) return 0;
  return diff < 0 ? diff + MINUTES_PER_DAY : diff;
}
