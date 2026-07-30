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
