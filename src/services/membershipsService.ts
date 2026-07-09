import { apiRequest } from "../lib/api";

/** Lifecycle status, mirrored from the backend `status` enum. */
export type MembershipStatus =
  | "pending"
  | "active"
  | "past_due"
  | "suspended"
  | "frozen"
  | "canceled"
  | "expired";

/** Flattened membership row backing the Memberships list. */
export type MembershipRow = {
  id: number;
  customerId: number | null;
  memberName: string;
  memberEmail: string;
  memberPhone: string | null;
  planId: number | null;
  /** Plan name when loaded, else "#<id>" — mirrors the web fallback. */
  planLabel: string;
  status: MembershipStatus;
  /** ISO date the membership started (STARTED column); null when unset. */
  startedAt: string | null;
  /** ISO date the current term ends / next bills (RENEWS column). */
  renewsAt: string | null;
  billingAmount: number;
  isComped: boolean;
  holderName: string | null;
  homeLocationName: string | null;
  qrToken: string | null;
};

type RawRelationCustomer = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type RawMembership = {
  id: number;
  customer_id?: number | null;
  customer?: RawRelationCustomer | null;
  membership_plan_id?: number | null;
  plan?: { id?: number; name?: string | null } | null;
  home_location?: { id?: number; name?: string | null } | null;
  homeLocation?: { id?: number; name?: string | null } | null;
  status?: MembershipStatus | null;
  started_at?: string | null;
  current_term_start?: string | null;
  current_term_end?: string | null;
  next_billing_at?: string | null;
  billing_amount?: number | string | null;
  is_comped?: boolean | null;
  holder_name?: string | null;
  qr_token?: string | null;
};

const REQUEST_TIMEOUT_MS = 15000;

function fullName(c?: RawRelationCustomer | null): string {
  if (!c) return "Unknown member";
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return name || c.email?.trim() || "Unknown member";
}

function mapMembership(raw: RawMembership): MembershipRow {
  const planName = raw.plan?.name?.trim();
  const planId = raw.plan?.id ?? raw.membership_plan_id ?? null;
  const home = raw.home_location ?? raw.homeLocation ?? null;
  return {
    id: raw.id,
    customerId: raw.customer?.id ?? raw.customer_id ?? null,
    memberName: fullName(raw.customer),
    memberEmail: raw.customer?.email?.trim() || "",
    memberPhone: raw.customer?.phone?.trim() || null,
    planId,
    planLabel: planName || (planId != null ? `#${planId}` : "—"),
    status: raw.status ?? "pending",
    startedAt: raw.started_at ?? raw.current_term_start ?? null,
    renewsAt: raw.current_term_end ?? raw.next_billing_at ?? null,
    billingAmount: Number(raw.billing_amount ?? 0),
    isComped: !!raw.is_comped,
    holderName: raw.holder_name?.trim() || null,
    homeLocationName: home?.name?.trim() || null,
    qrToken: raw.qr_token ?? null,
  };
}

function looksLikeMembership(v: unknown): v is RawMembership {
  return !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "number";
}

/**
 * GET /api/memberships returns a Laravel paginator wrapped in `{ success, data }`.
 * Return both the rows and the pagination total (drives the "Total" stat card).
 */
function extractMemberships(res: unknown): { rows: RawMembership[]; total: number } {
  const root = (res ?? {}) as Record<string, unknown>;
  const paginator = (root.data ?? {}) as Record<string, unknown>;

  const asArray = (v: unknown): RawMembership[] | null =>
    Array.isArray(v) && (v.length === 0 || looksLikeMembership(v[0]))
      ? (v as RawMembership[])
      : null;

  const rows =
    asArray(paginator.data) ??
    asArray(root.data) ??
    asArray(res) ??
    [];
  const total =
    typeof paginator.total === "number" ? paginator.total : rows.length;

  return { rows, total };
}

/** Filters the list endpoint accepts (all optional). */
export type MembershipFilters = {
  search?: string;
  status?: MembershipStatus;
  planId?: number;
  locationId?: number;
};

type FetchParams = { token: string; filters?: MembershipFilters; signal?: AbortSignal };

export type MembershipList = { rows: MembershipRow[]; total: number };

