import { ApiError, apiRequest, apiUrl } from "../lib/api";
import {
  multipartEntries,
  registrationGroupBody,
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

/** A registration event (group) already holding forms for this Manage Events event. */
export type RegistrationOptionGroup = {
  id: number;
  name: string;
  canManage: boolean;
  forms: { id: number; locationId: number; eventId: number | null; eventDate: string }[];
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
  registrationGroups: RegistrationOptionGroup[];
};

/** The registration event a location form belongs to. */
export type RegistrationGroupRef = {
  id: number;
  name: string;
  eventDate: string;
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

/** A photo overlay tied to a location form's event day(s). */
export type RegistrationPhotoFrame = {
  id: number;
  name: string;
  status: "active" | "scheduled" | "expired" | "disabled";
  isEnabled: boolean;
  /** Its own hours fall outside the event's day(s). */
  neverRuns: boolean;
};

export type RegistrationPhotoFrames = {
  firstDay: string;
  eventDate: string;
  /** Highest priority first; empty when the form has no frame. */
  frames: RegistrationPhotoFrame[];
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
  group: RegistrationGroupRef | null;
  event: RegistrationLinkedEvent | null;
  previousEdition: RegistrationEdition | null;
  nextEdition: RegistrationEdition | null;
  totalEntries: number;
  uniqueRegistrations: number;
  /** Null from a server without event photo frames. */
  photoFrames: RegistrationPhotoFrames | null;
};

export type RegistrationFormDetail = RegistrationFormRow & {
  counts: RegistrationCounts;
  locationLocked: boolean;
  /** Whether this user may rename the event or remove this location from it. */
  canManageEvent: boolean;
  /** Forms in this form's event, including ones at locations the user can't see. */
  groupFormCount: number;
  /** False when the company's Event registration photos email is switched off; true if the server doesn't say. */
  photoEmailActive: boolean;
};

/** One row of GET /registration-event-groups — an event across its location forms. */
export type RegistrationEventGroupSummary = {
  id: number;
  name: string;
  eventDate: string;
  status: RegistrationFormStatus;
  locationForms: number;
  locationNames: string[];
  totalEntries: number;
  uniqueRegistrations: number;
  canManage: boolean;
};

/** Totals are the server's, over the requested year and location only. */
export type RegistrationEventGroupList = {
  year: number;
  years: number[];
  totals: {
    totalEntries: number;
    uniqueRegistrations: number;
    events: number;
    locationForms: number;
  };
  groups: RegistrationEventGroupSummary[];
};

/** Another form at a location that could be moved into this event. */
export type RegistrationMergeCandidate = {
  id: number;
  locationId: number;
  locationName: string | null;
  eventDate: string;
  status: RegistrationFormStatus;
  totalEntries: number;
  groupId: number | null;
  groupName: string | null;
  groupEventDate: string | null;
  groupLocationForms: number;
};

export type RegistrationEventGroupDetail = {
  id: number;
  name: string;
  eventDate: string;
  description: string | null;
  confirmationMessage: string | null;
  headerImagePath: string | null;
  status: RegistrationFormStatus;
  canManage: boolean;
  /** Every form in the event, including ones the user can't see. */
  locationFormsTotal: number;
  previousGroup: RegistrationGroupRef | null;
  nextGroup: RegistrationGroupRef | null;
  counts: {
    totalEntries: number;
    uniqueRegistrations: number;
    registeredBefore: number;
    locationForms: number;
  };
  /** The location forms this user can see, by location name. */
  forms: RegistrationFormRow[];
  mergeCandidates: RegistrationMergeCandidate[];
};

/** POST /registration-event-groups(/{id}) — only the fields present are sent. */
export type RegistrationEventGroupInput = Partial<{
  name: string;
  eventDate: string;
  description: string;
  confirmationMessage: string;
  /** The full set of locations wanted; the server adds and removes the difference. */
  locationIds: number[];
  eventId: number | null;
  eventLinks: Record<number, number>;
  useEventImage: boolean;
  copyHeaderImageFromGroup: number | null;
  previousGroupId: number | null;
  isOpen: boolean;
  headerImage: RegistrationFormImage | null;
  removeHeaderImage: boolean;
  confirmRemove: boolean;
  moveFormIds: number[];
  /** The locations the screen was showing, so a concurrent change is refused (409). */
  expectedLocationIds: number[];
}>;

export type RegistrationGroupExportRow = RegistrationExportRow & {
  locationId: number;
  locationName: string | null;
};

export type RegistrationGroupExport = {
  rows: RegistrationGroupExportRow[];
  total: number;
  capped: boolean;
  hasPreviousGroup: boolean;
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
  names: string[];
  lastRegisteredAt: string | null;
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

/** POST /registration-events/{id} — only the fields present are changed. */
export type RegistrationFormUpdate = Partial<{
  name: string;
  eventDate: string;
  description: string;
  confirmationMessage: string;
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

function mapGroupRef(raw: unknown): RegistrationGroupRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return { id: num(r.id), name: str(r.name), eventDate: str(r.event_date) };
}

const mapStatus = (v: unknown): RegistrationFormStatus => {
  const status = str(v) as RegistrationFormStatus;
  return STATUSES.includes(status) ? status : "closed";
};

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
    registrationGroups: list(r.registration_groups).map((g) => ({
      id: num(g.id),
      name: str(g.name),
      canManage: g.can_manage === true,
      forms: list(g.forms).map((f) => ({
        id: num(f.id),
        locationId: num(f.location_id),
        eventId: f.event_id == null ? null : num(f.event_id),
        eventDate: str(f.event_date),
      })),
    })),
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

const FRAME_STATUSES: RegistrationPhotoFrame["status"][] = [
  "active",
  "scheduled",
  "expired",
  "disabled",
];

function mapPhotoFrames(raw: unknown): RegistrationPhotoFrames | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const eventDate = str(r.event_date);
  return {
    firstDay: str(r.first_day) || eventDate,
    eventDate,
    frames: list(r.frames).map((f) => {
      const status = str(f.status) as RegistrationPhotoFrame["status"];
      return {
        id: num(f.id),
        name: str(f.name),
        status: FRAME_STATUSES.includes(status) ? status : "disabled",
        isEnabled: f.is_enabled === true,
        neverRuns: f.never_runs === true,
      };
    }),
  };
}

function mapForm(r: Raw): RegistrationFormRow {
  return {
    id: num(r.id),
    name: str(r.name),
    publicCode: str(r.public_code),
    publicUrl: str(r.public_url),
    eventDate: str(r.event_date),
    status: mapStatus(r.status),
    isOpen: r.is_open === true,
    description: strOrNull(r.description),
    confirmationMessage: strOrNull(r.confirmation_message),
    headerImagePath: strOrNull(r.header_image_path),
    locationId: num(r.location_id),
    locationName: strOrNull(r.location_name),
    group: mapGroupRef(r.group),
    event: mapLinkedEvent(r.event),
    previousEdition: mapEdition(r.previous_edition),
    nextEdition: mapEdition(r.next_edition),
    totalEntries: num(r.total_entries),
    uniqueRegistrations: num(r.unique_registrations),
    photoFrames: mapPhotoFrames(r.photo_frames),
  };
}

function mapDetail(r: Raw): RegistrationFormDetail {
  const form = mapForm(r);
  return {
    ...form,
    counts: mapCounts(r.counts),
    locationLocked: r.location_locked === true,
    // An older backend sends neither; an ungrouped form is its own event.
    canManageEvent: r.can_manage_event === undefined ? form.group === null : r.can_manage_event === true,
    groupFormCount: num(r.group_form_count) || 1,
    photoEmailActive: r.photo_email_active !== false,
  };
}

function mapGroupSummary(r: Raw): RegistrationEventGroupSummary {
  return {
    id: num(r.id),
    name: str(r.name),
    eventDate: str(r.event_date),
    status: mapStatus(r.status),
    locationForms: num(r.location_forms),
    locationNames: Array.isArray(r.location_names) ? r.location_names.map(str).filter(Boolean) : [],
    totalEntries: num(r.total_entries),
    uniqueRegistrations: num(r.unique_registrations),
    canManage: r.can_manage === true,
  };
}

function mapGroupDetail(r: Raw): RegistrationEventGroupDetail {
  const counts = (r.counts ?? {}) as Raw;
  return {
    id: num(r.id),
    name: str(r.name),
    eventDate: str(r.event_date),
    description: strOrNull(r.description),
    confirmationMessage: strOrNull(r.confirmation_message),
    headerImagePath: strOrNull(r.header_image_path),
    status: mapStatus(r.status),
    canManage: r.can_manage === true,
    locationFormsTotal: num(r.location_forms_total),
    previousGroup: mapGroupRef(r.previous_group),
    nextGroup: mapGroupRef(r.next_group),
    counts: {
      totalEntries: num(counts.total_entries),
      uniqueRegistrations: num(counts.unique_registrations),
      registeredBefore: num(counts.registered_before),
      locationForms: num(counts.location_forms),
    },
    forms: list(r.forms).map(mapForm),
    mergeCandidates: list(r.merge_candidates).map((c) => ({
      id: num(c.id),
      locationId: num(c.location_id),
      locationName: strOrNull(c.location_name),
      eventDate: str(c.event_date),
      status: mapStatus(c.status),
      totalEntries: num(c.total_entries),
      groupId: c.group_id == null ? null : num(c.group_id),
      groupName: strOrNull(c.group_name),
      groupEventDate: strOrNull(c.group_event_date),
      groupLocationForms: num(c.group_location_forms),
    })),
  };
}

const mapExportRow = (r: Raw): RegistrationExportRow => ({
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
});

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
    names: Array.isArray(r.names) ? r.names.map(str).filter(Boolean) : [],
    lastRegisteredAt: strOrNull(r.last_registered_at),
    registeredBeforeOtherName: r.registered_before_other_name === true,
    otherEventCount: num(r.other_event_count),
    entries: list(r.entries).map(mapEntry),
  };
}

