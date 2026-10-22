import type {
  RegistrationCounts,
  RegistrationEdition,
  RegistrationEventGroupDetail,
  RegistrationEventGroupInput,
  RegistrationEventGroupSummary,
  RegistrationEventOption,
  RegistrationExportRow,
  RegistrationFormDetail,
  RegistrationFormRow,
  RegistrationFormStatus,
  RegistrationGroupExportRow,
  RegistrationLinkedEvent,
  RegistrationListFilter,
  RegistrationMergeCandidate,
  RegistrationOptionGroup,
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

/** Removing a form: one among others leaves the event; the last (or an ungrouped) one deletes it. */
export function formRemoval(form: RegistrationFormDetail): {
  label: string;
  message: string;
  failure: string;
  leavesEvent: boolean;
} {
  const grouped = form.group !== null;
  const lastForm = grouped && form.groupFormCount <= 1;
  const eventName = form.group?.name ?? form.name;
  const venue = form.locationName ? locationDisplayName(form.locationName) : null;
  const leavesEvent = grouped && !lastForm;
  return {
    label: leavesEvent ? "Remove location" : lastForm ? "Delete event" : "Delete form",
    message: leavesEvent
      ? `Remove ${venue ?? "this location"} from "${eventName}"? Its QR code and link stop working and its registrations no longer count in other forms' history.`
      : `Delete "${eventName}"? Its form, QR code and registration list will be removed.`,
    failure: leavesEvent ? "The location could not be removed." : "The event could not be deleted.",
    leavesEvent,
  };
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export const groupDeleteWarning = (group: RegistrationEventGroupDetail): string => {
  const count = group.locationFormsTotal;
  return `Delete "${group.name}"? Its ${plural(count, "location form")}, QR code${count === 1 ? "" : "s"} and registration list${count === 1 ? "" : "s"} will be removed.`;
};

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

/** "Brighton (Zap Zone)" → "Brighton", for breadcrumbs and per-location copy. */
export const shortVenueName = (name: string | null): string | null =>
  name ? locationDisplayName(name).replace(/\s*\(.*\)\s*$/, "") : null;

export const kioskUrl = (publicUrl: string): string => `${publicUrl}?kiosk=1`;

export const previewUrl = (publicUrl: string): string =>
  `${publicUrl}?preview=1`;

export const entryWord = (count: number): string =>
  count === 1 ? "entry" : "entries";

export const duplicateHint = (counts: RegistrationCounts): string =>
  `${plural(counts.duplicateGroups, "contact")} with multiple entries.`;

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

/** A location form's own checks; a form in an event takes its name from the event. */
export function validateRegistrationForm(input: {
  name: string;
  eventDate: string;
  grouped: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.grouped && !input.name.trim()) errors.name = "Please give the form a name.";
  if (!input.eventDate) errors.event_date = "Choose the event date.";
  return errors;
}

export type RegistrationEventMode = "create" | "edit" | "add";

/** The event editor's checks before it sends anything. */
export function validateRegistrationEvent(input: {
  mode: RegistrationEventMode;
  name: string;
  locationIds: number[];
  addedCount: number;
  eventDate: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const adding = input.mode === "add";
  if (!adding && !input.name.trim()) errors.name = "Please give the event a name.";
  if (input.locationIds.length === 0) errors.location_ids = "Choose at least one location.";
  if (adding && input.addedCount === 0) errors.location_ids = "Tick the locations to add.";
  if (!adding && !input.eventDate) errors.event_date = "Choose the event date.";
  return errors;
}

/** The year picker: every year with events, plus this year and the one shown, newest first. */
export const yearChoices = (years: number[], thisYear: number, year: number): number[] =>
  Array.from(new Set([...years, thisYear, year])).sort((a, b) => b - a);

/** One location's name for a single-location event, otherwise a count. */
export function venueSummary(names: string[], count: number): string {
  if (count === 1 && names.length === 1) return locationDisplayName(names[0]);
  return plural(count, "location form");
}

/** Whether the event page shows every location in the event or only the user's. */
export function groupScope(group: RegistrationEventGroupDetail): {
  allLocations: boolean;
  soleVenue: string | null;
  label: string;
} {
  const allLocations = group.forms.length === group.locationFormsTotal;
  const only = group.forms.length === 1 ? group.forms[0].locationName : null;
  const soleVenue = only ? locationDisplayName(only) : null;
  return {
    allLocations,
    soleVenue,
    label: allLocations
      ? "All participating locations"
      : soleVenue
        ? `${soleVenue} only`
        : `${group.forms.length} of your locations`,
  };
}

/** "Last year's event" choices: earlier events (plus the current pick), latest first. */
export function previousGroupChoices(
  options: RegistrationEventGroupSummary[],
  groupId: number | null,
  eventDate: string,
  previousGroupId: number | null,
): RegistrationEventGroupSummary[] {
  const unique = new Map<number, RegistrationEventGroupSummary>();
  options.forEach((option) => unique.set(option.id, option));
  return Array.from(unique.values())
    .filter((option) => option.id !== groupId)
    .filter((option) => !eventDate || option.eventDate < eventDate || option.id === previousGroupId)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
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

export const registrationsCsvFilename = (
  formName: string,
  locationName: string | null,
  today: string,
) => {
  const venue = locationName ? `${fileSlug(locationName, "location")}-` : "";
  return `${fileSlug(formName, "registrations")}-${venue}registrations-${today}.csv`;
};

/** The web's event CSV: the form columns led by each entry's location. */
export function groupExportTable(
  rows: RegistrationGroupExportRow[],
  hasPreviousGroup: boolean,
): { headers: string[]; rows: (string | number)[][] } {
  const formTable = registrationExportTable(rows, "");
  return {
    headers: [
      "Location",
      ...formTable.headers,
      ...(hasPreviousGroup ? ["Registered for last year's event"] : []),
    ],
    rows: rows.map((row, index) => [
      row.locationName ? locationDisplayName(row.locationName) : "",
      ...formTable.rows[index],
      ...(hasPreviousGroup ? [yesNo(row.registeredPreviousEdition)] : []),
    ]),
  };
}

export const groupCsvFilename = (eventName: string, today: string) =>
  `${fileSlug(eventName, "event")}-registrations-${today}.csv`;

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

export type RegistrationEventPrefill = {
  name: string;
  eventDate: string;
  description: string;
  confirmationMessage: string;
  locationIds: number[];
  previousGroupId: number;
  previousGroupName: string;
  copyHeaderFromGroup: number | null;
  headerImagePath: string | null;
};

/** "Next year's event": copied a year forward at the same locations and linked back to this one. */
export function nextEventPrefill(group: RegistrationEventGroupDetail): RegistrationEventPrefill {
  const shifted = yearShift(group.name, 1);
  return {
    name:
      shifted !== group.name
        ? shifted
        : `${group.name} ${Number(group.eventDate.slice(0, 4)) + 1}`,
    eventDate: nextYearDate(group.eventDate),
    description: group.description ?? "",
    confirmationMessage: group.confirmationMessage ?? "",
    locationIds: group.forms.map((form) => form.locationId),
    previousGroupId: group.id,
    previousGroupName: group.name,
    copyHeaderFromGroup: group.headerImagePath ? group.id : null,
    headerImagePath: group.headerImagePath,
  };
}

/** Every form's open flag: all open, or a mix the editor shows as undecided. */
export function groupOpenState(group: RegistrationEventGroupDetail): {
  allOpen: boolean;
  mixedOpen: boolean;
} {
  const states = group.forms.map((form) => form.isOpen);
  return {
    allOpen: states.length > 0 && states.every(Boolean),
    mixedOpen: states.some(Boolean) && states.some((open) => !open),
  };
}

/** The server lists the best merge candidate first; one per location. */
export function candidatesByLocation(
  candidates: RegistrationMergeCandidate[],
): Map<number, RegistrationMergeCandidate> {
  const byLocation = new Map<number, RegistrationMergeCandidate>();
  candidates.forEach((candidate) => {
    if (!byLocation.has(candidate.locationId)) byLocation.set(candidate.locationId, candidate);
  });
  return byLocation;
}

export type RegistrationLocationChange = {
  /** The full set of locations wanted. */
  locationIds: number[];
  /** Each new location's own Manage Events event. */
  eventLinks: Record<number, number>;
  /** Existing forms moved in instead of new ones. */
  moveFormIds: number[];
};

/** Adding or removing locations: the whole set, checked against what the screen showed. */
export function groupAddInput(
  group: RegistrationEventGroupDetail,
  change: RegistrationLocationChange,
): RegistrationEventGroupInput {
  return {
    locationIds: change.locationIds,
    expectedLocationIds: group.forms.map((form) => form.locationId),
    eventLinks: change.eventLinks,
    ...(change.moveFormIds.length > 0 ? { moveFormIds: change.moveFormIds } : {}),
  };
}

export type RegistrationEventDraft = RegistrationLocationChange & {
  name: string;
  eventDate: string;
  description: string;
  confirmationMessage: string;
  previousGroupId: number | null;
  isOpen: boolean;
  /** Open/closed is only sent once staff touch it, so a mix of states survives a save. */
  openTouched: boolean;
};

/** Edit event: only what changed, so a stale screen can't undo someone else's edit. */
export function groupEditInput(
  group: RegistrationEventGroupDetail,
  draft: RegistrationEventDraft,
): RegistrationEventGroupInput {
  const input: RegistrationEventGroupInput = {};
  const name = draft.name.trim();
  if (name !== group.name) input.name = name;
  if (draft.eventDate !== group.eventDate) input.eventDate = draft.eventDate;
  if (draft.description !== (group.description ?? "")) input.description = draft.description;
  if (draft.confirmationMessage !== (group.confirmationMessage ?? ""))
    input.confirmationMessage = draft.confirmationMessage;
  if (draft.previousGroupId !== (group.previousGroup?.id ?? null))
    input.previousGroupId = draft.previousGroupId;
  const existing = group.forms.map((form) => form.locationId);
  const changedVenues =
    draft.locationIds.some((id) => !existing.includes(id)) ||
    existing.some((id) => !draft.locationIds.includes(id));
  if (changedVenues) Object.assign(input, groupAddInput(group, draft));
  const { allOpen, mixedOpen } = groupOpenState(group);
  if (draft.openTouched && (mixedOpen || draft.isOpen !== allOpen)) input.isOpen = draft.isOpen;
  return input;
}

/** What the amber note says happens to a moved form's old event. */
export function moveSourceLine(
  candidate: RegistrationMergeCandidate,
  move: boolean,
  movingFromSameGroup: number,
  place: string,
): string | null {
  if (!candidate.groupName) return null;
  const source = `“${candidate.groupName}”${candidate.groupEventDate ? ` (${formatDateLong(candidate.groupEventDate)})` : ""}`;
  if (!move) return `${place} will then have two forms: the existing one stays in the other event ${source}.`;
  const staying = candidate.groupLocationForms - movingFromSameGroup;
  return staying <= 0
    ? `Its other event ${source} will be merged into this one.`
    : `It's part of the other event ${source}; ${staying} of its ${candidate.groupLocationForms} location forms will stay there.`;
}

/** The existing event to offer joining: one that won't split another, then the widest reach, then the biggest. */
export function existingGroupFor(
  source: RegistrationEventOption,
  listedIds: number[],
  options: RegistrationEventOption[],
  today: string,
  tickedIds: number[],
): RegistrationOptionGroup | null {
  const related = [
    source,
    ...listedIds
      .filter((id) => id !== source.locationId)
      .map((id) => matchingEventAt(source, id, options, today)),
  ];
  const found = new Map<number, RegistrationOptionGroup>();
  related.forEach((option) =>
    option?.registrationGroups.forEach((candidate) => {
      if (!found.has(candidate.id)) found.set(candidate.id, candidate);
    }),
  );
  if (found.size === 0) return null;
  const ticked = new Set(tickedIds);
  const groups = Array.from(found.values());
  const reach = (candidate: RegistrationOptionGroup) =>
    candidate.forms.filter((form) => !ticked.has(form.locationId)).length;
  const splitsOther = (candidate: RegistrationOptionGroup) =>
    groups.some(
      (other) =>
        other.id !== candidate.id &&
        other.forms.some(
          (form) =>
            ticked.has(form.locationId) &&
            form.eventId === null &&
            !candidate.forms.some((own) => own.locationId === form.locationId),
        ) &&
        other.forms.some((form) => !ticked.has(form.locationId) || form.eventId !== null),
    );
  const safe = new Set(groups.filter((candidate) => !splitsOther(candidate)).map((c) => c.id));
  return [...groups].sort(
    (a, b) =>
      Number(safe.has(b.id)) - Number(safe.has(a.id)) ||
      reach(b) - reach(a) ||
      b.forms.length - a.forms.length,
  )[0];
}

/** Ticked locations against an existing event: which can join, which have an unlinked form there, which are in. */
export function groupSuggestion(
  group: RegistrationOptionGroup,
  tickedIds: number[],
  linkFor: (locationId: number) => RegistrationEventOption | null,
): {
  joinVenues: number[];
  unlinked: { locationId: number; formId: number; eventId: number; formDate: string }[];
  already: { locationId: number; formId: number }[];
} {
  const formAt = (id: number) => group.forms.find((form) => form.locationId === id) ?? null;
  const joinVenues = tickedIds.filter((id) => {
    if (formAt(id)) return false;
    const link = linkFor(id);
    return !link || link.registrationFormIds.length === 0;
  });
  const unlinked = tickedIds.flatMap((id) => {
    const form = formAt(id);
    const link = linkFor(id);
    return form && form.eventId === null && link && link.registrationFormIds.length === 0
      ? [{ locationId: id, formId: form.id, eventId: link.id, formDate: form.eventDate }]
      : [];
  });
  const already = tickedIds.flatMap((id) => {
    const form = formAt(id);
    if (!form || unlinked.some((item) => item.locationId === id)) return [];
    const link = linkFor(id);
    return link && link.registrationFormIds.length > 0 ? [] : [{ locationId: id, formId: form.id }];
  });
  return { joinVenues, unlinked, already };
}

/** Joining an existing event: the locations not in it yet, or who's already there. */
export function pendingAddLocations(
  group: RegistrationEventGroupDetail,
  locationIds: number[],
): { fresh: number[]; alreadyMessage: string | null } {
  const inEvent = new Set(group.forms.map((form) => form.locationId));
  const fresh = locationIds.filter((id) => !inEvent.has(id));
  if (fresh.length > 0) return { fresh, alreadyMessage: null };
  const names = group.forms
    .filter((form) => locationIds.includes(form.locationId))
    .map((form) => (form.locationName ? locationDisplayName(form.locationName) : "That location"));
  return {
    fresh,
    alreadyMessage: `${names.join(", ") || "That location"} ${names.length > 1 ? "are" : "is"} already in this event.`,
  };
}

/** `1:5,2:7` ⇄ { 1: 5, 2: 7 } — event links carried in a route param. */
export const encodeEventLinks = (links: Record<number, number>): string =>
  Object.entries(links)
    .map(([locationId, eventId]) => `${locationId}:${eventId}`)
    .join(",");

export function decodeEventLinks(value: string | undefined): Record<number, number> {
  const links: Record<number, number> = {};
  (value ?? "").split(",").forEach((pair) => {
    const [locationId, eventId] = pair.split(":").map(Number);
    if (locationId > 0 && eventId > 0) links[locationId] = eventId;
  });
  return links;
}

export const decodeIds = (value: string | undefined): number[] =>
  (value ?? "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

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
  | { kind: "create" };

/** Manage Events' Registration form button (web d5a759e): the newest linked form opens, else a new event starts. */
export function fromEventOutcome(
  option: RegistrationEventOption | undefined,
): FromEventOutcome {
  if (!option) return { kind: "missing" };
  const linked = option.registrationFormIds;
  return linked.length > 0
    ? { kind: "open", formId: linked[linked.length - 1] }
    : { kind: "create" };
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
