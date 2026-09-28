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
