import type { EventRow } from "../../services/eventsService";
import { dateKeyOf, toKey } from "../date/calendar.ts";

/*
 * The days an event's tickets may be sold for, as "YYYY-MM-DD" — the format the
 * slot lookup (GET /api/events/{id}/available-time-slots/{date}) and a ticket
 * order line's `scheduled_date` take. Kept free of React so it can be tested.
 */

/**
 * One day for a one-time event, every day of the range otherwise — the backend's
 * `Event::getAvailableDates` before day-offs, which the slot lookup applies.
 * Capped at `limit` so a long run still fits the picker.
 */
export function eventSaleDates(
  event: Pick<EventRow, "dateType" | "startDate" | "endDate">,
  limit = 60,
): string[] {
  const start = dateKeyOf(event.startDate);
  if (!start) return [];
  const end =
    event.dateType === "date_range" ? dateKeyOf(event.endDate) || start : start;

  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last && out.length < limit) {
    out.push(toKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
