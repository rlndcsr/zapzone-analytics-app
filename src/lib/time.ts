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
