import { ApiError, apiRequest, apiUrl } from "../lib/api";
import {
  multipartEntries,
  registrationCreateBody,
  registrationUpdateBody,
} from "../lib/registrationForms/registrationPayload";

export type RegistrationFormStatus = "open" | "closed" | "past";

export type RegistrationEdition = {
  id: number;
  name: string;
  eventDate: string;
};

/** The Manage Events event a form is for (always at the form's own location). */
export type RegistrationLinkedEvent = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

/** GET /registration-events/event-options — an event a form can start from. */
export type RegistrationEventOption = RegistrationLinkedEvent & {
  locationId: number;
  locationName: string | null;
  description: string | null;
  /** Stored image path; null when there's none or it's an inline data URI. */
  image: string | null;
  hasImage: boolean;
  isActive: boolean;
  /** Forms already linked to this event at its own location. */
  registrationFormIds: number[];
};

export type RegistrationCounts = {
  totalEntries: number;
  uniqueRegistrations: number;
  duplicateGroups: number;
  entriesInDuplicateGroups: number;
  returningContacts: number;
  previousEditionRegistrants: number;
  hiddenEntries: number;
};

export type RegistrationFormRow = {
  id: number;
  name: string;
  publicCode: string;
  publicUrl: string;
  eventDate: string;
  status: RegistrationFormStatus;
  isOpen: boolean;
  description: string | null;
  confirmationMessage: string | null;
  headerImagePath: string | null;
  locationId: number;
  locationName: string | null;
  event: RegistrationLinkedEvent | null;
  previousEdition: RegistrationEdition | null;
  nextEdition: RegistrationEdition | null;
  totalEntries: number;
  uniqueRegistrations: number;
};

export type RegistrationFormDetail = RegistrationFormRow & {
  counts: RegistrationCounts;
  locationLocked: boolean;
};

export type RegistrationListFilter =
  "all" | "duplicates" | "returning" | "previous_edition" | "hidden";

export type RegistrationEntry = {
  id: number;
  name: string;
  email: string;
  phone: string;
  registeredAt: string;
  returning: boolean;
  registeredPreviousEdition: boolean;
  hiddenAt: string | null;
};

/** Entries sharing one phone + email — the list is paged by these. */
export type RegistrationGroup = {
  contactId: number;
  entryCount: number;
  isDuplicate: boolean;
  email: string;
  phone: string;
  registeredBeforeOtherName: boolean;
  otherEventCount: number;
  entries: RegistrationEntry[];
};

export type RegistrationPagination = {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
};

export type RegistrationGroupsPage = {
  groups: RegistrationGroup[];
  pagination: RegistrationPagination;
  counts: RegistrationCounts;
};

export type RegistrationExportRow = {
  entryId: number;
  registeredAt: string;
  name: string;
  email: string;
  phone: string;
  contactId: number;
  sameContactEntries: number;
  isDuplicate: boolean;
  returning: boolean;
  registeredPreviousEdition: boolean;
};

export type RegistrationExport = {
  rows: RegistrationExportRow[];
  total: number;
  capped: boolean;
};

export type RegistrationHistoryItem = {
  entryId: number;
  eventName: string;
  eventDate: string;
  locationName: string | null;
  registeredAt: string;
  name: string;
  isCurrentEvent: boolean;
  isPreviousEdition: boolean;
};

export type RegistrationHistory = {
  email: string;
  phone: string;
  history: RegistrationHistoryItem[];
  otherLocationRegistrations: number;
};

/** A picked header image, kept in its original encoding for the upload. */
export type RegistrationFormImage = { uri: string; name: string; type: string };

/** POST /registration-events — one form per location in `locationIds`. */
export type RegistrationFormCreateInput = {
  name: string;
  locationIds: number[];
  eventDate: string;
  description: string;
  confirmationMessage: string;
  previousEditionId: number | null;
  /** The event the form starts from; `eventLinks` maps location → its own event. */
  eventId: number | null;
  eventLinks: Record<number, number>;
  useEventImage: boolean;
  copyHeaderImageFrom: number | null;
  isOpen: boolean;
  headerImage: RegistrationFormImage | null;
};

/** POST /registration-events/{id} — only the fields present are changed. */
export type RegistrationFormUpdate = Partial<{
  name: string;
  locationId: number;
  eventDate: string;
  description: string;
  confirmationMessage: string;
  previousEditionId: number | null;
  eventId: number | null;
  isOpen: boolean;
  headerImage: RegistrationFormImage;
  removeHeaderImage: boolean;
}>;

/* --------------------------------------------------------------- mapping -- */

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const list = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const STATUSES: RegistrationFormStatus[] = ["open", "closed", "past"];

function mapEdition(raw: unknown): RegistrationEdition | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return { id: num(r.id), name: str(r.name), eventDate: str(r.event_date) };
}

