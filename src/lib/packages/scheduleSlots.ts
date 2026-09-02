/**
 * The start times an availability schedule generates, previewed under the
 * schedule editor so staff can see what a window + interval actually produces
 * before saving. Ported from the web's Create/Edit Package forms so both admins
 * preview the same slots.
 *
 * Two rules can produce the grid, and the server picks between them the same way
 * {@link resolveScheduleSlots} does: whenever the package's spaces carry a
 * booking interval THEY set the start times and the schedule interval is ignored
 * entirely; otherwise the schedule interval applies.
 */

/** Minutes since midnight for "HH:MM" / "HH:MM:SS", or null when unparseable. */
export function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** Minutes since midnight back to "HH:MM", wrapping past a day boundary. */
export function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** One generated booking slot, as 24h "HH:MM" bounds. */
export type GeneratedSlot = { start: string; end: string };

/**
 * Every slot a schedule produces: a new start every `intervalMinutes`, each
 * running `durationMinutes`, and only while the whole slot still fits inside
 * the window. A window whose end is at or before its start is read as running
 * past midnight, matching the web.
 *
 * Returns an empty list whenever the configuration cannot produce a slot — no
 * duration, no interval, an unparseable time — so the caller can say so rather
 * than render a misleading empty row.
 */
export function generateScheduleSlots({
  start,
  end,
  intervalMinutes,
  durationMinutes,
  /** Guard against a runaway loop from a tiny interval over a long window. */
  maxSlots = 96,
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  intervalMinutes: number | null | undefined;
  durationMinutes: number | null | undefined;
  maxSlots?: number;
}): GeneratedSlot[] {
  const startMin = toMinutes(start);
  const endMinRaw = toMinutes(end);
  const interval = Number(intervalMinutes);
  const duration = Number(durationMinutes);

  if (startMin == null || endMinRaw == null) return [];
  if (!Number.isFinite(interval) || interval <= 0) return [];
  if (!Number.isFinite(duration) || duration <= 0) return [];

  // An end at or before the start means the window runs into the next day.
  const endMin = endMinRaw <= startMin ? endMinRaw + 1440 : endMinRaw;

  const slots: GeneratedSlot[] = [];
  for (
    let cursor = startMin;
    cursor < endMin && slots.length < maxSlots;
    cursor += interval
  ) {
    const slotEnd = cursor + duration;
    // Only a slot that finishes inside the window is bookable.
    if (slotEnd <= endMin) {
      slots.push({ start: fromMinutes(cursor), end: fromMinutes(slotEnd) });
    }
  }
  return slots;
}

/**
 * The gap the server leaves between two bookings in the same space, used only
 * when the rooms list does not report the venue's configured value.
 * `config('booking_rules.room_cleanup_minutes')` defaults to the same 15.
 */
export const DEFAULT_SLOT_CLEANUP_MINUTES = 15;

/** A selected space's booking interval in minutes; 0/null means it sets none. */
export type SpaceInterval = number | null | undefined;

const usableIntervals = (spaceIntervals: SpaceInterval[]): number[] =>
  spaceIntervals.filter(
    (m): m is number => m != null && Number.isFinite(m) && m > 0,
  );

/**
 * True when the spaces — not the schedule interval — decide the start times.
 *
 * One space with an interval is enough, which is exactly the server's test:
 * `roomDrivenTimeSlots` bails out only when *every* attached room's
 * `booking_interval` is 0.
 */
export function spacesDriveStartTimes(spaceIntervals: SpaceInterval[]): boolean {
  return usableIntervals(spaceIntervals).length > 0;
}

/**
 * The start times the spaces themselves open up, mirroring the server's
 * `GeneratesAvailableTimeSlots::roomDrivenTimeSlots`.
 *
 * Each space opens on its own offset — one `stagger` apart, where `stagger` is
 * the shortest booking interval among the spaces that set one — and then reopens
 * only once its previous party has finished and been cleaned. That reopen gap is
 * the `cycle`: long enough for a session plus cleanup, and never shorter than
 * one pass across all the spaces.
 *
 * `spaceIntervals` must carry ONE ENTRY PER SELECTED SPACE, including a 0 for a
 * space with no interval of its own: the server staggers across every attached
 * room and only reads the non-zero intervals to size the stagger, so dropping
 * the zeros here would shorten the cycle and invent start times.
 *
 * Returns null when the spaces cannot drive the grid at all — no space, no
 * interval among them, no duration, or unreadable times — which means the
 * caller should fall back to the schedule interval.
 */
