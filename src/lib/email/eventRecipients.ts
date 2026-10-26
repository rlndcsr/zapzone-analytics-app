/**
 * The Create Campaign event picker's rules (web: EventRecipientPicker): location
 * forms of one event are picked together or one location at a time, and a
 * campaign covers at most 100 forms.
 */
import type {
  RegistrationFormRow,
  RegistrationFormStatus,
} from "../../services/registrationFormsService";
import { locationDisplayName } from "../registrationForms/registrationForms.ts";

/** The server's cap on `registration_event_ids`. */
export const MAX_EVENT_FORMS = 100;

export const MAX_EVENT_FORMS_MESSAGE = `One campaign can cover up to ${MAX_EVENT_FORMS} registration forms. Narrow the list or send a second campaign.`;

export type PickerForm = Pick<
  RegistrationFormRow,
  "id" | "name" | "eventDate" | "status" | "locationId" | "locationName" | "group" | "uniqueRegistrations"
>;

/** One event: a grouped event's location forms, or a single ungrouped form. */
export type PickerEvent = {
  key: string;
  name: string;
  eventDate: string;
  status: RegistrationFormStatus;
  forms: PickerForm[];
};

export const formLocation = (form: Pick<PickerForm, "locationName" | "locationId">): string =>
  form.locationName ? locationDisplayName(form.locationName) : `Location ${form.locationId}`;

export const peopleLabel = (count: number): string => `${count} ${count === 1 ? "person" : "people"}`;

/** Open while any location is open; "Date passed" once every location has. */
const eventStatus = (forms: PickerForm[]): RegistrationFormStatus => {
  if (forms.some((form) => form.status === "open")) return "open";
  return forms.every((form) => form.status === "past") ? "past" : "closed";
};

/** Newest event first, then by name; each event's locations alphabetically. */
export function groupPickerEvents(forms: PickerForm[]): PickerEvent[] {
  const events = new Map<string, PickerEvent>();

  forms.forEach((form) => {
    const key = form.group ? `group-${form.group.id}` : `form-${form.id}`;
    const existing = events.get(key);
    if (existing) {
      existing.forms.push(form);
      return;
    }
    events.set(key, {
      key,
      name: form.group?.name || form.name,
      eventDate: form.group?.eventDate || form.eventDate,
      status: form.status,
      forms: [form],
    });
  });

  return [...events.values()]
    .map((event) => ({
      ...event,
      status: eventStatus(event.forms),
      forms: [...event.forms].sort((a, b) => formLocation(a).localeCompare(formLocation(b))),
    }))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.name.localeCompare(b.name));
}

/** The forms a search and location filter leave showing, still grouped by event. */
export function visiblePickerEvents(
  forms: PickerForm[],
  search: string,
  locationId: number | null,
): PickerEvent[] {
  const term = search.trim().toLowerCase();
  return groupPickerEvents(
    forms.filter((form) => {
      if (locationId !== null && form.locationId !== locationId) return false;
      if (!term) return true;
      return `${form.group?.name ?? ""} ${form.name} ${formLocation(form)}`.toLowerCase().includes(term);
    }),
  );
}

/** Each location the forms are at, by name, for the location filter. */
export function pickerLocations(forms: PickerForm[]): { id: number; name: string }[] {
  const names = new Map<number, string>();
  forms.forEach((form) => names.set(form.locationId, formLocation(form)));
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Adds or removes forms; null when the result would pass the cap. */
export function toggleForms(selected: number[], ids: number[], on: boolean): number[] | null {
  const chosen = new Set(selected);
  const next = on
    ? [...selected, ...ids.filter((id) => !chosen.has(id))]
    : selected.filter((id) => !ids.includes(id));
  return next.length > MAX_EVENT_FORMS ? null : next;
}

/** "No events picked yet", "2 events picked" or, across locations, "2 events picked · 3 location forms". */
export function pickerSummary(forms: PickerForm[], selected: number[], multiLocation: boolean): string {
  if (selected.length === 0) return "No events picked yet";
  const chosen = new Set(selected);
  const picked = groupPickerEvents(forms).filter((event) => event.forms.some((form) => chosen.has(form.id))).length;
  const events = `${picked} event${picked === 1 ? "" : "s"} picked`;
  return multiLocation
    ? `${events} · ${selected.length} location form${selected.length === 1 ? "" : "s"}`
    : events;
}
