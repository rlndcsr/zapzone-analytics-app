import type {
  EventDateType,
  EventRow,
  UpdateEventInput,
} from "../../services/eventsService";
import { scheduleWindowMinutes } from "../time.ts";

/*
 * The Edit Event form (web parity: pages/admin/events/EditEvent.tsx) — how a
 * stored event fills the form, what the form checks before saving, and the PUT
 * payload it sends. Kept free of React so the rules can be unit-tested.
 */

/** What happens to the stored picture on save. */
export type EventImageEdit =
  | { kind: "keep" }
  | { kind: "new"; dataUrl: string }
  | { kind: "remove" };

export type EventEditForm = {
  locationId: number | null;
  name: string;
  description: string;
  dateType: EventDateType;
  /** YYYY-MM-DD, or "" when unset. */
  startDate: string;
  endDate: string;
  /** No schedule — guests call to book; the times are then not sent. */
  noSetTimes: boolean;
  /** HH:mm */
  timeStart: string;
  timeEnd: string;
  intervalMinutes: number;
  /** Raw box text; blank means unlimited. */
  maxBookingsPerSlot: string;
  maxTicketsPerSlot: string;
  price: string;
  features: string[];
  /** Selected add-ons, in display order. */
  addOnIds: number[];
  isActive: boolean;
  image: EventImageEdit;
};

/** The API's floor for a time slot (`interval_minutes` min:5). */
export const MIN_INTERVAL_MINUTES = 5;

const DEFAULT_TIME_START = "09:00";
const DEFAULT_TIME_END = "17:00";

const hhmm = (value: string | null | undefined): string =>
  value ? value.substring(0, 5) : "";

/** A stored event as the form's starting values, the way the web fills it. */
export function eventToEditForm(event: EventRow): EventEditForm {
  const timeStart = hhmm(event.timeStart);
  const timeEnd = hhmm(event.timeEnd);
  return {
    locationId: event.locationId,
    name: event.name,
    description: event.description,
    dateType: event.dateType,
    startDate: event.startDate ? event.startDate.substring(0, 10) : "",
    endDate: event.endDate ? event.endDate.substring(0, 10) : "",
    noSetTimes: !timeStart || !timeEnd,
    timeStart: timeStart || DEFAULT_TIME_START,
    timeEnd: timeEnd || DEFAULT_TIME_END,
    intervalMinutes: event.intervalMinutes || 60,
    maxBookingsPerSlot:
      event.maxBookingsPerSlot != null ? String(event.maxBookingsPerSlot) : "",
    maxTicketsPerSlot:
      event.maxTicketsPerSlot != null ? String(event.maxTicketsPerSlot) : "",
    price: event.price.toFixed(2),
    features: [...event.features],
    // The saved order wins; without one, the attached add-ons as they come.
    addOnIds:
      event.addOnsOrder.length > 0
        ? [...event.addOnsOrder]
        : event.addOns.map((a) => a.id),
    isActive: event.status === "active",
    image: { kind: "keep" },
  };
}

/**
 * Why the form cannot be saved as it stands, or null. The web's checks, in its
 * order, plus the ones its date inputs enforce with `required` / `min`.
 */
export function validateEventEdit(form: EventEditForm): string | null {
  if (!form.name.trim()) return "Event name is required";
  if (!form.startDate) return "Start date is required";
  if (form.dateType === "date_range") {
    if (!form.endDate) return "End date is required for a date range";
    if (form.endDate < form.startDate)
      return "End date cannot be before the start date";
  }
  if (!form.noSetTimes) {
    if (form.timeStart === form.timeEnd)
      return "Start and end time cannot be the same";
    const window = scheduleWindowMinutes(form.timeStart, form.timeEnd);
    if (window !== null && form.intervalMinutes > window)
      return `Interval (${form.intervalMinutes} min) is longer than the event's time window (${window} min), so no start times could be generated`;
  }
  return null;
}

/** "150" → 150; blank or not a number → null (unlimited), as the web sends. */
const optionalInt = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
};

/** The PUT /api/events/{id} body for the form (web parity: handleSubmit). */
export function buildEventUpdate(form: EventEditForm): UpdateEventInput {
  const payload: UpdateEventInput = {
    ...(form.locationId != null ? { location_id: form.locationId } : {}),
    name: form.name.trim(),
    description: form.description.trim() || null,
    date_type: form.dateType,
    start_date: form.startDate,
    ...(form.dateType === "date_range" ? { end_date: form.endDate } : {}),
    time_start: form.noSetTimes ? null : form.timeStart,
    time_end: form.noSetTimes ? null : form.timeEnd,
    interval_minutes: form.noSetTimes ? null : form.intervalMinutes,
    max_bookings_per_slot: optionalInt(form.maxBookingsPerSlot),
    max_tickets_per_slot: optionalInt(form.maxTicketsPerSlot),
    price: parseFloat(form.price) || 0,
    features: form.features.map((f) => f.trim()).filter(Boolean),
    add_on_ids: [...form.addOnIds],
    add_ons_order: [...form.addOnIds],
    is_active: form.isActive,
  };
  if (form.image.kind === "new") payload.image = form.image.dataUrl;
  else if (form.image.kind === "remove") payload.image = null;
  return payload;
}

/** Move one entry up (-1) or down (+1); out-of-range moves are a no-op. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length)
    return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
