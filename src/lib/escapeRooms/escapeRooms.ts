/*
 * Pure rules behind the Escape Rooms screen, lifted out of the web admin's
 * EscapeRoomSessions.tsx so they can be unit-tested and stay identical to it.
 * Types are structural so this file has no app imports and runs under
 * `node --test` as-is.
 */

export type SlotStatus =
  | "waiting"
  | "signing"
  | "photo_ready"
  | "sent"
  | "send_problem"
  | "finished";

export type BadgeTone = "gray" | "muted" | "faint" | "amber" | "blue" | "green" | "red" | "slate";

export const STATUS_LABELS: Record<SlotStatus, string> = {
  waiting: "Waiting for players",
  signing: "Players signing",
  photo_ready: "Photo taken",
  sent: "Sent",
  send_problem: "Sent",
  finished: "Result only",
};

const STATUS_TONES: Record<SlotStatus, BadgeTone> = {
  waiting: "gray",
  signing: "amber",
  photo_ready: "blue",
  sent: "green",
  send_problem: "red",
  finished: "slate",
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  "checked-in": "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const EXCLUDED_LABELS: Record<string, string> = {
  booking_cancelled: "Their booking was cancelled",
  booking_moved: "Their booking is now for a different time",
  booking_removed: "Their booking was deleted",
  other_location: "Signed at another location",
};

/** "m:ss" for a whole number of seconds. */
export const formatSeconds = (total: number): string =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

export const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

type SlotLike = {
  bookings: unknown[];
  signed: number;
  photos: number;
  completed: boolean;
  isPast: boolean;
  status: SlotStatus;
  completionLabel: string;
  notDelivered: number;
};

/** The "Only games with bookings or players" filter. */
export const slotHasActivity = (slot: SlotLike): boolean =>
  slot.bookings.length > 0 || slot.signed > 0 || slot.photos > 0 || slot.completed;

export type SlotBadge = {
  text: string;
  tone: BadgeTone;
  /** A past game nobody played, drawn faded. */
  faded: boolean;
  /** Played but never sent — counted in the "not sent yet" pill. */
  pastUnsent: boolean;
};

/** The status pill on a day-board row, exactly as the web words it. */
export function slotBadge(slot: SlotLike): SlotBadge {
  const pastUnsent = slot.isPast && !slot.completed && (slot.signed > 0 || slot.photos > 0);
  const pastEmpty = slot.isPast && !slot.completed && slot.signed === 0 && slot.photos === 0;
  const openEmpty = !slot.isPast && slot.status === "waiting" && slot.bookings.length === 0;

  if (pastUnsent) return { text: "Not sent yet", tone: "red", faded: false, pastUnsent };
  if (pastEmpty) {
    return {
      text: slot.bookings.length > 0 ? "Nobody signed" : "No players",
      tone: "muted",
      faded: true,
      pastUnsent,
    };
  }
  if (openEmpty) return { text: "Open", tone: "faint", faded: false, pastUnsent };

  const result = slot.completed && slot.completionLabel ? ` · ${slot.completionLabel}` : "";
  const problem =
    slot.status === "send_problem" && slot.notDelivered ? ` · ${slot.notDelivered} not delivered` : "";
  return {
    text: `${STATUS_LABELS[slot.status]}${result}${problem}`,
    tone: STATUS_TONES[slot.status],
    faded: false,
    pastUnsent,
  };
}

/* ------------------------------------------------------------ finish time -- */

export type EntryMode = "used" | "left";

export type FinishTimeInput = {
  minutes: string;
  seconds: string;
  escaped: boolean;
  mode: EntryMode;
  /** The room's length; null when the backend does not know it. */
  roomMinutes: number | null;
};

export type FinishTime = {
  entered: boolean;
  /** Minutes 0-599 and seconds 0-59, both whole numbers. */
  typedValid: boolean;
  countingDown: boolean;
  /** Time the group actually used, in seconds. */
  usedSeconds: number;
  /** True when the form may be sent (always true for "didn't escape"). */
  valid: boolean;
  /** "m:ss" sent as `completion_time`, or "" when there is nothing usable. */
  label: string;
  longerThanRoom: boolean;
  veryFast: boolean;
};

const inRange = (minutes: number | null, seconds: number): minutes is number =>
  minutes !== null &&
  Number.isInteger(minutes) &&
  Number.isInteger(seconds) &&
  minutes >= 0 &&
  minutes <= 599 &&
  seconds >= 0 &&
  seconds <= 59;

/**
 * Staff can type either the time used or what the room's countdown clock still
 * showed ("time left"); the latter is converted with the room's length.
 */
export function evaluateFinishTime(input: FinishTimeInput): FinishTime {
  const minutes = input.minutes.trim() === "" ? null : Number(input.minutes);
  const seconds = input.seconds.trim() === "" ? 0 : Number(input.seconds);
  const entered = input.minutes.trim() !== "" || input.seconds.trim() !== "";
  const countingDown = input.mode === "left" && input.roomMinutes !== null;
  const typedValid = inRange(minutes, seconds);
  const typedSeconds = typedValid ? minutes * 60 + seconds : 0;
  const usedSeconds =
    countingDown && input.roomMinutes !== null ? input.roomMinutes * 60 - typedSeconds : typedSeconds;

  const valid =
    !input.escaped ||
    (typedValid && usedSeconds > 0 && (countingDown ? typedSeconds > 0 || entered : typedSeconds > 0));
  const label = typedValid && usedSeconds > 0 ? formatSeconds(usedSeconds) : "";
  const room = input.roomMinutes;

  return {
    entered,
    typedValid,
    countingDown,
    usedSeconds,
    valid,
    label,
    longerThanRoom: input.escaped && valid && room !== null && usedSeconds > room * 60,
    veryFast: input.escaped && valid && room !== null && usedSeconds < room * 15,
  };
}

/**
 * The minutes box accepts a pasted "47:12" and splits it across both boxes;
 * otherwise it keeps up to three digits. `seconds` is null when untouched.
 */
export function splitMinutesInput(raw: string): { minutes: string; seconds: string | null } {
  if (raw.includes(":")) {
    const [minutesPart, secondsPart = ""] = raw.split(":");
    return {
      minutes: minutesPart.replace(/\D/g, "").slice(0, 3),
      seconds: secondsPart.replace(/\D/g, "").slice(0, 2),
    };
  }
  return { minutes: raw.replace(/\D/g, "").slice(0, 3), seconds: null };
}

export const digitsOnly = (raw: string, max: number): string => raw.replace(/\D/g, "").slice(0, max);

/** Validates a corrected result; `label` is the "m:ss" to send when it is valid. */
export function evaluateCorrection(
  escaped: boolean,
  minutesRaw: string,
  secondsRaw: string,
): { valid: boolean; label: string | null } {
  const minutes = minutesRaw.trim() === "" ? null : Number(minutesRaw);
  const seconds = secondsRaw.trim() === "" ? 0 : Number(secondsRaw);
  const ok = inRange(minutes, seconds) && minutes * 60 + seconds > 0;
  return {
    valid: !escaped || ok,
    label: minutes !== null && ok ? `${minutes}:${String(seconds).padStart(2, "0")}` : null,
  };
}

/** The web's "In a 60-minute room with 12:48 left, enter 47:12" hint. */
export function timeUsedExample(roomMinutes: number | null): string | null {
  if (!roomMinutes || roomMinutes * 60 <= 768) return null;
  return formatSeconds(roomMinutes * 60 - 768);
}

/* ------------------------------------------------------------------ dates -- */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" shifted by whole days, on the calendar (no DST drift). */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
