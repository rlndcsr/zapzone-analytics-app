import { ApiError, apiRequest } from "../lib/api";

/**
 * Customer Concerns — guests who asked for schedule help, wanted to book by
 * phone, or closed checkout with their details already filled in. Same
 * `/api/checkout-concerns` endpoints the web admin's Customer Concerns page uses.
 */
export type ConcernKind =
  | "schedule_help"
  | "call_to_book"
  | "abandoned_checkout";

export type ConcernStatus = "new" | "contacted" | "resolved";

export type ConcernRow = {
  id: number;
  kind: ConcernKind;
  status: ConcernStatus;
  name: string;
  phone: string;
  email: string;
  /** What the guest typed, if anything. */
  message: string;
  /** The package / attraction / event they were looking at. */
  entityName: string;
  /** YYYY-MM-DD, or "" when they never picked one. */
  preferredDate: string;
  /** "6:30 PM" style string as stored, or "". */
  preferredTime: string;
  /** How far they got in checkout, from the stored context blob. */
  stepLabel: string;
  locationName: string;
  /** Who moved it out of "new", when the backend loaded the handler. */
  handlerName: string;
  createdAt: string;
};

type RawConcern = {
  id: number;
  kind?: string | null;
  status?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  message?: string | null;
  entity_name?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  context?: { step_label?: string | null } | unknown;
  location?: { name?: string | null } | null;
  handler?: { first_name?: string | null; last_name?: string | null } | null;
  created_at?: string | null;
};

type ConcernListResponse = {
  success?: boolean;
  data?: {
    concerns?: RawConcern[] | null;
    pagination?: {
      current_page?: number;
      last_page?: number;
      per_page?: number;
      total?: number;
    } | null;
  } | null;
};

type ConcernItemResponse = {
  success?: boolean;
  data?: RawConcern | null;
};

const KINDS: ConcernKind[] = [
  "schedule_help",
  "call_to_book",
  "abandoned_checkout",
];
const STATUSES: ConcernStatus[] = ["new", "contacted", "resolved"];

/** `context` is a json column, so only read step_label when it really is one. */
function stepLabelOf(context: unknown): string {
  if (!context || typeof context !== "object") return "";
  const label = (context as { step_label?: unknown }).step_label;
  return typeof label === "string" ? label.trim() : "";
}

function mapConcern(raw: RawConcern): ConcernRow {
  const kind = (raw.kind ?? "schedule_help") as ConcernKind;
  const status = (raw.status ?? "new") as ConcernStatus;
  const handler = raw.handler
    ? `${raw.handler.first_name ?? ""} ${raw.handler.last_name ?? ""}`.trim()
    : "";

  return {
    id: raw.id,
    kind: KINDS.includes(kind) ? kind : "schedule_help",
    status: STATUSES.includes(status) ? status : "new",
    name: raw.name?.trim() || "Unnamed guest",
    phone: raw.phone?.trim() || "",
    email: raw.email?.trim() || "",
    message: raw.message?.trim() || "",
    entityName: raw.entity_name?.trim() || "",
    // Cast as date, so it can arrive as a full ISO timestamp.
    preferredDate: raw.preferred_date
      ? raw.preferred_date.substring(0, 10)
      : "",
    preferredTime: raw.preferred_time?.trim() || "",
    stepLabel: stepLabelOf(raw.context),
    locationName: raw.location?.name?.trim() || "",
    handlerName: handler,
    createdAt: raw.created_at ?? "",
  };
}

export type ConcernPage = {
  rows: ConcernRow[];
  lastPage: number;
  /** Server-side total for the query, before any client-side filtering. */
  total: number;
};

type FetchParams = {
  token: string;
  /** Narrow to one venue; omit for every venue the account can read. */
  locationId?: number;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
};

/** GET /api/checkout-concerns — one page, newest first (the backend's order). */
export async function fetchCheckoutConcerns({
  token,
  locationId,
  page = 1,
  perPage = 100,
  signal,
}: FetchParams): Promise<ConcernPage> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<ConcernListResponse>(
    `/api/checkout-concerns?${params.toString()}`,
    { token, signal },
  );
  const pg = res?.data?.pagination;
  return {
    rows: (res?.data?.concerns ?? []).map(mapConcern),
    lastPage: pg?.last_page ?? page,
    total: pg?.total ?? 0,
  };
}

/**
 * Safety cap on the load-everything loop below: 30 pages × 100 rows — the same
 * 3000 the web page stops at, so both screens filter and count over the same
 * set. The backend caps `per_page` at 100, hence the page count.
 */
const ALL_MAX_PAGES = 30;

export type AllConcerns = {
  rows: ConcernRow[];
  /** Everything the server has for this scope, even if we stopped early. */
  total: number;
};

/**
 * Page through the index and return every concern (up to the cap), so the
 * screen's timeframe / status / kind / search filters run over the whole set
 * like the web page's do rather than over one server page.
 */
export async function fetchAllCheckoutConcerns({
  token,
  locationId,
  signal,
}: Omit<FetchParams, "page" | "perPage">): Promise<AllConcerns> {
  const rows: ConcernRow[] = [];
  let page = 1;
  let lastPage = 1;
  let total = 0;

  do {
    const res = await fetchCheckoutConcerns({
      token,
      locationId,
      page,
      perPage: 100,
      signal,
    });
    rows.push(...res.rows);
    lastPage = res.lastPage;
    total = res.total;
    page += 1;
  } while (page <= lastPage && page <= ALL_MAX_PAGES);

  return { rows, total };
}

