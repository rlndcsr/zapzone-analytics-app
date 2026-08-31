/**
 * The start times an availability schedule generates, previewed under the
 * schedule editor so staff can see what a window + interval actually produces
 * before saving. Ported from the web's Create/Edit Package forms so both admins
 * preview the same slots.
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
