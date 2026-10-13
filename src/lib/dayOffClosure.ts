/** One closure on a date. Both null ⇒ the whole day is closed. */
export type Closure = { timeStart: string | null; timeEnd: string | null };

/** "HH:MM" or "HH:MM:SS" → minutes since midnight; unreadable → 0. */
export const closureTimeToMinutes = (time: string): number => {
  const [h, m] = (time ?? "").split(":").map(Number);
  if (!Number.isFinite(h)) return 0;
  return h * 60 + (Number.isFinite(m) ? m : 0);
};

export const isFullDayClosure = (closure: Closure): boolean =>
  !closure.timeStart && !closure.timeEnd;

const blocksSpan = (
  start: number,
  end: number | null,
  closure: Closure,
): boolean => {
  if (isFullDayClosure(closure)) return true;

  if (closure.timeStart && !closure.timeEnd) {
    // closing early: nothing may start at or after it, nor run past it
    const closesAt = closureTimeToMinutes(closure.timeStart);
    return start >= closesAt || (end !== null && end > closesAt);
  }

  if (!closure.timeStart && closure.timeEnd) {
    // opening late: nothing may start before it
    return start < closureTimeToMinutes(closure.timeEnd);
  }

  const rangeStart = closureTimeToMinutes(closure.timeStart as string);
  const rangeEnd = closureTimeToMinutes(closure.timeEnd as string);
  if (rangeEnd <= rangeStart) return false;
  return end !== null
    ? start < rangeEnd && end > rangeStart
    : start >= rangeStart && start < rangeEnd;
};

/**
 * Whether a span in minutes since midnight runs into any of the closures.
 * With no end it is a single start minute, blocked only while the venue is
 * shut at that minute.
 */
export const isSpanBlockedByClosure = (
  startMinutes: number,
  endMinutes: number | null,
  closures: Closure[],
): boolean =>
  closures.some((closure) => blocksSpan(startMinutes, endMinutes, closure));

/** {@link isSpanBlockedByClosure} for "HH:MM" clock times. */
export const isSlotBlockedByClosure = (
  slotStart: string,
  slotEnd: string | null,
  closures: Closure[],
): boolean =>
  isSpanBlockedByClosure(
    closureTimeToMinutes(slotStart),
    slotEnd ? closureTimeToMinutes(slotEnd) : null,
    closures,
  );

/** A closure with both times has to end after it starts; any other shape is valid. */
export const closureRangeIsValid = (closure: Closure): boolean => {
  if (!closure.timeStart || !closure.timeEnd) return true;
  return (
    closureTimeToMinutes(closure.timeEnd) >
    closureTimeToMinutes(closure.timeStart)
  );
};

const formatClosureTime = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours)) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes || 0).padStart(2, "0")} ${period}`;
};

/** The closure in plain English — "Closed from 4:00 PM", "Closed until 12:00 PM", … */
export const describeClosure = (closure: Closure): string => {
  if (isFullDayClosure(closure)) return "Closed all day";
  if (closure.timeStart && !closure.timeEnd) {
    return `Closed from ${formatClosureTime(closure.timeStart)}`;
  }
  if (!closure.timeStart && closure.timeEnd) {
    return `Closed until ${formatClosureTime(closure.timeEnd)}`;
  }
  return `Closed ${formatClosureTime(closure.timeStart as string)} - ${formatClosureTime(closure.timeEnd as string)}`;
};

/* ------------------------------------- operating windows (web dayOffClosure) -- */

const MINUTES_PER_DAY = 1440;
/** A closing time at or before opening counts as the next morning, up to 6:00 AM. */
const OVERNIGHT_CLOSE_LIMIT = 6 * 60;

const clockMinutes = (time: string | null | undefined): number | null => {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const closingMinutes = (time: string | null | undefined): number | null => {
  const minutes = clockMinutes(time);
  return minutes === 0 ? MINUTES_PER_DAY : minutes;
};

const overnightClose = (opens: number | null, closes: number | null): number | null =>
  opens !== null && closes !== null && closes <= opens && closes <= OVERNIGHT_CLOSE_LIMIT
    ? closes + MINUTES_PER_DAY
    : closes;

const formatMinutes = (minutes: number): string => {
  if (minutes === MINUTES_PER_DAY) return "midnight";
  if (minutes > MINUTES_PER_DAY) return `${formatMinutes(minutes - MINUTES_PER_DAY)} (next morning)`;
  return formatClosureTime(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`);
};

/** Why an "open for set hours" window cannot be saved, or null when it can. */
export const operatingWindowError = (opensAt: string, closesAt: string): string | null => {
  const opens = clockMinutes(opensAt);
  const closes = overnightClose(opens, closingMinutes(closesAt));

  if (opens === null && closes === null) return "Enter the time it opens, the time it closes, or both.";
  if (opens !== null && closes !== null && closes <= opens) {
    return "The closing time must be later than the opening time, or no later than 6:00 AM the next morning.";
  }
  if ((opens === null || opens === 0) && (closes === null || closes >= MINUTES_PER_DAY)) {
    return "Those hours keep the whole day open, so nothing would be blocked.";
  }
  return null;
};

/** "Open only 12:00 PM – 4:00 PM", "Opens late at …", "Closes early at …". */
export const describeOperatingWindow = (opensAt: string, closesAt: string): string => {
  const opens = clockMinutes(opensAt);
  const closes = overnightClose(opens, closingMinutes(closesAt));

  if (opens !== null && closes !== null) return `Open only ${formatMinutes(opens)} – ${formatMinutes(closes)}`;
  if (opens !== null) return `Opens late at ${formatMinutes(opens)}`;
  if (closes !== null) return `Closes early at ${formatMinutes(closes)}`;
  return "Open all day";
};

/** What the window leaves blocked — "Blocked before 12:00 PM and from 4:00 PM". */
export const describeBlockedPeriod = (opensAt: string, closesAt: string): string => {
  const opens = clockMinutes(opensAt);
  const closes = overnightClose(opens, closingMinutes(closesAt));
  const parts: string[] = [];

  if (opens !== null && opens > 0) parts.push(`before ${formatMinutes(opens)}`);
  if (closes !== null && closes !== MINUTES_PER_DAY) parts.push(`from ${formatMinutes(closes)}`);

  return parts.length === 0 ? "Nothing is blocked" : `Blocked ${parts.join(" and ")}`;
};
