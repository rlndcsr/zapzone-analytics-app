import type {
  RegistrationCounts,
  RegistrationExportRow,
  RegistrationFormRow,
  RegistrationFormStatus,
  RegistrationListFilter,
  RegistrationPagination,
} from "../../services/registrationFormsService.ts";
import { formatDateTimeET } from "../date/venueTime.ts";
import { formatPhoneForDisplay } from "../phone.ts";
import { requestErrorMessage } from "../requestError.ts";

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
  return {
    message: unavailable
      ? MODULE_UNAVAILABLE_MESSAGE
      : requestErrorMessage(error, fallback),
    unavailable,
    switchLocationId,
  };
}

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

export function listSummary(
  pagination: RegistrationPagination,
  totalEntries: number,
): string {
  if (pagination.total === 0) return "No matching contacts";
  const first = (pagination.currentPage - 1) * pagination.perPage + 1;
  const last = Math.min(
    pagination.currentPage * pagination.perPage,
    pagination.total,
  );
  return `Showing ${first}–${last} of ${pagination.total} contact${pagination.total === 1 ? "" : "s"} · ${totalEntries} ${entryWord(totalEntries)}`;
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
  locationId: number | null;
  eventDate: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Please give the form a name.";
  if (!input.locationId)
    errors.location_id = "Choose a location for this form.";
  if (!input.eventDate) errors.event_date = "Choose the event date.";
  return errors;
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

/** The web's Export CSV columns and cells, in order. */
export function registrationExportTable(rows: RegistrationExportRow[]): {
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
      "Registered for last year's edition",
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
      yesNo(row.registeredPreviousEdition),
    ]),
  };
}

export const registrationsCsvFilename = (formName: string, today: string) =>
  `${fileSlug(formName, "registrations")}-registrations-${today}.csv`;

// Set by the detail and editor screens so the list refetches when it regains focus.
let stale = false;

export function markRegistrationFormsStale(): void {
  stale = true;
}

export function consumeRegistrationFormsStale(): boolean {
  const was = stale;
  stale = false;
  return was;
}
