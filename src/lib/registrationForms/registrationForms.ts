import type {
  RegistrationCounts,
  RegistrationEdition,
  RegistrationEventOption,
  RegistrationExportRow,
  RegistrationFormDetail,
  RegistrationFormRow,
  RegistrationFormStatus,
  RegistrationLinkedEvent,
  RegistrationListFilter,
  RegistrationPagination,
} from "../../services/registrationFormsService.ts";
import { formatDateTimeET } from "../date/venueTime.ts";
import { formatPhoneForDisplay } from "../phone.ts";
import { requestErrorMessage } from "../requestError.ts";
import { formatDateLong } from "../waivers/returningCustomers.ts";

export const STATUS_LABELS: Record<RegistrationFormStatus, string> = {
  open: "Open",
  closed: "Closed",
  past: "Date passed",
};

export const MODULE_UNAVAILABLE_MESSAGE =
  "Registration forms are not set up yet.";

export const DELETE_WARNING = (name: string): string =>
  `Delete "${name}"? Its QR code and link will stop working and its registrations will no longer count in other forms' history. To stop new sign-ups but keep everything, close the form instead.`;

export const REGISTRATIONS_PER_PAGE = 25;

export type StaffRequestFailure = {
  message: string;
  unavailable: boolean;
  switchLocationId: number | null;
  /** HTTP status; 0 for a transport failure, null when unknown. */
  status: number | null;
};

export function describeFailure(
  error: unknown,
  fallback: string,
): StaffRequestFailure {
  const body =
    error && typeof error === "object"
      ? ((error as { body?: unknown }).body as
          { code?: unknown; switch_location_id?: unknown } | undefined)
      : undefined;
  const unavailable = body?.code === "MODULE_UNAVAILABLE";
  const switchLocationId =
    typeof body?.switch_location_id === "number"
      ? body.switch_location_id
      : null;
  const status =
    error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
  return {
    message: unavailable
      ? MODULE_UNAVAILABLE_MESSAGE
      : requestErrorMessage(error, fallback),
    unavailable,
    switchLocationId,
    status,
  };
}

/** The error page offers Try again only when retrying could help: no response, or a server failure. */
export const canRetryFailure = (failure: StaffRequestFailure): boolean =>
  failure.switchLocationId === null &&
  (failure.status === null || failure.status === 0 || failure.status >= 500);

/** A 422's first message per field, keyed like the request body. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  const errors =
    error && typeof error === "object"
      ? (error as { fieldErrors?: Record<string, string[] | undefined> })
          .fieldErrors
      : undefined;
  const mapped: Record<string, string> = {};
  if (errors) {
    Object.entries(errors).forEach(([field, messages]) => {
      if (messages?.[0]) mapped[field] = messages[0];
    });
  }
  return mapped;
}

export const fileSlug = (value: string, fallback: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || fallback;

/** Venue records read "City | Brand"; the web shows "City (Brand)". */
export function locationDisplayName(name: string): string {
  const parts = name
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) return `${parts[0]} (${parts.slice(1).join(" · ")})`;
  return parts[0] || name;
}

export const kioskUrl = (publicUrl: string): string => `${publicUrl}?kiosk=1`;

export const previewUrl = (publicUrl: string): string =>
  `${publicUrl}?preview=1`;

export const entryWord = (count: number): string =>
  count === 1 ? "entry" : "entries";

export const formTally = (form: RegistrationFormRow): string =>
  `${form.totalEntries} total ${entryWord(form.totalEntries)} · ${form.uniqueRegistrations} unique`;

export const duplicateHint = (counts: RegistrationCounts): string =>
  `${counts.duplicateGroups} group${counts.duplicateGroups === 1 ? "" : "s"} covering ${counts.entriesInDuplicateGroups} ${entryWord(counts.entriesInDuplicateGroups)}.`;

/** The form's entry total sits beside the page range only when nothing narrows the list. */
export function listSummary(
  pagination: RegistrationPagination,
  totalEntries: number,
  unfiltered: boolean,
): string {
  if (pagination.total === 0) return "No matching contacts";
  const first = (pagination.currentPage - 1) * pagination.perPage + 1;
  const last = Math.min(
    pagination.currentPage * pagination.perPage,
    pagination.total,
  );
  const entries = unfiltered ? ` · ${totalEntries} ${entryWord(totalEntries)}` : "";
  return `Showing ${first}–${last} of ${pagination.total} contact${pagination.total === 1 ? "" : "s"}${entries}`;
}