function mapLinkedEvent(raw: unknown): RegistrationLinkedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return {
    id: num(r.id),
    name: str(r.name),
    startDate: strOrNull(r.start_date),
    endDate: strOrNull(r.end_date),
  };
}

function mapEventOption(r: Raw): RegistrationEventOption {
  return {
    ...(mapLinkedEvent(r) as RegistrationLinkedEvent),
    locationId: num(r.location_id),
    locationName: strOrNull(r.location_name),
    description: strOrNull(r.description),
    image: strOrNull(r.image),
    hasImage: r.has_image === true,
    isActive: r.is_active === true,
    registrationFormIds: Array.isArray(r.registration_form_ids)
      ? r.registration_form_ids.map(num).filter((id) => id > 0)
      : [],
  };
}

function mapCounts(raw: unknown): RegistrationCounts {
  const r = (raw ?? {}) as Raw;
  return {
    totalEntries: num(r.total_entries),
    uniqueRegistrations: num(r.unique_registrations),
    duplicateGroups: num(r.duplicate_groups),
    entriesInDuplicateGroups: num(r.entries_in_duplicate_groups),
    returningContacts: num(r.returning_contacts),
    previousEditionRegistrants: num(r.previous_edition_registrants),
    hiddenEntries: num(r.hidden_entries),
  };
}

function mapForm(r: Raw): RegistrationFormRow {
  const status = str(r.status) as RegistrationFormStatus;
  return {
    id: num(r.id),
    name: str(r.name),
    publicCode: str(r.public_code),
    publicUrl: str(r.public_url),
    eventDate: str(r.event_date),
    status: STATUSES.includes(status) ? status : "closed",
    isOpen: r.is_open === true,
    description: strOrNull(r.description),
    confirmationMessage: strOrNull(r.confirmation_message),
    headerImagePath: strOrNull(r.header_image_path),
    locationId: num(r.location_id),
    locationName: strOrNull(r.location_name),
    event: mapLinkedEvent(r.event),
    previousEdition: mapEdition(r.previous_edition),
    nextEdition: mapEdition(r.next_edition),
    totalEntries: num(r.total_entries),
    uniqueRegistrations: num(r.unique_registrations),
  };
}

function mapDetail(r: Raw): RegistrationFormDetail {
  return {
    ...mapForm(r),
    counts: mapCounts(r.counts),
    locationLocked: r.location_locked === true,
  };
}

function mapEntry(r: Raw): RegistrationEntry {
  return {
    id: num(r.id),
    name: str(r.name),
    email: str(r.email),
    phone: str(r.phone),
    registeredAt: str(r.registered_at),
    returning: r.returning === true,
    registeredPreviousEdition: r.registered_previous_edition === true,
    hiddenAt: strOrNull(r.hidden_at),
  };
}

function mapGroup(r: Raw): RegistrationGroup {
  return {
    contactId: num(r.contact_id),
    entryCount: num(r.entry_count),
    isDuplicate: r.is_duplicate === true,
    email: str(r.email),
    phone: str(r.phone),
    registeredBeforeOtherName: r.registered_before_other_name === true,
    otherEventCount: num(r.other_event_count),
    entries: list(r.entries).map(mapEntry),
  };
}

/* ------------------------------------------------------------- requests -- */

type Envelope = { success?: boolean; message?: string; data?: unknown };

const BASE = "/api/registration-events";

export async function fetchRegistrationForms(
  token: string,
  locationId?: number,
  signal?: AbortSignal,
): Promise<RegistrationFormRow[]> {
  const query = locationId != null ? `?location_id=${locationId}` : "";
  const res = await apiRequest<Envelope>(`${BASE}${query}`, { token, signal });
  return list((res?.data as Raw | undefined)?.events).map(mapForm);
}