export type ConcernStats = {
  /** Anything not yet resolved — the "Waiting on a Call" tile. */
  open: number;
  scheduleHelp: number;
  callToBook: number;
  abandonedCheckout: number;
  today: number;
};

type ConcernStatsResponse = {
  success?: boolean;
  data?: {
    open?: number | string | null;
    schedule_help?: number | string | null;
    abandoned_checkout?: number | string | null;
    call_to_book?: number | string | null;
    today?: number | string | null;
  } | null;
};

/** GET /api/checkout-concerns/statistics — the five counter tiles. */
export async function fetchCheckoutConcernStats(
  token: string,
  locationId?: number,
  signal?: AbortSignal,
): Promise<ConcernStats> {
  const params = new URLSearchParams();
  if (locationId != null) params.append("location_id", String(locationId));
  const query = params.toString();

  const res = await apiRequest<ConcernStatsResponse>(
    `/api/checkout-concerns/statistics${query ? `?${query}` : ""}`,
    { token, signal },
  );
  const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
  const data = res?.data;

  return {
    open: num(data?.open),
    scheduleHelp: num(data?.schedule_help),
    callToBook: num(data?.call_to_book),
    abandonedCheckout: num(data?.abandoned_checkout),
    today: num(data?.today),
  };
}

/**
 * PUT /api/checkout-concerns/{id} — moves a concern between "needs a call",
 * "contacted" and "resolved". Reopening (back to "new") clears the handler
 * backend-side. Returns the updated row.
 */
export async function updateCheckoutConcernStatus(
  token: string,
  id: number,
  status: ConcernStatus,
  resolutionNote?: string,
): Promise<ConcernRow | null> {
  const res = await apiRequest<ConcernItemResponse>(
    `/api/checkout-concerns/${id}`,
    {
      method: "PUT",
      token,
      body: {
        status,
        ...(resolutionNote ? { resolution_note: resolutionNote } : null),
      },
    },
  );
  return res?.data ? mapConcern(res.data) : null;
}

/* ------------------------------------------------------------------ *
 * Call to Book — creating a callback request
 * ------------------------------------------------------------------ */

export type CallToBookEntityType = "package" | "attraction" | "event";

export type CallToBookInput = {
  /** The venue the customer is actually booking at — never a global default. */
  locationId: number;
  name: string;
  phone: string;
  email?: string | null;
  message?: string | null;
  entityType?: CallToBookEntityType;
  entityId?: number | null;
  entityName?: string | null;
  /** Free-form breadcrumbs the concerns screen shows staff (`step_label` etc). */
  context?: Record<string, unknown> | null;
};

type SubmitResponse = {
  success?: boolean;
  message?: string | null;
  data?: { id?: number | null } | null;
};

const SUBMIT_FALLBACK_MESSAGE =
  "Thanks — the team at this venue has your details and will contact you about this.";

/** Drop undefined / null / "" so optional fields are absent rather than empty,
 *  matching the web service's `strip()` before it posts. */
function stripEmpty(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

/**
 * POST /api/checkout-concerns with `kind: "call_to_book"` — the same public
 * endpoint the web admin's Call to Book modal posts to.
 *
 * `publicEndpoint: true` is required, not cosmetic: this route sits outside the
 * auth group, so a 401 from it says nothing about the staff session. Without
 * the flag `apiRequest` would tear the session down and sign the user out
 * mid-booking.
 *
 * Everything after the response — deduplication, the Contact upsert, staff
 * email + SMS, and the in-app notification — is the backend's job. Nothing here
 * triggers or duplicates any of it.
 *
 * Returns the backend's confirmation message. Failures throw an `ApiError`
 * whose `message` is already user-facing and whose `status` / `fieldErrors` the
 * caller can inspect.
 */
export async function submitCallToBook(
  input: CallToBookInput,
): Promise<{ message: string }> {
  const body = stripEmpty({
    location_id: input.locationId,
    kind: "call_to_book",
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim(),
    message: input.message?.trim(),
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_name: input.entityName,
    context: input.context,
  });

  try {
    const res = await apiRequest<SubmitResponse>("/api/checkout-concerns", {
      method: "POST",
      body,
      publicEndpoint: true,
    });

    // 201 carries `data.id`; a request repeated inside the backend's 10-minute
    // dedupe window answers 200 with a message and no id. Both mean the venue
    // has the customer's details, so neither is an error.
    return { message: res?.message?.trim() || SUBMIT_FALLBACK_MESSAGE };
  } catch (err) {
    if (err instanceof ApiError) {
      throw new ApiError(
        callToBookErrorMessage(err),
        err.status,
        err.fieldErrors,
        err.body,
      );
    }
    throw err;
  }
}

/** Turn a failed submit into something worth showing a member of staff. The
 *  first field error wins, the way the web surfaces `errors.phone[0]`. */
function callToBookErrorMessage(err: ApiError): string {
  const firstFieldError = err.fieldErrors
    ? Object.values(err.fieldErrors)[0]?.[0]
    : undefined;

  if (err.status === 422) {
    return (
      firstFieldError ||
      err.message ||
      "Please check the name and phone number and try again."
    );
  }

  if (err.status === 429) {
    return "Too many requests from this venue just now. Wait a moment and try again, or call the venue directly.";
  }

  // status 0 is a transport failure (offline / timeout) — apiRequest has
  // already put a readable message on it.
  if (err.status === 0) return err.message;

  return err.message || "We could not send that. Please call the venue directly.";
}