export function generateSpaceDrivenSlots({
  start,
  end,
  durationMinutes,
  spaceIntervals,
  cleanupMinutes = DEFAULT_SLOT_CLEANUP_MINUTES,
  /** Same runaway guard the interval path uses. */
  maxSlots = 96,
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  durationMinutes: number | null | undefined;
  spaceIntervals: SpaceInterval[];
  cleanupMinutes?: number | null;
  maxSlots?: number;
}): GeneratedSlot[] | null {
  const usable = usableIntervals(spaceIntervals);
  if (usable.length === 0) return null;

  const startMin = toMinutes(start);
  const endMinRaw = toMinutes(end);
  const duration = Number(durationMinutes);
  if (startMin == null || endMinRaw == null) return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  // An end at or before the start means the window runs into the next day.
  const endMin = endMinRaw <= startMin ? endMinRaw + 1440 : endMinRaw;

  const stagger = Math.min(...usable);
  const spaceCount = spaceIntervals.length;
  const cleanup = Number(cleanupMinutes);
  const gap = Number.isFinite(cleanup) ? Math.max(0, cleanup) : 0;
  const cycle = Math.max(duration + gap, spaceCount * stagger);

  // Keyed on minutes from midnight rather than "HH:MM" so a window running
  // 18:00–02:00 does not sort 00:15 ahead of 18:00.
  const starts = new Set<number>();
  for (let index = 0; index < spaceCount; index += 1) {
    for (
      let cursor = startMin + index * stagger;
      cursor + duration <= endMin;
      cursor += cycle
    ) {
      starts.add(cursor);
    }
  }

  return [...starts]
    .sort((a, b) => a - b)
    .slice(0, maxSlots)
    .map((cursor) => ({
      start: fromMinutes(cursor),
      end: fromMinutes(cursor + duration),
    }));
}

/** A schedule's previewed start times, plus what produced them. */
export type ResolvedScheduleSlots = {
  slots: GeneratedSlot[];
  /** True when the spaces produced the grid and the schedule interval is unused. */
  drivenBySpaces: boolean;
  /** How often a new start opens across the spaces. Null unless space-driven. */
  staggerMinutes: number | null;
  /** How many spaces are behind the grid. 0 unless space-driven. */
  spaceCount: number;
};

/**
 * The start times a customer will actually be offered for one schedule row —
 * the single rule both package screens preview through.
 *
 * Spaces win when any of them carries an interval; the schedule interval only
 * applies when they cannot drive the grid, which is the same order of
 * precedence `generateAvailableSlotsWithRooms` applies on the server.
 */
export function resolveScheduleSlots({
  start,
  end,
  intervalMinutes,
  durationMinutes,
  spaceIntervals,
  cleanupMinutes,
  maxSlots,
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  intervalMinutes: number | null | undefined;
  durationMinutes: number | null | undefined;
  spaceIntervals: SpaceInterval[];
  cleanupMinutes?: number | null;
  maxSlots?: number;
}): ResolvedScheduleSlots {
  if (spacesDriveStartTimes(spaceIntervals)) {
    const fromSpaces = generateSpaceDrivenSlots({
      start,
      end,
      durationMinutes,
      spaceIntervals,
      cleanupMinutes,
      maxSlots,
    });
    if (fromSpaces) {
      return {
        slots: fromSpaces,
        drivenBySpaces: true,
        staggerMinutes: Math.min(...usableIntervals(spaceIntervals)),
        spaceCount: spaceIntervals.length,
      };
    }
  }

  return {
    slots: generateScheduleSlots({
      start,
      end,
      intervalMinutes,
      durationMinutes,
      maxSlots,
    }),
    drivenBySpaces: false,
    staggerMinutes: null,
    spaceCount: 0,
  };
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * What to tell staff about a schedule interval their spaces have taken over —
 * which spaces set the start times, and where to change them. Null while the
 * typed interval still applies, so the caller keeps its own hint.
 *
 * Reads the spaces rather than a resolved preview on purpose: the interval is
 * unused the moment a space carries one, even before a window is filled in.
 */
export function spaceDrivenIntervalHint(
  spaceIntervals: SpaceInterval[],
): string | null {
  const usable = usableIntervals(spaceIntervals);
  if (usable.length === 0) return null;
  return (
    `Not used — your ${plural(spaceIntervals.length, "space")} set the start ` +
    `times, one every ${Math.min(...usable)} min. Edit the interval on the space instead.`
  );
}

/** Credits a previewed grid to the spaces behind it, or null when it isn't theirs. */
export function spaceDrivenSourceLabel(
  resolved: ResolvedScheduleSlots,
): string | null {
  if (!resolved.drivenBySpaces || resolved.slots.length === 0) return null;
  return `from your ${plural(resolved.spaceCount, "space")}`;
}
