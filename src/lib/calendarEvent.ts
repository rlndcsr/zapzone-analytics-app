export type CalendarEventInput = {
  title: string;
  date?: string | null;
  time?: string | null;
  durationMinutes: number;
  location?: string | null;
  description?: string | null;
};

export type CalendarEventDraft = {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
};

export const REMINDER_MINUTES_BEFORE = 120;

function extractDateKey(raw?: string | null): string | null {
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function extractTime(
  raw?: string | null,
): { hour: number; minute: number } | null {
  if (!raw) return null;
  const match = /^(\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function buildCalendarEventDraft(
  input: CalendarEventInput,
): CalendarEventDraft | null {
  const dateKey = extractDateKey(input.date);
  if (!dateKey) return null;
  const time = extractTime(input.time);
  if (!time) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const startDate = new Date(
    year,
    month - 1,
    day,
    time.hour,
    time.minute,
    0,
    0,
  );
  if (Number.isNaN(startDate.getTime())) return null;

  const minutes =
    Number.isFinite(input.durationMinutes) && input.durationMinutes > 0
      ? input.durationMinutes
      : 120;
  const endDate = new Date(startDate.getTime() + minutes * 60000);

  return {
    title: input.title,
    startDate,
    endDate,
    location: input.location?.trim() || undefined,
    notes: input.description?.trim() || undefined,
  };
}

function durationToMinutes(
  duration: number,
  unit: string | null | undefined,
): number {
  if (unit === "hours and minutes") {
    const hours = Math.floor(duration);
    const mins = Math.round((duration % 1) * 60);
    return hours * 60 + mins;
  }
  return unit === "hours" ? duration * 60 : duration;
}

function resolveDurationMinutes(
  duration: number | null | undefined,
  unit: string | null | undefined,
  fallbackMinutes: number,
): number {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return fallbackMinutes;
  }
  return durationToMinutes(duration, unit);
}

export function bookingDurationMinutes(
  duration: number | null | undefined,
  unit: string | null | undefined,
): number {
  return resolveDurationMinutes(duration, unit, 120);
}

export function attractionDurationMinutes(
  duration: number | null | undefined,
  unit: string | null | undefined,
): number {
  return resolveDurationMinutes(duration, unit, 90);
}

export const EVENT_DURATION_MINUTES = 120;