/** Hidden entries are left out of every count; the Total tile says so. */
export const totalEntriesHint = (counts: RegistrationCounts): string =>
  counts.hiddenEntries > 0
    ? `Every form submitted, including repeats. ${counts.hiddenEntries} hidden ${counts.hiddenEntries === 1 ? "entry is" : "entries are"} not counted.`
    : "Every form submitted, including repeats.";

export const hiddenEntriesLink = (hidden: number): string =>
  `View ${hidden} hidden ${entryWord(hidden)}`;

/** "Halloween Bash (2025)" — the year added unless the name already has it. */
export function editionLabel(edition: RegistrationEdition | null): string {
  if (!edition) return "";
  const year = edition.eventDate.slice(0, 4);
  return edition.name.includes(year) ? edition.name : `${edition.name} (${year})`;
}

export const emptyListMessage = (
  filter: RegistrationListFilter,
  search: string,
): string =>
  filter === "all" && !search
    ? "No one has registered yet."
    : "No registrations match.";

export const historyButtonLabel = (otherEventCount: number): string =>
  otherEventCount > 0
    ? `Registration history (${otherEventCount} other form${otherEventCount === 1 ? "" : "s"})`
    : "Registration history";

/** The "Show" dropdown — last year's option only when a form is linked. */
export function filterOptions(
  previousName: string | null,
  hiddenEntries: number,
): { label: string; value: RegistrationListFilter }[] {
  return [
    { label: "All registrations", value: "all" },
    { label: "Same contact details", value: "duplicates" },
    { label: "Registered before", value: "returning" },
    ...(previousName
      ? [
          {
            label: `Registered for ${previousName}`,
            value: "previous_edition" as const,
          },
        ]
      : []),
    { label: `Hidden (${hiddenEntries})`, value: "hidden" },
  ];
}