/* ------------------------------------------------------------- requests -- */

type Envelope = { success?: boolean; message?: string; data?: unknown };

const BASE = "/api/registration-events";

export async function fetchRegistrationForm(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<RegistrationFormDetail> {
  const res = await apiRequest<Envelope>(`${BASE}/${id}`, { token, signal });
  return mapDetail((res?.data ?? {}) as Raw);
}

/** JSON through apiRequest, or multipart when a new header image travels with it. */
async function send(
  path: string,
  token: string,
  body: Record<string, unknown>,
  image: RegistrationFormImage | null | undefined,
): Promise<Envelope> {
  if (!image) {
    return apiRequest<Envelope>(path, { method: "POST", token, body });
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
    (Envelope & { errors?: Record<string, string[]> }) | null;
  if (!res.ok) {
    throw new ApiError(
      data?.message || "The changes could not be saved. Please try again.",
      res.status,
      data?.errors,
      data,
    );
  }
  return data ?? {};
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

/** Deleting a grouped form removes its location from the event; the last one deletes the event. */
export async function deleteRegistrationForm(
  token: string,
  id: number,
): Promise<{ groupDeleted: boolean; groupId: number | null }> {
  const res = await apiRequest<Envelope & { group_deleted?: unknown; group_id?: unknown }>(
    `${BASE}/${id}`,
    { method: "DELETE", token },
  );
  return {
    groupDeleted: res?.group_deleted === true,
    groupId: res?.group_id == null ? null : num(res.group_id),
  };
}

/* ------------------------------------------------------ registration events -- */

const GROUPS = "/api/registration-event-groups";

/** GET /registration-event-groups — one row per event, with server totals for the year and location. */
export async function fetchRegistrationEventGroups(
  token: string,
  query: { year: number; locationId?: number },
  signal?: AbortSignal,
): Promise<RegistrationEventGroupList> {
  const params = new URLSearchParams({ year: String(query.year) });
  if (query.locationId != null) params.set("location_id", String(query.locationId));
  const res = await apiRequest<Envelope>(`${GROUPS}?${params.toString()}`, { token, signal });
  const data = (res?.data ?? {}) as Raw;
  const totals = (data.totals ?? {}) as Raw;
  return {
    year: num(data.year) || query.year,
    years: Array.isArray(data.years) ? data.years.map(num).filter((y) => y > 0) : [],
    totals: {
      totalEntries: num(totals.total_entries),
      uniqueRegistrations: num(totals.unique_registrations),
      events: num(totals.events),
      locationForms: num(totals.location_forms),
    },
    groups: list(data.event_groups).map(mapGroupSummary),
  };
}

export async function fetchRegistrationEventGroup(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<RegistrationEventGroupDetail> {
  const res = await apiRequest<Envelope>(`${GROUPS}/${id}`, { token, signal });
  return mapGroupDetail((res?.data ?? {}) as Raw);
}

/** POST /registration-event-groups — the event plus one form per location. */
export async function createRegistrationEventGroup(
  token: string,
  input: RegistrationEventGroupInput,
): Promise<RegistrationEventGroupDetail> {
  const res = await send(GROUPS, token, registrationGroupBody(input), input.headerImage);
  return mapGroupDetail((res.data ?? {}) as Raw);
}

/** POST /registration-event-groups/{id} — changes copy to every location form in it. */
export async function updateRegistrationEventGroup(
  token: string,
  id: number,
  input: RegistrationEventGroupInput,
): Promise<RegistrationEventGroupDetail> {
  const res = await send(`${GROUPS}/${id}`, token, registrationGroupBody(input), input.headerImage);
  return mapGroupDetail((res.data ?? {}) as Raw);
}

export async function deleteRegistrationEventGroup(
  token: string,
  id: number,
  expectedLocationIds: number[],
): Promise<void> {
  const params = new URLSearchParams();
  expectedLocationIds.forEach((locationId) =>
    params.append("expected_location_ids[]", String(locationId)),
  );
  const qs = params.toString();
  await apiRequest<Envelope>(`${GROUPS}/${id}${qs ? `?${qs}` : ""}`, {
    method: "DELETE",
    token,
  });
}

/** GET /registration-event-groups/{id}/export — every visible location's entries, capped server-side. */
export async function exportRegistrationEventGroup(
  token: string,
  id: number,
): Promise<RegistrationGroupExport> {
  const res = await apiRequest<Envelope>(`${GROUPS}/${id}/export`, {
    token,
    timeoutMs: 60000,
  });
  const data = (res?.data ?? {}) as Raw;
  return {
    rows: list(data.rows).map((r) => ({
      ...mapExportRow(r),
      locationId: num(r.location_id),
      locationName: strOrNull(r.location_name),
    })),
    total: num(data.total),
    capped: data.capped === true,
    hasPreviousGroup: data.has_previous_group === true,
  };
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
    rows: list(data.rows).map(mapExportRow),
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
