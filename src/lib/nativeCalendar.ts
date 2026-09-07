import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import {
  REMINDER_MINUTES_BEFORE,
  type CalendarEventDraft,
} from "./calendarEvent";

export type AddToCalendarResult =
  | { ok: true }
  | {
      ok: false;
      reason: "permission-denied" | "no-calendar" | "error";
      message?: string;
    };

async function ensureCalendarPermission(): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return true;
  const requested = await Calendar.requestCalendarPermissionsAsync();
  return requested.granted;
}

async function resolveWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === "ios") {
    try {
      const defaultCalendar = await Calendar.getDefaultCalendarAsync();
      if (defaultCalendar?.id) return defaultCalendar.id;
    } catch {}
  }
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const writable = calendars.filter((c) => c.allowsModifications);
  if (writable.length === 0) return null;
  return (writable.find((c) => c.isPrimary) ?? writable[0]).id;
}

export async function addEventToCalendar(
  draft: CalendarEventDraft,
): Promise<AddToCalendarResult> {
  try {
    const granted = await ensureCalendarPermission();
    if (!granted) return { ok: false, reason: "permission-denied" };

    const calendarId = await resolveWritableCalendarId();
    if (!calendarId) return { ok: false, reason: "no-calendar" };

    await Calendar.createEventAsync(calendarId, {
      title: draft.title,
      startDate: draft.startDate,
      endDate: draft.endDate,
      location: draft.location,
      notes: draft.notes,
      alarms: [{ relativeOffset: -REMINDER_MINUTES_BEFORE }],
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : undefined,
    };
  }
}