export function editionOptions(
  forms: RegistrationFormRow[],
  formId: number | null,
  eventDate: string,
  previousEditionId: number | null,
): RegistrationFormRow[] {
  return forms
    .filter((f) => f.id !== formId)
    .filter(
      (f) =>
        !eventDate || f.eventDate < eventDate || f.id === previousEditionId,
    )
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

/** The web form's own checks before it sends anything. */
export function validateRegistrationForm(input: {
  name: string;
  locationIds: number[];
  eventDate: string;
  editing: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Please give the form a name.";
  if (input.locationIds.length === 0)
    errors[input.editing ? "location_id" : "location_ids"] =
      "Choose at least one location.";
  if (!input.eventDate) errors.event_date = "Choose the event date.";
  return errors;
}

/** A 422 on one of several locations (`location_ids.2`) shows under the list. */
export function foldLocationErrors(
  fields: Record<string, string>,
): Record<string, string> {
  const key = Object.keys(fields).find((k) => k.startsWith("location_ids"));
  return key ? { ...fields, location_ids: fields[key] } : fields;
}

export const MAX_HEADER_IMAGE_BYTES = 8 * 1024 * 1024;
const HEADER_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Why a picked header image can't be used, or null when it can. */
export function headerImageProblem(
  mimeType: string | null | undefined,
  size: number | null | undefined,
): string | null {
  if (!mimeType || !HEADER_IMAGE_TYPES.includes(mimeType)) {
    return "Please choose a PNG, JPEG or WebP image.";
  }
  if (size != null && size > MAX_HEADER_IMAGE_BYTES) {
    return "That image is larger than 8 MB. Please use a smaller file.";
  }
  return null;
}

const yesNo = (value: boolean): string => (value ? "Yes" : "No");

/**
 * The web's Export CSV columns and cells, in order. The last-year column is
 * only there when an edition is linked, named for it (`editionLabel`).
 */
export function registrationExportTable(
  rows: RegistrationExportRow[],
  previousLabel: string,
): {
  headers: string[];
  rows: (string | number)[][];
} {
  return {
    headers: [
      "Entry ID",
      "Registered",
      "Name",
      "Email",
      "Phone",
      "Contact ID",
      "Entries with same contact",
      "Same contact details",
      "Registered before",
      ...(previousLabel ? [`Registered for ${previousLabel}`] : []),
    ],
    rows: rows.map((row) => [
      row.entryId,
      formatDateTimeET(row.registeredAt),
      row.name,
      row.email,
      formatPhoneForDisplay(row.phone) || row.phone,
      row.contactId,
      row.sameContactEntries,
      yesNo(row.isDuplicate),
      yesNo(row.returning),
      ...(previousLabel ? [yesNo(row.registeredPreviousEdition)] : []),
    ]),
  };
}

export const registrationsCsvFilename = (formName: string, today: string) =>
  `${fileSlug(formName, "registrations")}-registrations-${today}.csv`;

/* ------------------------------------------------ linking to Manage Events -- */

/** Another location's event counts as "the same event" within three weeks of it. */
export const MATCH_WINDOW_DAYS = 21;

type DatedEvent = Pick<RegistrationLinkedEvent, "startDate" | "endDate">;

const dayIndex = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
    : Number.NaN;
};

export const eventFirstDay = (event: DatedEvent): string =>
  event.startDate ?? event.endDate ?? "";

export const eventLastDay = (event: DatedEvent): string =>
  event.endDate ?? event.startDate ?? "";

/** "October 31, 2026", or "October 30, 2026 – October 31, 2026" for a range. */
export function formatEventDates(event: DatedEvent): string {
  const first = eventFirstDay(event);
  const last = eventLastDay(event);
  if (!first) return "";
  return last && last !== first
    ? `${formatDateLong(first)} – ${formatDateLong(last)}`
    : formatDateLong(first);
}

const eventNameKey = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

const gapDays = (a: DatedEvent, b: DatedEvent): number => {
  const [aStart, aEnd, bStart, bEnd] = [
    dayIndex(eventFirstDay(a)),
    dayIndex(eventLastDay(a)),
    dayIndex(eventFirstDay(b)),
    dayIndex(eventLastDay(b)),
  ];
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return Number.POSITIVE_INFINITY;
  if (aStart <= bEnd && bStart <= aEnd) return 0;
  return aStart > bEnd ? aStart - bEnd : bStart - aEnd;
};

/**
 * The event `locationId` runs that matches `source`: same name, within three
 * weeks, preferring one still to come, the closest, an active one, then the
 * nearest start. The source's own location gets the source itself.
 */
export function matchingEventAt(
  source: RegistrationEventOption,
  locationId: number,
  options: RegistrationEventOption[],
  today = "",
): RegistrationEventOption | null {
  if (source.locationId === locationId) return source;
  const key = eventNameKey(source.name);
  const sourceStart = dayIndex(eventFirstDay(source));
  const preferUpcoming = today !== "" && eventLastDay(source) >= today;
  const finished = (option: RegistrationEventOption): number =>
    preferUpcoming && eventLastDay(option) < today ? 1 : 0;
  const ranked = options
    .filter(
      (option) =>
        option.locationId === locationId &&
        option.id !== source.id &&
        eventNameKey(option.name) === key,
    )
    .map((option) => ({
      option,
      gap: gapDays(source, option),
      shift: Math.abs(dayIndex(eventFirstDay(option)) - sourceStart),
    }))
    .filter((candidate) => candidate.gap <= MATCH_WINDOW_DAYS)
    .sort(
      (a, b) =>
        finished(a.option) - finished(b.option) ||
        a.gap - b.gap ||
        Number(b.option.isActive) - Number(a.option.isActive) ||
        a.shift - b.shift ||
        a.option.id - b.option.id,
    );
  return ranked[0]?.option ?? null;
}

/**
 * Locations ticked when a company admin starts from `source`: its own, plus
 * each other listed location running the same event that's active, still to
 * come and doesn't have a form yet.
 */
export function venuesForSource(
  source: RegistrationEventOption,
  listedLocationIds: number[],
  options: RegistrationEventOption[],
  today: string,
): number[] {
  const venues: number[] = listedLocationIds.includes(source.locationId)
    ? [source.locationId]
    : [];
  listedLocationIds.forEach((id) => {
    if (id === source.locationId) return;
    const match = matchingEventAt(source, id, options, today);
    if (
      match &&
      match.isActive &&
      match.registrationFormIds.length === 0 &&
      eventLastDay(match) >= today
    ) {
      venues.push(id);
    }
  });
  return venues;
}

/** Events offered under "Start from an event": upcoming ones (plus the pick), soonest first. */
export function sourceChoices(
  options: RegistrationEventOption[],
  allowedLocationIds: Set<number>,
  selectedId: number | null,
  today: string,
): RegistrationEventOption[] {
  return options
    .filter((option) => allowedLocationIds.has(option.locationId))
    .filter((option) => option.id === selectedId || eventLastDay(option) >= today)
    .sort(
      (a, b) =>
        eventFirstDay(a).localeCompare(eventFirstDay(b)) ||
        a.name.localeCompare(b.name) ||
        a.id - b.id,
    );
}

export type SourceFill = { name: string; description: string; date: string };

/**
 * What picking `source` fills in: a field is replaced only while it is empty
 * or still holds what the previous pick put there, so typed text survives.
 */
export function applySourceFill(
  current: SourceFill,
  filled: Partial<SourceFill>,
  source: RegistrationEventOption,
): { values: SourceFill; filled: SourceFill } {
  const next: SourceFill = {
    name: source.name.trim(),
    description: source.description ?? "",
    date: eventLastDay(source),
  };
  const replaceable = (value: string, previous: string | undefined) =>
    !value.trim() || value === previous;
  return {
    values: {
      name: replaceable(current.name, filled.name) ? next.name : current.name,
      description: replaceable(current.description, filled.description)
        ? next.description
        : current.description,
      date: replaceable(current.date, filled.date) ? next.date : current.date,
    },
    filled: next,
  };
}

/** "Halloween 2025" → "Halloween 2026": every 19xx/20xx year moved on. */
export const yearShift = (value: string, years: number): string =>
  value.replace(/\b(19|20)\d{2}\b/g, (year) => String(Number(year) + years));

/** The same day next year; 29 February becomes the 28th. */
export function nextYearDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const day = match[2] === "02" && match[3] === "29" ? "28" : match[3];
  return `${Number(match[1]) + 1}-${match[2]}-${day}`;
}

