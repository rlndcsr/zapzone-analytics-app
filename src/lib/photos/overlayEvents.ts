import type {
  PhotoEventDay,
  PhotoOverlay,
  PhotoOverlayCopies,
} from "../../services/photosService";
import { shortVenueName } from "../registrationForms/registrationForms.ts";
import { joinNames } from "./photoRecipients.ts";

// Event-day photo frames on the Overlays screen (web: pages/admin/photos/PhotoOverlays).

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseDay(day: string): Date | null {
  const [y, m, d] = day.split("T")[0].split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** "Fri, Oct 23". */
export function shortDay(day: string): string {
  const date = parseDay(day);
  return date
    ? `${WEEKDAYS_SHORT[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`
    : day;
}

/** "Fri, Oct 23" or "Fri, Oct 23 – Sun, Oct 25". */
export function eventDayRange(first: string | null | undefined, last: string | null | undefined): string {
  const start = first || last;
  const end = last || first;
  if (!start || !end) return "";
  return start === end ? shortDay(start) : `${shortDay(start)} – ${shortDay(end)}`;
}

/** The calendar day after `day` ("2026-10-31" → "2026-11-01"). */
export function dayAfter(day: string): string {
  const date = parseDay(day);
  if (!date) return day;
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const venueName = (name: string | null | undefined): string =>
  (name ? shortVenueName(name) : null) ?? "another location";

/** "Its event day has passed." → "its event day has passed", to sit in brackets. */
const reasonText = (reason: string | null | undefined): string => {
  const text = (reason ?? "").trim().replace(/\.$/, "");
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
};

/** What happened at the event's other locations, for the upload toast. */
export function copiesSummary(copies: PhotoOverlayCopies): string {
  const parts: string[] = [];
  if (copies.created.length > 0) {
    parts.push(`Also added at ${joinNames(copies.created.map((c) => venueName(c.locationName)))}.`);
  }
  if (copies.skipped.length > 0) {
    const skipped = copies.skipped.map((skip) => {
      const why = reasonText(skip.reason);
      return why ? `${venueName(skip.locationName)} (${why})` : venueName(skip.locationName);
    });
    parts.push(`Not added at ${joinNames(skipped)}.`);
  }
  return parts.join(" ");
}

export const eventOptionLabel = (form: PhotoEventDay): string =>
  `${form.name} · ${eventDayRange(form.firstDay, form.eventDate)}${form.hasFrame ? " (has a frame)" : ""}`;

export const isEventFrame = (overlay: PhotoOverlay): boolean =>
  overlay.event != null || overlay.registrationEventId != null;

/** An event frame whose event is over (or whose form was removed) moves to "Past events". */
export function eventFrameIsOver(overlay: PhotoOverlay, now: number): boolean {
  const event = overlay.event;
  if (!event) return false;
  if (event.locationFormRemoved) return true;
  const end = Date.parse(event.effectiveEnd ?? event.windowEnd ?? "");
  if (!Number.isNaN(end)) return end <= now;
  return overlay.status === "expired" && !event.neverRuns;
}

/** The card's hours line; null when an event frame simply follows its event. */
export function scheduleLine(
  overlay: PhotoOverlay,
  formatInstant: (iso: string) => string,
): string | null {
  const event = overlay.event;
  if (!event) {
    return `${overlay.startsAt ? `From ${formatInstant(overlay.startsAt)}` : "No start date"} · ${
      overlay.endsAt ? `until ${formatInstant(overlay.endsAt)}` : "no end date"
    }`;
  }
  if (event.effectiveStart || event.effectiveEnd) {
    return `${event.effectiveStart ? `From ${formatInstant(event.effectiveStart)}` : "No start"} · ${
      event.effectiveEnd ? `until ${formatInstant(event.effectiveEnd)}` : "no end"
    }`;
  }
  if (event.neverRuns && (overlay.startsAt || overlay.endsAt)) {
    return `Its own hours: ${overlay.startsAt ? `from ${formatInstant(overlay.startsAt)}` : "no start"} · ${
      overlay.endsAt ? `until ${formatInstant(overlay.endsAt)}` : "no end"
    }`;
  }
  return null;
}

/** The "Applies to" choice: "" (all photos), "room:<id>" or "event:<id>". */
export function parseAppliesTo(value: string): { roomId: number | null; eventId: number | null } {
  const id = (prefix: string) => {
    if (!value.startsWith(prefix)) return null;
    const n = Number(value.slice(prefix.length));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return { roomId: id("room:"), eventId: id("event:") };
}
