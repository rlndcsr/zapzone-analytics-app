export const SCHEDULE_LIMIT_MS = 364 * 24 * 60 * 60 * 1000;

export const SCHEDULE_PAST_MESSAGE =
  "Pick a date and time in the future to schedule this campaign";
export const SCHEDULE_TOO_FAR_MESSAGE =
  "Pick a date and time within the next year";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Emails to event registrants go out right away; the server refuses to schedule them. */
export const canScheduleCampaign = (
  recipientTypes: readonly string[],
): boolean => !recipientTypes.includes("event_registrants");

export function scheduleMoment(dateKey: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])];
  const at = new Date(year, month, day, Number(t[1]), Number(t[2]));
  if (
    at.getFullYear() !== year ||
    at.getMonth() !== month ||
    at.getDate() !== day
  )
    return null;
  return at;
}

export type ScheduleChoice =
  | { kind: "now" }
  | { kind: "later"; at: Date }
  | { kind: "invalid"; message: string };

export function resolveSchedule(input: {
  sendLater: boolean;
  recipientTypes: readonly string[];
  date: string;
  time: string;
  now?: number;
}): ScheduleChoice {
  if (!input.sendLater || !canScheduleCampaign(input.recipientTypes))
    return { kind: "now" };
  const now = input.now ?? Date.now();
  const at = scheduleMoment(input.date, input.time);
  if (!at || at.getTime() <= now)
    return { kind: "invalid", message: SCHEDULE_PAST_MESSAGE };
  if (at.getTime() >= now + SCHEDULE_LIMIT_MS)
    return { kind: "invalid", message: SCHEDULE_TOO_FAR_MESSAGE };
  return { kind: "later", at };
}

export function campaignTiming(
  sendNow: boolean,
  scheduledAt?: Date | null,
): { send_now: boolean; scheduled_at?: string } {
  return scheduledAt
    ? { send_now: false, scheduled_at: scheduledAt.toISOString() }
    : { send_now: sendNow };
}

export function isScheduledCampaign(
  status: string | null | undefined,
  scheduledAt: string | null | undefined,
): boolean {
  return (
    status === "pending" &&
    !!scheduledAt &&
    !Number.isNaN(new Date(scheduledAt).getTime())
  );
}

export const campaignDisplayStatus = (
  status: string,
  scheduledAt: string | null | undefined,
): string => (isScheduledCampaign(status, scheduledAt) ? "scheduled" : status);

export function formatClock(time: string): string {
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!t) return "";
  const h = Number(t[1]);
  return `${h % 12 || 12}:${t[2]} ${h >= 12 ? "PM" : "AM"}`;
}

export function formatScheduleTime(at: Date): string {
  const h = at.getHours();
  const min = String(at.getMinutes()).padStart(2, "0");
  return `${MONTHS_SHORT[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}, ${h % 12 || 12}:${min} ${h >= 12 ? "PM" : "AM"}`;
}