export type RegistrationFormPrefill = {
  name: string;
  locationIds: number[];
  eventDate: string;
  description: string;
  confirmationMessage: string;
  previousEditionId: number;
  copyHeaderImageFrom: number | null;
  headerImagePath: string | null;
};

/** "Next year's edition": the form copied a year forward, linked back to it, at its location. */
export function nextEditionPrefill(form: RegistrationFormDetail): RegistrationFormPrefill {
  const shifted = yearShift(form.name, 1);
  return {
    name:
      shifted !== form.name
        ? shifted
        : `${form.name} ${Number(form.eventDate.slice(0, 4)) + 1}`,
    locationIds: [form.locationId],
    eventDate: nextYearDate(form.eventDate),
    description: form.description ?? "",
    confirmationMessage: form.confirmationMessage ?? "",
    previousEditionId: form.id,
    copyHeaderImageFrom: form.headerImagePath ? form.id : null,
    headerImagePath: form.headerImagePath,
  };
}

/** The QR sign's date: the linked event's span when the form closes on its last day. */
export function signDateLine(form: RegistrationFormRow): string {
  const event = form.event;
  return event?.startDate &&
    event.endDate &&
    event.startDate < form.eventDate &&
    form.eventDate <= event.endDate
    ? `${formatDateLong(event.startDate)} – ${formatDateLong(form.eventDate)}`
    : formatDateLong(form.eventDate);
}

export type FromEventOutcome =
  | { kind: "missing" }
  | { kind: "open"; formId: number }
  | { kind: "list" }
  | { kind: "create" };

/** Manage Events' Registration form button: one form opens, several list, none creates. */
export function fromEventOutcome(
  option: RegistrationEventOption | undefined,
): FromEventOutcome {
  if (!option) return { kind: "missing" };
  const linked = option.registrationFormIds;
  if (linked.length === 1) return { kind: "open", formId: linked[0] };
  return linked.length > 1 ? { kind: "list" } : { kind: "create" };
}

export const EVENT_NOT_FOUND =
  "That event couldn't be found. It may have been deleted.";

/** An in-app path to reopen after a location switch, or null for anything else. */
export const safeReturnPath = (value: string | null | undefined): string | null =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : null;

// Set by the detail and editor screens so the list refetches when it regains focus.
let stale = false;
let notice: string | null = null;

/** `message` is shown once by the list, e.g. after a delete that left the detail screen. */
export function markRegistrationFormsStale(message?: string): void {
  stale = true;
  if (message) notice = message;
}

export function consumeRegistrationFormsStale(): boolean {
  const was = stale;
  stale = false;
  return was;
}

export function takeRegistrationFormsNotice(): string | null {
  const message = notice;
  notice = null;
  return message;
}
