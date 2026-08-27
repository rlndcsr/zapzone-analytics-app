/**
 * Call to Book — when an item has no usable schedule, the venue books it by
 * phone instead of online.
 *
 * These are ports of the web admin's `src/utils/callToBook.ts`, kept
 * deliberately literal so the two apps never disagree about whether an item is
 * bookable. Each predicate answers one question: "can a customer pick a date
 * and time for this?" If not, the screen swaps its slot picker and pay button
 * for the Call to Book card.
 *
 * What is intentionally NOT ported: the web's `itemCallToBookAt` /
 * `callToBookByLocation` map. That exists because the storefront lists one item
 * across every venue at once. Every mobile screen here is already working with
 * a concrete item at a concrete location, so the caller simply evaluates the
 * item it loaded — which is location-specific by construction.
 */

/** One availability window: which weekdays, and the daily open/close times. */
export type AvailabilityBlock = {
  days?: string[];
  start_time?: string | null;
  end_time?: string | null;
};

/** The shape the package predicate needs; extra fields are ignored. */
export type PackageScheduleLike = {
  availabilityType?: string | null;
  dayConfiguration?: string[] | null;
  timeSlotStart?: string | null;
  timeSlotEnd?: string | null;
  isActive?: boolean;
};

/** Times invented for legacy availability — the web's `normalizeAvailability`
 *  uses this same window, so a legacy attraction reads as bookable in both. */
const LEGACY_START = "09:00";
const LEGACY_END = "17:00";

/**
 * Coerce whatever the API returned into availability blocks.
 *
 * Mirrors the web's `normalizeAvailability`. The array form passes through; the
 * legacy object form (`{ monday: true, tuesday: false }`) becomes a single
 * all-day block for the enabled weekdays. That second branch is load-bearing:
 * without it a legacy attraction has no blocks, and the predicate below would
 * wrongly call it Call to Book — see `availabilityRaw` on AttractionRow, which
 * exists so this function can still see the original object.
 */
export function normalizeAvailability(raw: unknown): AvailabilityBlock[] {
  if (Array.isArray(raw)) return raw as AvailabilityBlock[];

  if (typeof raw === "object" && raw !== null) {
    const enabledDays = Object.entries(raw as Record<string, unknown>)
      .filter(([, isAvailable]) => Boolean(isAvailable))
      .map(([day]) => day.toLowerCase());
    if (enabledDays.length === 0) return [];
    return [{ days: enabledDays, start_time: LEGACY_START, end_time: LEGACY_END }];
  }

  return [];
}

/**
 * An attraction is Call to Book when no availability block is usable — a block
 * needs at least one day and both times before a customer can pick a slot.
 */
export function attractionIsCallToBook(availability: unknown): boolean {
  return !normalizeAvailability(availability).some(
    (block) =>
      Array.isArray(block.days) &&
      block.days.length > 0 &&
      Boolean(block.start_time) &&
      Boolean(block.end_time),
  );
}

/**
 * A package is Call to Book when no schedule row is usable. Note the two
 * `return false` lines inside the `some` callback: an inactive row, or one
 * missing either time, cannot rescue the package — it is skipped rather than
 * counted. Weekly and monthly rows additionally need at least one configured
 * day; a daily row just needs its two times. No rows at all is Call to Book.
 */
export function packageIsCallToBook(
  schedules: PackageScheduleLike[] | null | undefined,
): boolean {
  if (!Array.isArray(schedules) || schedules.length === 0) return true;

  return !schedules.some((schedule) => {
    if (schedule?.isActive === false) return false;
    if (!schedule?.timeSlotStart || !schedule?.timeSlotEnd) return false;
    if (
      schedule.availabilityType === "weekly" ||
      schedule.availabilityType === "monthly"
    ) {
      return (
        Array.isArray(schedule.dayConfiguration) &&
        schedule.dayConfiguration.length > 0
      );
    }
    return true;
  });
}

/**
 * An event is Call to Book when either end of its daily window is missing.
 * `eventsService` maps a null time to "", which is falsy here, so both the
 * null and empty-string cases land in the same branch.
 */
export function eventIsCallToBook(
  event: { timeStart?: string | null; timeEnd?: string | null } | null | undefined,
): boolean {
  return !event?.timeStart || !event?.timeEnd;
}
