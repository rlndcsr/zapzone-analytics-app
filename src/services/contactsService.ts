import { apiRequest } from "../lib/api";

/**
 * The web `/customers` LIST page is backed by the CRM `contacts` API (NOT the
 * booking-customer model). These fetchers mirror it. Rows are slim text records
 * (no images), and the backend scopes by role automatically (company admins see
 * the whole company; location managers/attendants are limited to their location),
 * so the app does no client-side access filtering.
 */

export type ContactStatus = "active" | "inactive";

/** A contact/customer row backing the Customers list. */
export type ContactRow = {
  id: number;
  firstName: string;
  lastName: string;
  /** first + last, else email — for the card title. */
  name: string;
  email: string;
  phone: string | null;
  /** ISO date string (date_of_birth); null when unset. */
  dateOfBirth: string | null;
  companyName: string | null;
  jobTitle: string | null;
  source: string | null;
  notes: string | null;
  status: ContactStatus;
  smsConsent: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  tags: string[];
  locationId: number | null;
  locationName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type RawContact = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  source?: string | null;
  notes?: string | null;
  status?: string | null;
  sms_consent?: boolean | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  tags?: string[] | null;
  location_id?: number | null;
  location?: { id?: number; name?: string | null } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function mapContact(raw: RawContact): ContactRow {
  const first = raw.first_name?.trim() || "";
  const last = raw.last_name?.trim() || "";
  const fullName = `${first} ${last}`.trim();
  const email = raw.email?.trim() || "";
  return {
    id: raw.id,
    firstName: first,
    lastName: last,
    name: fullName || email || "Unnamed contact",
    email,
    phone: strOrNull(raw.phone),
    dateOfBirth: strOrNull(raw.date_of_birth),
    companyName: strOrNull(raw.company_name),
    jobTitle: strOrNull(raw.job_title),
    source: strOrNull(raw.source),
    notes: strOrNull(raw.notes),
    status: raw.status === "inactive" ? "inactive" : "active",
    smsConsent: !!raw.sms_consent,
    address: strOrNull(raw.address),
    city: strOrNull(raw.city),
    state: strOrNull(raw.state),
    zip: strOrNull(raw.zip),
    country: strOrNull(raw.country),
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
      : [],
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || null,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

export type ContactSort =
  | "first_name"
  | "last_name"
  | "email"
  | "company_name"
  | "created_at"
  | "status";

export type ContactPage = {
  rows: ContactRow[];
  page: number;
  lastPage: number;
  total: number;
};

type FetchContactsParams = {
  token: string;
  companyId?: number;
  search?: string;
  status?: ContactStatus;
  /** Filter to contacts carrying this tag (server-side). */
  tag?: string;
  /** Filter by customer source (server-side). */
  source?: string;
  sortBy?: ContactSort;
  sortOrder?: "asc" | "desc";
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/contacts — one page of the contacts list. Search, status, and sort
 * are applied server-side (the endpoint supports them), so the mobile screen
 * pages with load-more instead of loading the whole CRM into memory.
 */
export async function fetchContacts({
  token,
  companyId,
  search,
  status,
  tag,
  source,
  sortBy = "created_at",
  sortOrder = "desc",
  page = 1,
  perPage = 20,
  signal,
}: FetchContactsParams): Promise<ContactPage> {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    sort_by: sortBy,
    sort_order: sortOrder,
  });
  if (companyId != null) params.append("company_id", String(companyId));
  if (status) params.append("status", status);
  if (tag) params.append("tag", tag);
  if (source) params.append("source", source);
  const q = search?.trim();
  if (q) params.append("search", q);

  const res = await apiRequest<{
    data?: { contacts?: RawContact[]; pagination?: { last_page?: number; total?: number } };
  }>(`/api/contacts?${params.toString()}`, { token, signal });

  const rows = (res.data?.contacts ?? []).map(mapContact);
  const lastPage = Number(res.data?.pagination?.last_page ?? page) || page;
  const total = Number(res.data?.pagination?.total ?? rows.length);
  return { rows, page, lastPage, total };
}

// Safety cap: 200 * 50 = 10k contacts, far beyond any real single-company CRM.
const ALL_MAX_PAGES = 50;

/**
 * Page through the auth-scoped /api/contacts index and return EVERY contact the
 * user can see (no status/tag/source filter). Mirrors the web `/customers` list,
 * which loads all contacts once (per_page=200 loop) and then filters/sorts/pages
 * entirely client-side. Rows are slim text (no images), so holding them all is
 * cheap; the total also equals the web's "Total Customers" (contacts.length).
 */
export async function fetchAllContacts({
  token,
  companyId,
  signal,
}: {
  token: string;
  companyId?: number;
  signal?: AbortSignal;
}): Promise<ContactRow[]> {
  const out: ContactRow[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await fetchContacts({
      token,
      companyId,
      page,
      perPage: 200,
      signal,
    });
    out.push(...res.rows);
    lastPage = res.lastPage;
    page += 1;
  } while (page <= lastPage && page <= ALL_MAX_PAGES);
  return out;
}

/** GET /api/contacts/{id} — one contact, mapped via the shared mapper (Edit screen). */
export async function fetchContact(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<ContactRow> {
  const res = await apiRequest<{ data?: RawContact }>(`/api/contacts/${id}`, {
    token,
    signal,
  });
  return mapContact(res.data ?? { id });
}

export type ContactStats = {
  total: number;
  active: number;
  inactive: number;
  recentlyAdded: number;
  /** source → count (company-wide); feeds the Source filter options. */
  bySource: string[];
};

/** GET /api/contacts/statistics — the KPI cards + the set of customer sources. */
export async function fetchContactStats({
  token,
  companyId,
  signal,
}: {
  token: string;
  companyId?: number;
  signal?: AbortSignal;
}): Promise<ContactStats> {
  const params = new URLSearchParams();
  if (companyId != null) params.append("company_id", String(companyId));
  const qs = params.toString();
  const res = await apiRequest<{
    data?: {
      total?: number;
      active?: number;
      inactive?: number;
      recently_added?: number;
      by_source?: Record<string, number>;
    };
  }>(`/api/contacts/statistics${qs ? `?${qs}` : ""}`, { token, signal });
  const d = res.data ?? {};
  return {
    total: Number(d.total ?? 0),
    active: Number(d.active ?? 0),
    inactive: Number(d.inactive ?? 0),
    recentlyAdded: Number(d.recently_added ?? 0),
    bySource: Object.keys(d.by_source ?? {}).filter((s) => s && s !== "null"),
  };
}

/** GET /api/contacts/tags — the distinct tags for the Tag filter. */
export async function fetchContactTags({
  token,
  companyId,
  signal,
}: {
  token: string;
  companyId?: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const params = new URLSearchParams();
  if (companyId != null) params.append("company_id", String(companyId));
  const qs = params.toString();
  const res = await apiRequest<{ data?: string[] } | string[]>(
    `/api/contacts/tags${qs ? `?${qs}` : ""}`,
    { token, signal },
  );
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list.filter((t): t is string => typeof t === "string" && !!t.trim());
}

/** Fields the create/edit forms manage (matches the backend validation). */
export type ContactInput = {
  companyId: number;
  locationId?: number | null;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** YYYY-MM-DD; optional so the create form (which omits it) still type-checks. */
  dateOfBirth?: string | null;
  companyName: string;
  jobTitle: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  source: string;
  notes: string;
  status: ContactStatus;
  smsConsent: boolean;
  /** Sent only on create (the web edits tags via the chip UI, not the form). */
  tags?: string[];
};

function inputToBody(input: Partial<ContactInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.companyId != null) body.company_id = input.companyId;
  if (input.locationId != null) body.location_id = input.locationId;
  if (input.email != null) body.email = input.email;
  if (input.firstName != null) body.first_name = input.firstName || null;
  if (input.lastName != null) body.last_name = input.lastName || null;
  if (input.phone != null) body.phone = input.phone || null;
  if (input.dateOfBirth !== undefined) body.date_of_birth = input.dateOfBirth || null;
  if (input.companyName != null) body.company_name = input.companyName || null;
  if (input.jobTitle != null) body.job_title = input.jobTitle || null;
  if (input.address != null) body.address = input.address || null;
  if (input.city != null) body.city = input.city || null;
  if (input.state != null) body.state = input.state || null;
  if (input.zip != null) body.zip = input.zip || null;
  if (input.country != null) body.country = input.country || null;
  if (input.source != null) body.source = input.source || null;
  if (input.notes != null) body.notes = input.notes || null;
  if (input.status != null) body.status = input.status;
  if (input.smsConsent != null) body.sms_consent = input.smsConsent;
  if (input.tags != null) body.tags = input.tags;
  return body;
}

/** POST /api/contacts — create a contact (company_id + email required). */
export async function createContact(
  token: string,
  input: ContactInput,
): Promise<ContactRow> {
  const res = await apiRequest<{ data?: RawContact }>("/api/contacts", {
    method: "POST",
    token,
    body: inputToBody(input),
  });
  return mapContact(res.data ?? { id: 0 });
}

/** PUT /api/contacts/{id} — update a contact (also used for the status toggle). */
export async function updateContact(
  token: string,
  id: number,
  patch: Partial<ContactInput>,
): Promise<void> {
  await apiRequest(`/api/contacts/${id}`, {
    method: "PUT",
    token,
    body: inputToBody(patch),
  });
}

/** DELETE /api/contacts/{id}. */
export async function deleteContact(token: string, id: number): Promise<void> {
  await apiRequest(`/api/contacts/${id}`, { method: "DELETE", token });
}

/** POST /api/contacts/{id}/add-tag. */
export async function addContactTag(
  token: string,
  id: number,
  tag: string,
): Promise<void> {
  await apiRequest(`/api/contacts/${id}/add-tag`, {
    method: "POST",
    token,
    body: { tag },
  });
}

/** POST /api/contacts/{id}/remove-tag. */
export async function removeContactTag(
  token: string,
  id: number,
  tag: string,
): Promise<void> {
  await apiRequest(`/api/contacts/${id}/remove-tag`, {
    method: "POST",
    token,
    body: { tag },
  });
}