/** GET /api/memberships — auth-scoped list the user can access. */
export async function fetchMemberships({
  token,
  filters = {},
  signal,
}: FetchParams): Promise<MembershipList> {
  const params = new URLSearchParams({ per_page: "100" });
  if (filters.search) params.append("search", filters.search);
  if (filters.status) params.append("status", filters.status);
  if (filters.planId != null) params.append("plan_id", String(filters.planId));
  if (filters.locationId != null) params.append("location_id", String(filters.locationId));

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    const res = await apiRequest<unknown>(`/api/memberships?${params.toString()}`, {
      token,
      signal: controller.signal,
    });
    const { rows, total } = extractMemberships(res);
    return { rows: rows.map(mapMembership), total };
  } catch (err) {
    if (timedOut) throw new Error("Request timed out. Pull to refresh to try again.");
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Status counts for the stat cards, from GET /api/membership-reports/summary. */
export type MembershipSummary = {
  active: number;
  pastDue: number;
  frozen: number;
  suspended: number;
};

type SummaryResponse = {
  data?: {
    counts?: {
      active?: number;
      past_due?: number;
      frozen?: number;
      suspended?: number;
    };
  };
};

/**
 * GET /api/membership-reports/summary — accurate, all-time status counts that
 * don't suffer the list's pagination limit. Active/past-due/frozen/suspended are
 * counted over the whole company (not date-ranged) by the backend.
 */
export async function fetchMembershipSummary({
  token,
  locationId,
  signal,
}: {
  token: string;
  locationId?: number;
  signal?: AbortSignal;
}): Promise<MembershipSummary> {
  const params = new URLSearchParams();
  if (locationId != null) params.append("location_id", String(locationId));
  const qs = params.toString();
  const res = await apiRequest<SummaryResponse>(
    `/api/membership-reports/summary${qs ? `?${qs}` : ""}`,
    { token, signal },
  );
  const counts = res.data?.counts ?? {};
  return {
    active: counts.active ?? 0,
    pastDue: counts.past_due ?? 0,
    frozen: counts.frozen ?? 0,
    suspended: counts.suspended ?? 0,
  };
}

/** How staff are settling a new membership at creation (matches backend enum). */
export type PaymentType = "charge" | "external" | "comp";

export type CreateMembershipPayload = {
  customerId: number;
  membershipPlanId: number;
  holderName?: string;
  homeLocationId?: number;
  paymentType: PaymentType;
};

/**
 * POST /api/memberships — create a membership as staff. Card charges require an
 * Accept.js opaque token, which this app can't capture, so the caller restricts
 * `charge` to free plans; `comp` and `external` settle without a card.
 */
export async function createMembership(
  token: string,
  payload: CreateMembershipPayload,
): Promise<void> {
  const body: Record<string, unknown> = {
    customer_id: payload.customerId,
    membership_plan_id: payload.membershipPlanId,
    payment_type: payload.paymentType,
    is_comped: payload.paymentType === "comp",
  };
  if (payload.holderName) body.holder_name = payload.holderName;
  if (payload.homeLocationId != null) body.home_location_id = payload.homeLocationId;
  await apiRequest("/api/memberships", { method: "POST", token, body });
}

/** PATCH /api/memberships/{id}/cancel — immediate or at end of the term. */
export async function cancelMembership(
  token: string,
  id: number,
  effective: "immediate" | "end_of_term",
  note?: string,
): Promise<void> {
  await apiRequest(`/api/memberships/${id}/cancel`, {
    method: "PATCH",
    token,
    body: { effective, note },
  });
}

/** PATCH /api/memberships/{id}/freeze. */
export async function freezeMembership(
  token: string,
  id: number,
  note?: string,
): Promise<void> {
  await apiRequest(`/api/memberships/${id}/freeze`, {
    method: "PATCH",
    token,
    body: { note },
  });
}

/** PATCH /api/memberships/{id}/unfreeze. */
export async function unfreezeMembership(
  token: string,
  id: number,
  note?: string,
): Promise<void> {
  await apiRequest(`/api/memberships/${id}/unfreeze`, {
    method: "PATCH",
    token,
    body: { note },
  });
}

/** DELETE /api/memberships/{id} — company admins only; must be canceled first. */
export async function deleteMembership(token: string, id: number): Promise<void> {
  await apiRequest(`/api/memberships/${id}`, { method: "DELETE", token });
}

/* ------------------------------------------------------------------ */
/* Reports (GET /api/membership-reports/summary)                       */
/* ------------------------------------------------------------------ */

/** Full KPI payload backing the Membership Reports screen. */
export type MembershipReport = {
  counts: {
    active: number;
    pastDue: number;
    suspended: number;
    frozen: number;
    canceledInRange: number;
    newInRange: number;
  };
  mrr: number;
  arr: number;
  failedPayments: number;
  revenueInRange: number;
  topPlans: { id: number; name: string; price: number }[];
  visitsByLocation: { locationId: number | null; locationName: string; visits: number }[];
  underused: {
    id: number;
    customerName: string | null;
    planName: string | null;
    visitsRemaining: number;
    visitsUsed: number;
    visitsPerTerm: number;
  }[];
  dateRange: { from: string | null; to: string | null };
};

type RawReport = {
  data?: {
    counts?: Record<string, number>;
    mrr?: number;
    arr?: number;
    failed_payments?: number;
    revenue_in_range?: number;
    top_plans?: { id: number; name?: string | null; price?: number | string | null }[];
    visits_by_location?: {
      location_id?: number | null;
      location_name?: string | null;
      visits?: number;
    }[];
    underused_sample?: {
      id: number;
      customer_name?: string | null;
      plan_name?: string | null;
      visits_remaining?: number;
      visits_used_this_term?: number;
      visits_per_term?: number;
    }[];
    date_range?: { from?: string | null; to?: string | null };
  };
};

/**
 * GET /api/membership-reports/summary — KPIs, revenue, and engagement for a date
 * range. `from`/`to` default to the current month on the backend when omitted.
 */
export async function fetchMembershipReport({
  token,
  from,
  to,
  locationId,
  signal,
}: {
  token: string;
  from?: string;
  to?: string;
  locationId?: number;
  signal?: AbortSignal;
}): Promise<MembershipReport> {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  if (locationId != null) params.append("location_id", String(locationId));
  const qs = params.toString();

  const res = await apiRequest<RawReport>(
    `/api/membership-reports/summary${qs ? `?${qs}` : ""}`,
    { token, signal },
  );
  const d = res.data ?? {};
  const c = d.counts ?? {};
  return {
    counts: {
      active: c.active ?? 0,
      pastDue: c.past_due ?? 0,
      suspended: c.suspended ?? 0,
      frozen: c.frozen ?? 0,
      canceledInRange: c.canceled_in_range ?? 0,
      newInRange: c.new_in_range ?? 0,
    },
    mrr: Number(d.mrr ?? 0),
    arr: Number(d.arr ?? 0),
    failedPayments: d.failed_payments ?? 0,
    revenueInRange: Number(d.revenue_in_range ?? 0),
    topPlans: (d.top_plans ?? []).map((p) => ({
      id: p.id,
      name: p.name?.trim() || `#${p.id}`,
      price: Number(p.price ?? 0),
    })),
    visitsByLocation: (d.visits_by_location ?? []).map((v) => ({
      locationId: v.location_id ?? null,
      locationName: v.location_name?.trim() || "Unknown",
      visits: Number(v.visits ?? 0),
    })),
    underused: (d.underused_sample ?? []).map((u) => ({
      id: u.id,
      customerName: u.customer_name?.trim() || null,
      planName: u.plan_name?.trim() || null,
      visitsRemaining: Number(u.visits_remaining ?? 0),
      visitsUsed: Number(u.visits_used_this_term ?? 0),
      visitsPerTerm: Number(u.visits_per_term ?? 0),
    })),
    dateRange: { from: d.date_range?.from ?? null, to: d.date_range?.to ?? null },
  };
}

/* ------------------------------------------------------------------ */
/* Check-in (scan + record visit)                                      */
/* ------------------------------------------------------------------ */

/** A redeemable pass surfaced by a scan (from the benefit quote). */
export type ScanPass = { benefitId: number | null; label: string; remaining: number | null };

/** The flattened result of scanning a member QR token. */
export type ScanResult = {
  membershipId: number;
  memberName: string;
  email: string;
  planName: string;
  status: MembershipStatus;
  holderName: string | null;
  homeLocationName: string | null;
  visitsRemaining: number | null;
  eligible: boolean;
  reason: string | null;
  photoRequired: boolean;
  visitsToday: number;
  passes: ScanPass[];
};

type RawScan = {
  data?: {
    membership?: RawMembership & { visits_remaining?: number | null };
    eligibility?: { eligible?: boolean; reason?: string | null; photo_required?: boolean };
    photo_required?: boolean;
    visits_today?: number;
    passes?: {
      benefit_id?: number | null;
      label?: string | null;
      remaining?: number | null;
      passes_remaining?: number | null;
    }[];
  };
};

/**
 * POST /api/memberships/scan — look a member up by QR token and get their
 * eligibility at the given location. Does NOT record a visit (that's check-in).
 */
export async function scanMembership(
  token: string,
  qrToken: string,
  locationId?: number,
): Promise<ScanResult> {
  const res = await apiRequest<RawScan>("/api/memberships/scan", {
    method: "POST",
    token,
    body: { qr_token: qrToken.trim(), location_id: locationId },
  });
  const d = res.data ?? {};
  const m = d.membership;
  if (!m) throw new Error("Membership not found");
  const row = mapMembership(m);
  return {
    membershipId: row.id,
    memberName: row.memberName,
    email: row.memberEmail,
    planName: row.planLabel,
    status: row.status,
    holderName: row.holderName,
    homeLocationName: row.homeLocationName,
    visitsRemaining: m.visits_remaining ?? null,
    eligible: !!d.eligibility?.eligible,
    reason: d.eligibility?.reason ?? null,
    photoRequired: !!(d.photo_required ?? d.eligibility?.photo_required),
    visitsToday: Number(d.visits_today ?? 0),
    passes: (d.passes ?? []).map((p) => ({
      benefitId: p.benefit_id ?? null,
      label: p.label?.trim() || "Pass",
      remaining: p.remaining ?? p.passes_remaining ?? null,
    })),
  };
}

/** How a check-in was resolved (matches the backend `result` enum). */
export type CheckInResult = "allowed" | "denied" | "override";

/**
 * POST /api/memberships/{id}/check-in — record a visit for a scanned member.
 * `override` requires an override note; `denied` accepts an optional reason.
 */
export async function checkInMembership(
  token: string,
  membershipId: number,
  params: {
    result: CheckInResult;
    locationId?: number;
    denialReason?: string;
    overrideNote?: string;
  },
): Promise<void> {
  await apiRequest(`/api/memberships/${membershipId}/check-in`, {
    method: "POST",
    token,
    body: {
      result: params.result,
      location_id: params.locationId,
      denial_reason: params.denialReason,
      override_note: params.overrideNote,
    },
  });
}