export async function fetchRegistrationForm(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<RegistrationFormDetail> {
  const res = await apiRequest<Envelope>(`${BASE}/${id}`, { token, signal });
  return mapDetail((res?.data ?? {}) as Raw);
}

type SaveResponse = Envelope & { created?: unknown };

/** JSON through apiRequest, or multipart when a new header image travels with it. */
async function send(
  path: string,
  token: string,
  body: Record<string, unknown>,
  image: RegistrationFormImage | null | undefined,
): Promise<SaveResponse> {
  if (!image) {
    return apiRequest<SaveResponse>(path, { method: "POST", token, body });
  }
  const form = new FormData();
  multipartEntries(body).forEach(([key, value]) => form.append(key, value));
  form.append("header_image", image as unknown as Blob);

  // A direct fetch, so React Native sets the multipart boundary itself.
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = (await res.json().catch(() => null)) as
    (SaveResponse & { errors?: Record<string, string[]> }) | null;
  if (!res.ok) {
    throw new ApiError(
      data?.message || "The form could not be saved. Please try again.",
      res.status,
      data?.errors,
      data,
    );
  }
  return data ?? {};
}

/**
 * POST /registration-events — creates one form per chosen location in one go.
 * `form` is the first one created; `createdCount` says how many there were.
 */
export async function createRegistrationForms(
  token: string,
  input: RegistrationFormCreateInput,
): Promise<{ form: RegistrationFormDetail; createdCount: number }> {
  const res = await send(BASE, token, registrationCreateBody(input), input.headerImage);
  const created = Array.isArray(res.created) ? res.created.length : 1;
  return {
    form: mapDetail((res.data ?? {}) as Raw),
    createdCount: Math.max(1, created),
  };
}

/** POST /registration-events/{id} — send only what changed (see changedFormFields). */
export async function updateRegistrationForm(
  token: string,
  id: number,
  patch: RegistrationFormUpdate,
): Promise<RegistrationFormDetail> {
  const res = await send(`${BASE}/${id}`, token, registrationUpdateBody(patch), patch.headerImage);
  return mapDetail((res.data ?? {}) as Raw);
}

/**
 * GET /registration-events/event-options — Manage Events events at the
 * signed-in staff member's locations, each with the forms already linked to it.
 */
export async function fetchEventOptions(
  token: string,
  id?: number,
  signal?: AbortSignal,
): Promise<RegistrationEventOption[]> {
  const query = id != null ? `?id=${id}` : "";
  const res = await apiRequest<Envelope>(`${BASE}/event-options${query}`, {
    token,
    signal,
  });
  return list((res?.data as Raw | undefined)?.events).map(mapEventOption);
}

export async function deleteRegistrationForm(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest<Envelope>(`${BASE}/${id}`, { method: "DELETE", token });
}

export async function fetchRegistrations(
  token: string,
  id: number,
  query: {
    search?: string;
    filter?: RegistrationListFilter;
    page?: number;
    perPage?: number;
  },
  signal?: AbortSignal,
): Promise<RegistrationGroupsPage> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.filter) params.set("filter", query.filter);
  if (query.page) params.set("page", String(query.page));
  if (query.perPage) params.set("per_page", String(query.perPage));
  const qs = params.toString();
  const res = await apiRequest<Envelope>(
    `${BASE}/${id}/registrations${qs ? `?${qs}` : ""}`,
    { token, signal },
  );
  const data = (res?.data ?? {}) as Raw;
  const page = (data.pagination ?? {}) as Raw;
  return {
    groups: list(data.groups).map(mapGroup),
    pagination: {
      currentPage: num(page.current_page) || 1,
      lastPage: num(page.last_page) || 1,
      perPage: num(page.per_page),
      total: num(page.total),
    },
    counts: mapCounts(data.counts),
  };
}

/** GET /api/registration-events/{id}/registrations/export — capped server-side. */
export async function exportRegistrations(
  token: string,
  id: number,
): Promise<RegistrationExport> {
  const res = await apiRequest<Envelope>(`${BASE}/${id}/registrations/export`, {
    token,
    timeoutMs: 60000,
  });
  const data = (res?.data ?? {}) as Raw;
  return {
    rows: list(data.rows).map((r) => ({
      entryId: num(r.entry_id),
      registeredAt: str(r.registered_at),
      name: str(r.name),
      email: str(r.email),
      phone: str(r.phone),
      contactId: num(r.contact_id),
      sameContactEntries: num(r.same_contact_entries),
      isDuplicate: r.is_duplicate === true,
      returning: r.returning === true,
      registeredPreviousEdition: r.registered_previous_edition === true,
    })),
    total: num(data.total),
    capped: data.capped === true,
  };
}

/** GET /api/registration-events/{id}/contacts/{contactId}/history. */
export async function fetchContactHistory(
  token: string,
  id: number,
  contactId: number,
  signal?: AbortSignal,
): Promise<RegistrationHistory> {
  const res = await apiRequest<Envelope>(
    `${BASE}/${id}/contacts/${contactId}/history`,
    { token, signal },
  );
  const data = (res?.data ?? {}) as Raw;
  const contact = (data.contact ?? {}) as Raw;
  return {
    email: str(contact.email),
    phone: str(contact.phone),
    history: list(data.history).map((r) => ({
      entryId: num(r.entry_id),
      eventName: str(r.event_name),
      eventDate: str(r.event_date),
      locationName: strOrNull(r.location_name),
      registeredAt: str(r.registered_at),
      name: str(r.name),
      isCurrentEvent: r.is_current_event === true,
      isPreviousEdition: r.is_previous_edition === true,
    })),
    otherLocationRegistrations: num(data.other_location_registrations),
  };
}

export async function setRegistrationEntryHidden(
  token: string,
  id: number,
  entryId: number,
  hidden: boolean,
): Promise<RegistrationCounts> {
  const res = await apiRequest<Envelope>(
    `${BASE}/${id}/entries/${entryId}/${hidden ? "hide" : "restore"}`,
    { method: "POST", token },
  );
  return mapCounts(((res?.data ?? {}) as Raw).counts);
}
