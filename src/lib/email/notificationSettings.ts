/**
 * The Notification Settings card of Create / Edit Email Notification (web
 * parity: CreateEmailNotification.tsx / EditEmailNotification.tsx) — the
 * "Send N hours …" timing and what a default email locks. Imports nothing, so
 * `node --test` can load it.
 */

/** Reminders send before the event, follow-ups after it; others send at once. */
export type TriggerTiming = "before" | "after" | null;

export const triggerTiming = (trigger: string): TriggerTiming =>
  trigger.endsWith("_reminder") ? "before" : trigger.endsWith("_followup") ? "after" : null;

/** The words after the hours box (`isVisitEmail`: the trigger is a visit email). */
export const hoursSuffix = (trigger: string, isVisitEmail: boolean): string =>
  isVisitEmail
    ? "hours after staff mark the visit complete"
    : `hours ${triggerTiming(trigger) === "before" ? "before" : "after"} the event`;

/** The web reads the box with parseInt; anything unreadable is "not set". */
export const parseHours = (text: string): number | null => {
  const n = parseInt(text, 10);
  return Number.isNaN(n) ? null : n;
};

/** The save is stopped, with the web's words, when the timing needs hours and has none. */
export function hoursError(trigger: string, text: string): string | null {
  const timing = triggerTiming(trigger);
  if (timing === null || parseHours(text)) return null;
  return timing === "before"
    ? "Please specify hours before event for reminder"
    : "Please specify hours after event for follow-up";
}

/** The two timing columns a save sends; the one the trigger doesn't use is cleared. */
export function hoursPayload(
  trigger: string,
  text: string,
): { send_before_hours: number | null; send_after_hours: number | null } {
  const timing = triggerTiming(trigger);
  const hours = parseHours(text);
  return {
    send_before_hours: timing === "before" ? hours : null,
    send_after_hours: timing === "after" ? hours : null,
  };
}

/** Header line under "Edit Email Notification". */
export const editSubtitle = (isDefault: boolean, defaultKey: string | null): string =>
  isDefault
    ? `Default template${defaultKey ? ` · ${defaultKey}` : ""} — name & trigger are locked.`
    : "Update automated email notification settings";

export const DEFAULT_NAME_HINT = "Default template name is fixed.";

/** Under a default email's locked Location. */
export const defaultLocationHint = (isVisitEmail: boolean): string =>
  isVisitEmail
    ? "Default emails cover every location. Duplicate this one to make a version for a single location."
    : "Default emails cover every location. To email one location differently, create a new notification for it.";

/** The Location picker's options: "All Locations" (saved as null), then each venue. */
export const locationOptions = (
  locations: { id: number; name: string }[],
): { label: string; value: string | number }[] => [
  { label: "All Locations", value: "" },
  ...locations.map((l) => ({ label: l.name, value: l.id })),
];

/** A picked option back to the saved location: "" is All Locations (null). */
export const pickedLocation = (value: string | number): number | null =>
  value === "" ? null : Number(value);
