import { ApiError, apiRequest, apiUrl, webUrl } from "../lib/api";
import {
  classifyLookupFailure,
  classifyLookupResponse,
  mapKioskAd,
  mapKioskSettings,
  type KioskAd,
  type KioskSettings,
  type ReturningLookupResult,
} from "../lib/waivers/kioskContract";
import { kioskAccessTokenFrom } from "../lib/waivers/kioskToken";
import type {
  VisitPeriodScope,
  WaiverTimeframe,
} from "../lib/waivers/visitPeriod";

export {
  VISIT_PERIOD_OPTIONS,
  visitPeriodScope,
  type VisitPeriodScope,
  type WaiverTimeframe,
} from "../lib/waivers/visitPeriod";

export {
  adHoldSeconds,
  minorCapReached,
  type KioskAd,
  type KioskSettings,
  type ReturningDependent,
  type ReturningLookupResult,
  type ReturningLookupStatus,
  type ReturningProfile
} from "../lib/waivers/kioskContract";

/* ------------------------------------------------------------------ enums -- */

export type WaiverStatus =
  "pending" | "completed" | "expired" | "replaced" | "deleted";

export type MarketingConsentStatus = "not_opted_in" | "opted_in" | "withdrawn";

export type WaiverSource =
  | "checkout"
  | "confirmation_email"
  | "sms_link"
  | "kiosk"
  | "staff_sent"
  | "bulk_invite";

export type TemplateStatus = "draft" | "active" | "inactive" | "archived";

export type DuplicateRule = "none" | "allow" | "manager_only";

export type ActivityType = "package" | "attraction" | "event" | "party_type";

/** Human labels for waiver sources (mirrors the web `sourceLabels`). */
export const SOURCE_LABELS: Record<WaiverSource, string> = {
  checkout: "Checkout",
  confirmation_email: "Email link",
  sms_link: "SMS link",
  kiosk: "Kiosk",
  staff_sent: "Staff sent",
  bulk_invite: "Group invite",
};

/* --------------------------------------------------------------- domain -- */

export type WaiverMinor = {
  id?: number;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  relationship: string | null;
};

/** A waiver row as rendered in the Records list. */
export type Waiver = {
  id: number;
  status: WaiverStatus;
  selectedDate: string | null;
  adultFirstName: string | null;
  adultLastName: string | null;
  adultName: string;
  adultEmail: string | null;
  adultPhone: string | null;
  marketingConsentStatus: MarketingConsentStatus;
  source: WaiverSource;
  submittedAt: string | null;
  templateId: number | null;
  templateTitle: string | null;
  locationId: number | null;
  locationName: string | null;
  minorsCount: number;
  bookingId: number | null;
  bookingReference: string | null;
  eventId: number | null;
  eventName: string | null;
  attractionPurchaseId: number | null;

  checkedInAt: string | null;
};

/** Full waiver detail (GET /waivers/{id}) backing the detail sheet. */
export type WaiverDetail = Waiver & {
  adultDob: string | null;
  relationship: string | null;
  typedLegalName: string | null;
  agreementAccepted: boolean;
  electronicConsentAccepted: boolean;
  photoVideoConsent: boolean | null;
  minors: WaiverMinor[];
  renderedBody: string;
};

export type WaiverTemplate = {
  id: number;
  companyId: number | null;
  locationId: number | null;
  title: string;
  internalDescription: string | null;
  status: TemplateStatus;
  isDefault: boolean;
  currentVersion: number;
  bodyText: string;
  validityDurationDays: number | null;
  maxMinors: number;
  duplicateRule: DuplicateRule;
  reminderEligible: boolean;
  assignedPackageIds: number[];
  assignedAttractionIds: number[];
  assignedEventIds: number[];
  minorSectionEnabled: boolean;
  dobRequired: boolean;
  relationshipRequired: boolean;
  photoVideoReleaseEnabled: boolean;
  /** Custom release wording; null/empty means "use the default text". */
  photoVideoReleaseText: string | null;
  medicalAckEnabled: boolean;
  propertyDamageEnabled: boolean;
  groupLeaderClauseEnabled: boolean;
  electronicConsentEnabled: boolean;
  marketingConsentEnabled: boolean;
  marketingConsentText: string | null;
  marketingHelperText: string | null;
  attorneyReviewed: boolean;
  updatedAt: string | null;
  deletedAt: string | null;
  assignmentCount: number;
};

export type GroupInvite = {
  id: number;
  chaperoneName: string;
  chaperoneEmail: string | null;
  chaperonePhone: string | null;
  selectedDate: string | null;
  manageToken: string;
  shareableToken: string | null;
  allowShareableLink: boolean;
  status: string;
  templateId: number | null;
  templateTitle: string | null;
  locationId: number | null;
  locationName: string | null;
  recipientsCount: number;
  completeCount: number;
};

/** Company-level waiver settings (permission flags + company-wide defaults). */
export type WaiverSettings = {
  // Validity & duplicates
  defaultValidityDays: number | null;
  waiversExpire: boolean;
  defaultExpirationDays: number | null;
  requireNewOnTextChange: boolean;
  defaultDuplicateRule: DuplicateRule;
  // Reminders & confirmations
  reminderWindowHours: number;
  alwaysIncludeLinkInConfirmation: boolean;
  // Search & kiosk
  searchAutoRefreshSeconds: number;
  kioskInactivityTimeoutSeconds: number;
  kioskDisableAutofill: boolean;
  // Permissions
  adminDeleteEnabled: boolean;
  managerPrintExportEnabled: boolean;
  managerCanBuildTemplates: boolean;
  managerCanViewDeletionLog: boolean;
  // Marketing & CRM
  marketingConsentEnabled: boolean;
  crmSyncOnlyWhenConsented: boolean;
  minorMarketingDisabled: boolean;
};

/* ------------------------------------------------------------- raw types -- */

type RawMinor = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  relationship?: string | null;
};

type RawWaiver = {
  id: number;
  status?: WaiverStatus;
  selected_date?: string | null;
  adult_first_name?: string | null;
  adult_last_name?: string | null;
  adult_email?: string | null;
  adult_phone?: string | null;
  adult_dob?: string | null;
  relationship?: string | null;
  typed_legal_name?: string | null;
  agreement_accepted?: boolean;
  electronic_consent_accepted?: boolean;
  photo_video_consent?: boolean | null;
  marketing_consent_status?: MarketingConsentStatus;
  source?: WaiverSource;
  submitted_at?: string | null;
  checked_in_at?: string | null;
  template?: { id?: number; title?: string } | null;
  location?: { id?: number; name?: string } | null;
  minors?: RawMinor[] | null;
  booking?: { id?: number; reference_number?: string } | null;
  attraction_purchase?: { id?: number } | null;
  event?: { id?: number; name?: string } | null;
};

type RawTemplate = {
  id: number;
  company_id?: number | null;
  location_id?: number | null;
  title?: string;
  internal_description?: string | null;
  status?: TemplateStatus;
  is_default?: boolean;
  current_version?: number;
  body_text?: string;
  validity_duration_days?: number | null;
  max_minors?: number;
  duplicate_rule?: DuplicateRule;
  reminder_eligible?: boolean;
  assigned_package_ids?: number[] | null;
  assigned_attraction_ids?: number[] | null;
  assigned_event_ids?: number[] | null;
  minor_section_enabled?: boolean;
  dob_required?: boolean;
  relationship_required?: boolean;
  photo_video_release_enabled?: boolean;
  photo_video_release_text?: string | null;
  medical_ack_enabled?: boolean;
  property_damage_enabled?: boolean;
  group_leader_clause_enabled?: boolean;
  electronic_consent_enabled?: boolean;
  marketing_consent_enabled?: boolean;
  marketing_consent_text?: string | null;
  marketing_helper_text?: string | null;
  attorney_reviewed?: boolean;
  updated_at?: string | null;
  deleted_at?: string | null;
};

type RawInvite = {
  id: number;
  chaperone_name?: string;
  chaperone_email?: string | null;
  chaperone_phone?: string | null;
  selected_date?: string | null;
  manage_token?: string;
  shareable_token?: string | null;
  allow_shareable_link?: boolean;
  status?: string;
  template?: { id?: number; title?: string } | null;
  location?: { id?: number; name?: string } | null;
  recipients_count?: number;
  complete_count?: number;
};

type Pagination = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

type WaiversListResponse = {
  success: boolean;
  data: { waivers: RawWaiver[]; pagination: Pagination };
};

type WaiverDetailResponse = {
  success: boolean;
  data: { waiver: RawWaiver; rendered_body?: string };
};

type TemplatesListResponse = {
  success: boolean;
  data: { waiver_templates: RawTemplate[]; pagination: Pagination };
};

type TemplateResponse = { success: boolean; data: RawTemplate };

type InvitesListResponse = {
  success: boolean;
  data: { bulk_invites: RawInvite[]; pagination: Pagination };
};

/* ---------------------------------------------------------------- mappers -- */

const num = (v: unknown, fallback = 0) =>
  v == null || v === "" ? fallback : Number(v);

function fullName(first?: string | null, last?: string | null): string {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || "—";
}

function mapMinor(raw: RawMinor): WaiverMinor {
  return {
    id: raw.id,
    firstName: raw.first_name?.trim() || "",
    lastName: raw.last_name?.trim() || "",
    dateOfBirth: raw.date_of_birth ?? null,
    relationship: raw.relationship ?? null,
  };
}

function mapWaiver(raw: RawWaiver): Waiver {
  return {
    id: raw.id,
    status: raw.status ?? "pending",
    selectedDate: raw.selected_date ?? null,
    adultFirstName: raw.adult_first_name ?? null,
    adultLastName: raw.adult_last_name ?? null,
    adultName: fullName(raw.adult_first_name, raw.adult_last_name),
    adultEmail: raw.adult_email ?? null,
    adultPhone: raw.adult_phone ?? null,
    marketingConsentStatus: raw.marketing_consent_status ?? "not_opted_in",
    source: raw.source ?? "checkout",
    submittedAt: raw.submitted_at ?? null,
    templateId: raw.template?.id ?? null,
    templateTitle: raw.template?.title ?? null,
    locationId: raw.location?.id ?? null,
    locationName: raw.location?.name?.trim() || null,
    minorsCount: raw.minors?.length ?? 0,
    bookingId: raw.booking?.id ?? null,
    bookingReference: raw.booking?.reference_number ?? null,
    eventId: raw.event?.id ?? null,
    eventName: raw.event?.name ?? null,
    attractionPurchaseId: raw.attraction_purchase?.id ?? null,
    checkedInAt: raw.checked_in_at ?? null,
  };
}

function mapWaiverDetail(raw: RawWaiver, renderedBody: string): WaiverDetail {
  return {
    ...mapWaiver(raw),
    adultDob: raw.adult_dob ?? null,
    relationship: raw.relationship ?? null,
    typedLegalName: raw.typed_legal_name ?? null,
    agreementAccepted: !!raw.agreement_accepted,
    electronicConsentAccepted: !!raw.electronic_consent_accepted,
    photoVideoConsent: raw.photo_video_consent ?? null,
    minors: (raw.minors ?? []).map(mapMinor),
    renderedBody,
  };
}

function mapTemplate(raw: RawTemplate): WaiverTemplate {
  const assignmentCount =
    (raw.assigned_package_ids?.length ?? 0) +
    (raw.assigned_attraction_ids?.length ?? 0) +
    (raw.assigned_event_ids?.length ?? 0);
  return {
    id: raw.id,
    companyId: raw.company_id ?? null,
    locationId: raw.location_id ?? null,
    title: raw.title?.trim() || "Untitled template",
    internalDescription: raw.internal_description ?? null,
    status: raw.status ?? "draft",
    isDefault: !!raw.is_default,
    currentVersion: num(raw.current_version, 1),
    bodyText: raw.body_text ?? "",
    validityDurationDays: raw.validity_duration_days ?? null,
    maxMinors: num(raw.max_minors, 10),
    duplicateRule: raw.duplicate_rule ?? "manager_only",
    reminderEligible: raw.reminder_eligible ?? true,
    assignedPackageIds: raw.assigned_package_ids ?? [],
    assignedAttractionIds: raw.assigned_attraction_ids ?? [],
    assignedEventIds: raw.assigned_event_ids ?? [],
    minorSectionEnabled: raw.minor_section_enabled ?? true,
    dobRequired: !!raw.dob_required,
    relationshipRequired: !!raw.relationship_required,
    photoVideoReleaseEnabled: !!raw.photo_video_release_enabled,
    photoVideoReleaseText: raw.photo_video_release_text ?? null,
    medicalAckEnabled: !!raw.medical_ack_enabled,
    propertyDamageEnabled: !!raw.property_damage_enabled,
    groupLeaderClauseEnabled: !!raw.group_leader_clause_enabled,
    electronicConsentEnabled: raw.electronic_consent_enabled ?? true,
    marketingConsentEnabled: !!raw.marketing_consent_enabled,
    marketingConsentText: raw.marketing_consent_text ?? null,
    marketingHelperText: raw.marketing_helper_text ?? null,
    attorneyReviewed: !!raw.attorney_reviewed,
    updatedAt: raw.updated_at ?? null,
    deletedAt: raw.deleted_at ?? null,
    assignmentCount,
  };
}

function mapInvite(raw: RawInvite): GroupInvite {
  return {
    id: raw.id,
    chaperoneName: raw.chaperone_name?.trim() || "—",
    chaperoneEmail: raw.chaperone_email ?? null,
    chaperonePhone: raw.chaperone_phone ?? null,
    selectedDate: raw.selected_date ?? null,
    manageToken: raw.manage_token ?? "",
    shareableToken: raw.shareable_token ?? null,
    allowShareableLink: !!raw.allow_shareable_link,
    status: raw.status ?? "sent",
    templateId: raw.template?.id ?? null,
    templateTitle: raw.template?.title ?? null,
    locationId: raw.location?.id ?? null,
    locationName: raw.location?.name?.trim() || null,
    recipientsCount: num(raw.recipients_count, 0),
    completeCount: num(raw.complete_count, 0),
  };
}

/* ------------------------------------------------------- Waiver Records -- */

/**
 * Write the date half of a request. The precedence — `all`, then a timeframe,
 * then a single day — is the web's, and matters: sending a timeframe alongside
 * `date` would leave the server's single-day fallback unreachable. Shared by the
 * list and the period summary so the two always ask for the same window.
 */
function appendVisitPeriod(
  params: URLSearchParams,
  scope: VisitPeriodScope & { date?: string },
): void {
  if (scope.all) {
    params.append("all", "1");
    return;
  }
  if (scope.timeframe) {
    params.append("timeframe", scope.timeframe);
    if (scope.timeframe === "custom") {
      if (scope.startDate) params.append("start_date", scope.startDate);
      if (scope.endDate) params.append("end_date", scope.endDate);
    }
    return;
  }
  if (scope.date) params.append("date", scope.date);
}

export type WaiverSearchFilters = {
  status?: WaiverStatus;
  /** `all=1` ignores the date filter (browse across all dates). */
  all?: boolean;
  /**
   * A visit period, resolved by the same server helper the dashboard card uses
   * so the two cannot disagree. Takes precedence over `date`.
   */
  timeframe?: WaiverTimeframe;
  /** Both required by `timeframe: "custom"`; ignored otherwise. YYYY-MM-DD. */
  startDate?: string;
  endDate?: string;
  /** A single venue day. The server's fallback when no timeframe is sent. */
  date?: string;
  adultName?: string;
  email?: string;
  phone?: string;
  bookingId?: number;
  eventId?: number;
  customerId?: number;
  source?: WaiverSource;
  marketingConsentStatus?: MarketingConsentStatus;
};

export type WaiverListResult = {
  waivers: Waiver[];
  total: number;
  currentPage: number;
  lastPage: number;
};

function buildWaiverParams(
  filters: WaiverSearchFilters,
  page: number,
  perPage: number,
): URLSearchParams {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });
  appendVisitPeriod(params, filters);
  if (filters.status) params.append("status", filters.status);
  if (filters.adultName?.trim())
    params.append("adult_name", filters.adultName.trim());
  if (filters.email?.trim()) params.append("email", filters.email.trim());
  if (filters.phone?.trim()) params.append("phone", filters.phone.trim());
  if (filters.bookingId != null)
    params.append("booking_id", String(filters.bookingId));
  if (filters.eventId != null)
    params.append("event_id", String(filters.eventId));
  if (filters.customerId != null)
    params.append("customer_id", String(filters.customerId));
  if (filters.source) params.append("source", filters.source);
  if (filters.marketingConsentStatus)
    params.append("marketing_consent_status", filters.marketingConsentStatus);
  return params;
}

/** GET /api/waivers — one page of records (server-side filtered + paged). */
export async function fetchWaivers(
  token: string,
  filters: WaiverSearchFilters,
  page = 1,
  perPage = 25,
  signal?: AbortSignal,
): Promise<WaiverListResult> {
  const params = buildWaiverParams(filters, page, perPage);
  const res = await apiRequest<WaiversListResponse>(
    `/api/waivers?${params.toString()}`,
    { token, signal },
  );
  const pg = res?.data?.pagination;
  return {
    waivers: (res?.data?.waivers ?? []).map(mapWaiver),
    total: pg?.total ?? 0,
    currentPage: pg?.current_page ?? page,
    lastPage: pg?.last_page ?? page,
  };
}

/**
 * Total record count for a given status across all dates. Uses a `per_page=1`
 * request and reads `pagination.total` — cheap, and lets the mobile KPI cards
 * show accurate per-status counts (the web has no waiver KPIs; this is a mobile
 * adaptation that adds no heavy endpoints).
 */
export async function fetchWaiverCount(
  token: string,
  status: WaiverStatus,
  signal?: AbortSignal,
): Promise<number> {
  const params = buildWaiverParams({ all: true, status }, 1, 1);
  const res = await apiRequest<WaiversListResponse>(
    `/api/waivers?${params.toString()}`,
    { token, signal },
  );
  return res?.data?.pagination?.total ?? 0;
}

/**
 * The waiver figures for a period, counted the way the company dashboard counts
 * them — deliberately ignoring the list's status filter, so "total" reconciles
 * with the dashboard's waiver card. Same endpoint the web Records page uses for
 * its "This period, all statuses" line.
 */
export type WaiverPeriodSummary = {
  total: number;
  /** Signed waivers ("completed"). */
  completed: number;
  pending: number;
  checkedIn: number;
  minorsCovered: number;
  peopleCovered: number;
  /**
   * The covered minors' ages as of each waiver's own date, bucketed. The four
   * minor brackets are always present (zeros included); an extra "18+" bucket
   * appears only when a listed minor had already turned 18 by signing.
   */
  minorAgeBrackets: WaiverAgeBracket[];
};

/** One age bucket and how many people fell into it. */
export type WaiverAgeBracket = {
  bracket: string;
  count: number;
};

type WaiverPeriodSummaryResponse = {
  success?: boolean;
  data?: {
    total?: number | string | null;
    completed?: number | string | null;
    pending?: number | string | null;
    checked_in?: number | string | null;
    minors_covered?: number | string | null;
    people_covered?: number | string | null;
    minor_age_brackets?:
      { bracket?: string | null; count?: number | string | null }[] | null;
  } | null;
};

/** The date scope to summarise — the same one the list request is using. */
export type WaiverPeriodScope = {
  /** True for "All Time"; the backend then ignores the date window. */
  all?: boolean;
  /** A visit period, resolved server-side exactly as the list resolves it. */
  timeframe?: WaiverTimeframe;
  /** Both required by `timeframe: "custom"`. YYYY-MM-DD. */
  startDate?: string;
  endDate?: string;
  /** A single venue day (YYYY-MM-DD), used when neither of the above is set. */
  date?: string;
  /** Narrow to one location; omit for every location the user can read. */
  locationId?: number;
};

/**
 * GET /api/waivers/period-summary — the period counts for the summary line.
 * Returns null when the backend reports failure, so the caller can just hide
 * the line rather than render zeros as if they were real counts.
 */
export async function fetchWaiverPeriodSummary(
  token: string,
  scope: WaiverPeriodScope,
  signal?: AbortSignal,
): Promise<WaiverPeriodSummary | null> {
  const params = new URLSearchParams();
  appendVisitPeriod(params, scope);
  if (scope.locationId != null)
    params.append("location_id", String(scope.locationId));

  const query = params.toString();
  const res = await apiRequest<WaiverPeriodSummaryResponse>(
    `/api/waivers/period-summary${query ? `?${query}` : ""}`,
    { token, signal },
  );
  const data = res?.data;
  if (res?.success === false || !data) return null;

  const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
  return {
    total: num(data.total),
    completed: num(data.completed),
    pending: num(data.pending),
    checkedIn: num(data.checked_in),
    minorsCovered: num(data.minors_covered),
    peopleCovered: num(data.people_covered),
    // Zero buckets are kept, matching the web line and the dashboard card, so
    // the four brackets stay in a stable order instead of reflowing as counts
    // change. The caller decides whether an all-zero breakdown is worth showing.
    minorAgeBrackets: (data.minor_age_brackets ?? [])
      .map((b) => ({ bracket: b.bracket?.trim() || "", count: num(b.count) }))
      .filter((b) => b.bracket),
  };
}

/** GET /api/waivers/{id} — full record + rendered legal body. */
export async function fetchWaiverDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<WaiverDetail> {
  const res = await apiRequest<WaiverDetailResponse>(`/api/waivers/${id}`, {
    token,
    signal,
  });
  return mapWaiverDetail(res.data.waiver, res.data.rendered_body ?? "");
}

export type AssignWaiverInput = {
  waiverTemplateId: number;
  selectedDate: string;
  adultEmail?: string;
  adultPhone?: string;
  activityName?: string;
  locationId?: number;
  bookingId?: number;
  eventId?: number;
  attractionPurchaseId?: number;
  customerId?: number;
};

/* --------------------------------------------------- purchase link search -- */

/** The three transaction types a waiver can be tied to (mirrors the web). */
export type PurchaseLinkType =
  "booking" | "attraction_purchase" | "event_purchase";

/** A single searchable transaction the waiver can link to. */
export type PurchaseLink = {
  type: PurchaseLinkType;
  /** booking id / attraction-purchase id / event-purchase id. */
  id: number;
  /** For event purchases, the underlying event id (sent as `event_id`). */
  eventId?: number;
  /** Guest name (or email fallback). */
  name: string;
  /** Reference / date / activity summary line. */
  sub: string;
  /** Booking/purchase date (YYYY-MM-DD) used to prefill the visit date. */
  date: string | null;
};

type RawLinkParty = {
  id?: number;
  event_id?: number | null;
  reference_number?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  booking_date?: string | null;
  purchase_date?: string | null;
  package?: { name?: string | null } | null;
  attraction?: { name?: string | null } | null;
  event?: { name?: string | null } | null;
};

const joinSub = (...parts: (string | null | undefined)[]) =>
  parts.filter((p) => !!p && String(p).trim()).join(" · ");

/**
 * Search bookings / attraction purchases / event purchases by ref # or guest
 * name for the "Link to purchase" picker. Mirrors the web AssignWaiverModal:
 * bookings hit /api/bookings/search; purchases pass `search` + `per_page`.
 */
export async function searchPurchaseLinks(
  token: string,
  type: PurchaseLinkType,
  query: string,
  signal?: AbortSignal,
): Promise<PurchaseLink[]> {
  const q = query.trim();
  if (!q) return [];

  if (type === "booking") {
    const res = await apiRequest<{ success?: boolean; data?: RawLinkParty[] }>(
      `/api/bookings/search?query=${encodeURIComponent(q)}`,
      { token, signal },
    );
    return (res?.data ?? []).slice(0, 8).map((d) => ({
      type,
      id: d.id ?? 0,
      name: d.guest_name || d.guest_email || "—",
      sub: joinSub(d.reference_number, d.booking_date, d.package?.name),
      date: d.booking_date ?? null,
    }));
  }

  if (type === "attraction_purchase") {
    const params = new URLSearchParams({ search: q, per_page: "8" });
    const res = await apiRequest<{
      success?: boolean;
      data?: { purchases?: RawLinkParty[] };
    }>(`/api/attraction-purchases?${params.toString()}`, { token, signal });
    return (res?.data?.purchases ?? []).map((d) => ({
      type,
      id: d.id ?? 0,
      name: d.guest_name || d.guest_email || "—",
      sub: joinSub(`#${d.id}`, d.purchase_date, d.attraction?.name),
      date: d.purchase_date ?? null,
    }));
  }

  const params = new URLSearchParams({ search: q, per_page: "8" });
  const res = await apiRequest<{ success?: boolean; data?: RawLinkParty[] }>(
    `/api/event-purchases?${params.toString()}`,
    { token, signal },
  );
  return (res?.data ?? []).map((d) => ({
    type,
    id: d.id ?? 0,
    eventId: d.event_id ?? undefined,
    name: d.guest_name || d.guest_email || "—",
    sub: joinSub(d.reference_number, d.purchase_date, d.event?.name),
    date: d.purchase_date ?? null,
  }));
}

/** POST /api/waivers/assign — create a pending, staff-sent waiver + send link. */
export async function assignWaiver(
  token: string,
  input: AssignWaiverInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    waiver_template_id: input.waiverTemplateId,
    selected_date: input.selectedDate,
  };
  if (input.adultEmail?.trim()) body.adult_email = input.adultEmail.trim();
  if (input.adultPhone?.trim()) body.adult_phone = input.adultPhone.trim();
  if (input.activityName?.trim())
    body.activity_name = input.activityName.trim();
  if (input.locationId != null) body.location_id = input.locationId;
  if (input.bookingId != null) body.booking_id = input.bookingId;
  if (input.eventId != null) body.event_id = input.eventId;
  if (input.attractionPurchaseId != null)
    body.attraction_purchase_id = input.attractionPurchaseId;
  if (input.customerId != null) body.customer_id = input.customerId;
  await apiRequest(`/api/waivers/assign`, { method: "POST", token, body });
}

/** DELETE /api/waivers/{id} — soft-delete with an audit reason (admin only). */
export async function deleteWaiver(
  token: string,
  id: number,
  reason?: string,
): Promise<void> {
  await apiRequest(`/api/waivers/${id}`, {
    method: "DELETE",
    token,
    body: { reason: reason ?? "" },
  });
}

/* ----------------------------------------------------- Waiver Templates -- */

export type TemplateListFilters = {
  status?: TemplateStatus;
  search?: string;
  trashed?: boolean;
};

/** GET /api/waiver-templates — active or trashed templates (per_page=100). */
export async function fetchTemplates(
  token: string,
  filters: TemplateListFilters = {},
  signal?: AbortSignal,
): Promise<WaiverTemplate[]> {
  const params = new URLSearchParams({ per_page: "100" });
  if (filters.trashed) params.append("trashed", "1");
  if (filters.status) params.append("status", filters.status);
  if (filters.search?.trim()) params.append("search", filters.search.trim());
  const res = await apiRequest<TemplatesListResponse>(
    `/api/waiver-templates?${params.toString()}`,
    { token, signal },
  );
  return (res?.data?.waiver_templates ?? []).map(mapTemplate);
}

/** GET /api/waiver-templates/{id}. */
export async function fetchTemplateDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<WaiverTemplate> {
  const res = await apiRequest<TemplateResponse>(
    `/api/waiver-templates/${id}`,
    { token, signal },
  );
  return mapTemplate(res.data);
}

/** Fields writable on create/update — snake_case as the backend expects. */
export type TemplatePayload = {
  title: string;
  body_text: string;
  internal_description?: string | null;
  status?: TemplateStatus;
  is_default?: boolean;
  location_id?: number | null;
  validity_duration_days?: number | null;
  max_minors?: number;
  duplicate_rule?: DuplicateRule;
  reminder_eligible?: boolean;
  minor_section_enabled?: boolean;
  dob_required?: boolean;
  relationship_required?: boolean;
  photo_video_release_enabled?: boolean;
  photo_video_release_text?: string | null;
  medical_ack_enabled?: boolean;
  property_damage_enabled?: boolean;
  group_leader_clause_enabled?: boolean;
  electronic_consent_enabled?: boolean;
  marketing_consent_enabled?: boolean;
  marketing_consent_text?: string | null;
  marketing_helper_text?: string | null;
  assigned_package_ids?: number[];
  assigned_attraction_ids?: number[];
  assigned_event_ids?: number[];
};

/** POST /api/waiver-templates. */
export async function createTemplate(
  token: string,
  payload: TemplatePayload,
): Promise<WaiverTemplate> {
  const res = await apiRequest<TemplateResponse>(`/api/waiver-templates`, {
    method: "POST",
    token,
    body: payload,
  });
  return mapTemplate(res.data);
}

/** PUT /api/waiver-templates/{id}. */
export async function updateTemplate(
  token: string,
  id: number,
  payload: Partial<TemplatePayload>,
): Promise<WaiverTemplate> {
  const res = await apiRequest<TemplateResponse>(
    `/api/waiver-templates/${id}`,
    { method: "PUT", token, body: payload },
  );
  return mapTemplate(res.data);
}

/** DELETE /api/waiver-templates/{id} — soft delete. */
export async function deleteTemplate(token: string, id: number): Promise<void> {
  await apiRequest(`/api/waiver-templates/${id}`, { method: "DELETE", token });
}

/** POST /api/waiver-templates/{id}/restore. */
export async function restoreTemplate(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/waiver-templates/${id}/restore`, {
    method: "POST",
    token,
    body: {},
  });
}

/** DELETE /api/waiver-templates/{id}/force-delete — permanent (admin only). */
export async function forceDeleteTemplate(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/waiver-templates/${id}/force-delete`, {
    method: "DELETE",
    token,
  });
}

/** PATCH /api/waiver-templates/{id}/status. */
export async function setTemplateStatus(
  token: string,
  id: number,
  status: TemplateStatus,
): Promise<void> {
  await apiRequest(`/api/waiver-templates/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
}

export type AvailableActivity = {
  id: number;
  name: string;
  locationId: number | null;
  locationName: string | null;
};

/** GET /api/waiver-templates/available-activities — assignable, unclaimed items. */
export async function fetchAvailableActivities(
  token: string,
  type: ActivityType,
  exceptTemplateId?: number,
  signal?: AbortSignal,
): Promise<AvailableActivity[]> {
  const params = new URLSearchParams({ type });
  if (exceptTemplateId != null)
    params.append("except_template_id", String(exceptTemplateId));
  const res = await apiRequest<{
    success: boolean;
    data: {
      available?: {
        id: number;
        name?: string;
        location_id?: number | null;
        location_name?: string | null;
      }[];
    };
  }>(`/api/waiver-templates/available-activities?${params.toString()}`, {
    token,
    signal,
  });
  return (res?.data?.available ?? []).map((a) => ({
    id: a.id,
    name: a.name?.trim() || `#${a.id}`,
    locationId: a.location_id ?? null,
    locationName: a.location_name ?? null,
  }));
}

/** GET /api/waiver-templates/content-tokens — merge-tag map for the builder. */
export async function fetchContentTokens(
  token: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const res = await apiRequest<{
    success: boolean;
    data: Record<string, string>;
  }>(`/api/waiver-templates/content-tokens`, { token, signal });
  return res?.data ?? {};
}

/* -------------------------------------------------------- Group Invites -- */

/** GET /api/waiver-bulk-invites — group (chaperone) invites. */
export async function fetchGroupInvites(
  token: string,
  signal?: AbortSignal,
): Promise<GroupInvite[]> {
  const params = new URLSearchParams({ per_page: "100" });
  const res = await apiRequest<InvitesListResponse>(
    `/api/waiver-bulk-invites?${params.toString()}`,
    { token, signal },
  );
  return (res?.data?.bulk_invites ?? []).map(mapInvite);
}

export type CreateGroupInviteInput = {
  waiverTemplateId: number;
  selectedDate: string;
  chaperoneName: string;
  chaperoneEmail?: string;
  chaperonePhone?: string;
  allowShareableLink?: boolean;
  locationId?: number;
  bookingId?: number;
  eventId?: number;
};

/** POST /api/waiver-bulk-invites — create + notify the chaperone. */
export async function createGroupInvite(
  token: string,
  input: CreateGroupInviteInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    waiver_template_id: input.waiverTemplateId,
    selected_date: input.selectedDate,
    chaperone_name: input.chaperoneName.trim(),
    allow_shareable_link: !!input.allowShareableLink,
  };
  if (input.chaperoneEmail?.trim())
    body.chaperone_email = input.chaperoneEmail.trim();
  if (input.chaperonePhone?.trim())
    body.chaperone_phone = input.chaperonePhone.trim();
  if (input.locationId != null) body.location_id = input.locationId;
  if (input.bookingId != null) body.booking_id = input.bookingId;
  if (input.eventId != null) body.event_id = input.eventId;
  await apiRequest(`/api/waiver-bulk-invites`, { method: "POST", token, body });
}

/** POST /api/waiver-bulk-invites/{id}/resend — re-notify the chaperone. */
export async function resendGroupInvite(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/waiver-bulk-invites/${id}/resend`, {
    method: "POST",
    token,
    body: {},
  });
}

/* -------------------------------------------------------------- Reports -- */

/** The MVP report kinds the backend dispatches (mirrors the web `REPORT_TYPES`). */
export type WaiverReportType =
  | "completed-by-date"
  | "missing"
  | "bulk-completion"
  | "by-event"
  | "by-template"
  | "by-source"
  | "marketing-consent"
  | "deleted";

/** Which report types accept a start/end date filter (others ignore it). */
export const DATED_REPORT_TYPES: readonly WaiverReportType[] = [
  "completed-by-date",
  "missing",
  "by-event",
  "by-template",
  "by-source",
  "marketing-consent",
];

/**
 * Report payloads are shape-per-type (an array of rows, an object with an
 * `items` array + count, or a flat count map for marketing-consent). The screen
 * narrows on `type`; the service passes the `data` node through untouched so it
 * always matches the web admin's `/waivers/reports/{type}` contract.
 */
export async function fetchWaiverReport(
  token: string,
  type: WaiverReportType,
  range: { startDate?: string; endDate?: string } = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const params = new URLSearchParams();
  if (range.startDate && range.endDate) {
    params.append("start_date", range.startDate);
    params.append("end_date", range.endDate);
  }
  const qs = params.toString();
  const res = await apiRequest<{
    success: boolean;
    type: string;
    data: unknown;
  }>(`/api/waivers/reports/${type}${qs ? `?${qs}` : ""}`, { token, signal });
  return res?.data ?? null;
}

/* --------------------------------------------------------- Deletion Log -- */

/** One row of the waiver deletion audit trail (GET /api/waivers/deletion-log). */
export type WaiverDeletionLogEntry = {
  id: number;
  waiverId: number;
  reason: string | null;
  deletedBy: string | null;
  deletedAt: string | null;
  guestName: string | null;
  selectedDate: string | null;
  status: string | null;
};

type RawDeletionLog = {
  id: number;
  waiver_id?: number;
  reason?: string | null;
  created_at?: string | null;
  deleter?: { first_name?: string | null; last_name?: string | null } | null;
  snapshot?: {
    adult_name?: string | null;
    selected_date?: string | null;
    status?: string | null;
  } | null;
};

type DeletionLogResponse = {
  success: boolean;
  data: { logs: RawDeletionLog[]; pagination: Pagination };
};

function mapDeletionLog(raw: RawDeletionLog): WaiverDeletionLogEntry {
  const deleter = fullName(raw.deleter?.first_name, raw.deleter?.last_name);
  return {
    id: raw.id,
    waiverId: num(raw.waiver_id, 0),
    reason: raw.reason?.trim() || null,
    deletedBy: deleter === "—" ? null : deleter,
    deletedAt: raw.created_at ?? null,
    guestName: raw.snapshot?.adult_name?.trim() || null,
    selectedDate: raw.snapshot?.selected_date ?? null,
    status: raw.snapshot?.status ?? null,
  };
}

/**
 * GET /api/waivers/deletion-log — audit trail of deleted waivers, newest first.
 * Admin-only (or a manager when `manager_can_view_deletion_log`); a 403 surfaces
 * as an ApiError the caller can show as a permission message. Fetches a large
 * page so the shared client-side `Pagination` can slice it (per the app pattern).
 */
export async function fetchDeletionLog(
  token: string,
  perPage = 200,
  signal?: AbortSignal,
): Promise<WaiverDeletionLogEntry[]> {
  const params = new URLSearchParams({ per_page: String(perPage) });
  const res = await apiRequest<DeletionLogResponse>(
    `/api/waivers/deletion-log?${params.toString()}`,
    { token, signal },
  );
  return (res?.data?.logs ?? []).map(mapDeletionLog);
}

/* ------------------------------------------------------------- Settings -- */

type RawWaiverSettings = {
  default_validity_days?: number | null;
  waivers_expire?: boolean;
  default_expiration_days?: number | null;
  require_new_on_text_change?: boolean;
  default_duplicate_rule?: DuplicateRule;
  reminder_window_hours?: number;
  always_include_link_in_confirmation?: boolean;
  search_auto_refresh_seconds?: number;
  kiosk_inactivity_timeout_seconds?: number;
  kiosk_disable_autofill?: boolean;
  admin_delete_enabled?: boolean;
  manager_print_export_enabled?: boolean;
  manager_can_build_templates?: boolean;
  manager_can_view_deletion_log?: boolean;
  marketing_consent_enabled?: boolean;
  crm_sync_only_when_consented?: boolean;
  minor_marketing_disabled?: boolean;
};

/** Map the raw API payload → the camelCased WaiverSettings shape. */
function mapWaiverSettings(d: RawWaiverSettings): WaiverSettings {
  return {
    defaultValidityDays: d.default_validity_days ?? null,
    waiversExpire: d.waivers_expire ?? true,
    defaultExpirationDays: d.default_expiration_days ?? null,
    requireNewOnTextChange: d.require_new_on_text_change ?? true,
    defaultDuplicateRule: d.default_duplicate_rule ?? "manager_only",
    reminderWindowHours: d.reminder_window_hours ?? 24,
    alwaysIncludeLinkInConfirmation:
      d.always_include_link_in_confirmation ?? true,
    searchAutoRefreshSeconds: d.search_auto_refresh_seconds ?? 30,
    kioskInactivityTimeoutSeconds: d.kiosk_inactivity_timeout_seconds ?? 60,
    kioskDisableAutofill: d.kiosk_disable_autofill ?? true,
    adminDeleteEnabled: d.admin_delete_enabled ?? true,
    managerPrintExportEnabled: d.manager_print_export_enabled ?? true,
    managerCanBuildTemplates: d.manager_can_build_templates ?? false,
    managerCanViewDeletionLog: d.manager_can_view_deletion_log ?? false,
    marketingConsentEnabled: d.marketing_consent_enabled ?? true,
    crmSyncOnlyWhenConsented: d.crm_sync_only_when_consented ?? true,
    minorMarketingDisabled: d.minor_marketing_disabled ?? true,
  };
}

/** GET /api/waiver-settings — company permission flags + company-wide defaults. */
export async function fetchWaiverSettings(
  token: string,
  signal?: AbortSignal,
): Promise<WaiverSettings> {
  const res = await apiRequest<{ success: boolean; data: RawWaiverSettings }>(
    `/api/waiver-settings`,
    { token, signal },
  );
  return mapWaiverSettings(res?.data ?? {});
}

/** PUT /api/waiver-settings — save company-wide waiver defaults (admin only). */
export async function updateWaiverSettings(
  token: string,
  input: WaiverSettings,
): Promise<WaiverSettings> {
  const body: RawWaiverSettings = {
    default_validity_days: input.defaultValidityDays,
    waivers_expire: input.waiversExpire,
    default_expiration_days: input.defaultExpirationDays,
    require_new_on_text_change: input.requireNewOnTextChange,
    default_duplicate_rule: input.defaultDuplicateRule,
    reminder_window_hours: input.reminderWindowHours,
    always_include_link_in_confirmation: input.alwaysIncludeLinkInConfirmation,
    search_auto_refresh_seconds: input.searchAutoRefreshSeconds,
    kiosk_inactivity_timeout_seconds: input.kioskInactivityTimeoutSeconds,
    kiosk_disable_autofill: input.kioskDisableAutofill,
    admin_delete_enabled: input.adminDeleteEnabled,
    manager_print_export_enabled: input.managerPrintExportEnabled,
    manager_can_build_templates: input.managerCanBuildTemplates,
    manager_can_view_deletion_log: input.managerCanViewDeletionLog,
    marketing_consent_enabled: input.marketingConsentEnabled,
    crm_sync_only_when_consented: input.crmSyncOnlyWhenConsented,
    minor_marketing_disabled: input.minorMarketingDisabled,
  };
  const res = await apiRequest<{ success: boolean; data: RawWaiverSettings }>(
    `/api/waiver-settings`,
    { method: "PUT", token, body },
  );
  return mapWaiverSettings(res?.data ?? body);
}

/* --------------------------------------------- Entity waiver connections -- */

/** The entity kinds a waiver can be connected to (mirrors the web panel). */
export type WaiverEntityType =
  "booking" | "attraction_purchase" | "event_purchase" | "customer";

/** One waiver connected to an entity (flattened GET /api/waivers/for row). */
export type ConnectedWaiver = {
  id: number;
  status: WaiverStatus;
  adultName: string;
  template: string | null;
  selectedDate: string | null;
  submittedAt: string | null;
  minors: string[];
  /** Whether the participant has been checked in (distinct from waiver signed). */
  checkedIn: boolean;
  checkedInAt: string | null;
  /**
   * Public completion link (`/waiver/{token}`). The backend only returns one for
   * pending waivers — completed records have no link left to share, so the UI
   * hides "Copy link" when this is null (same rule as the web panel).
   */
  signingUrl: string | null;
};

/** Connected-waiver summary + list for one entity. */
export type EntityWaivers = {
  waivers: ConnectedWaiver[];
  summary: { total: number; completed: number; pending: number };
};

type RawConnectedWaiver = {
  id: number;
  status?: string | null;
  adult_name?: string | null;
  template?: string | null;
  selected_date?: string | null;
  submitted_at?: string | null;
  minors?: string[] | null;
  checked_in?: boolean | number | null;
  checked_in_at?: string | null;
  signing_url?: string | null;
};

/**
 * Generic (walk-in) kiosk URL for a template — the customer fills in all of
 * their own info. Mirrors the web Assign/Kiosk modal's generic launch, which
 * opens `/waiver/kiosk/{templateId}?location_id=…`.
 */
export function buildTemplateKioskUrl(
  templateId: number,
  opts: { locationId?: number | null; preview?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (opts.preview) params.set("preview", "1");
  if (opts.locationId != null)
    params.set("location_id", String(opts.locationId));
  const qs = params.toString();
  return webUrl(`/waiver/kiosk/${templateId}${qs ? `?${qs}` : ""}`);
}

/** The source kinds a prefilled kiosk session can bind to (mirrors the web). */
export type KioskSourceType =
  | "booking"
  | "attraction_purchase"
  | "event_purchase"
  | "package"
  | "attraction"
  | "event";

/** Result of creating a prefilled kiosk session. */
export type KioskSession = {
  kioskUrl: string | null;
  status: string | null;
  alreadyCompleted: boolean;
  /**
   * The access token lifted out of `kioskUrl`. The kiosk routes are keyed by
   * token, so this is what the in-app kiosk addresses the public endpoints
   * with — no page load required.
   */
  accessToken: string | null;
};

/** One child covered by the signer's waiver. */
export type KioskMinorInput = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  relationship: string;
};

/** Everything POST /waivers/access/{token}/submit accepts. */
export type KioskSubmission = {
  adult_first_name: string;
  adult_last_name: string;
  adult_email: string;
  adult_phone: string;
  /** YYYY-MM-DD; the signer must be 18 or over or the API rejects it. */
  adult_dob: string;
  relationship?: string | null;
  typed_legal_name: string;
  /** Optional drawn signature as a data URI; the typed name is the signature. */
  signature_image?: string | null;
  agreement_accepted: boolean;
  electronic_consent_accepted?: boolean;
  photo_video_consent?: boolean;
  marketing_consent?: boolean;
  minors?: KioskMinorInput[];
  device_id?: string | null;
  read_seconds?: number;
  /**
   * Returning customer only. The server re-reads the signer's details from the
   * saved record and ignores the adult_* fields sent alongside — they are still
   * required by validation, so the form keeps sending them.
   */
  waiver_profile_id?: number;
  /**
   * Saved dependents joining this visit. Anyone new travels in `minors` as
   * usual — the backend merges the two into the final minor list, so there is
   * no separate "new dependents" field.
   */
  selected_dependent_ids?: number[];
};

/** What a submission tells us back: the record, and possibly an ad to show. */
export type KioskSubmitResult = {
  id: number | null;
  status: string | null;
  ad: KioskAd | null;
};

/** The template + prefill behind the kiosk form. */
export type KioskForm = {
  /** "completed" when the waiver was already signed for this date. */
  status: string;
  alreadyCompleted: boolean;
  templateId: number | null;
  title: string;
  version: number | null;
  /** Markdown-ish legal body with the venue's values already substituted. */
  body: string;
  /** Newline-separated bullets shown in the "Please note" panel. */
  highlightPoints: string;
  maxMinors: number;
  minorSectionEnabled: boolean;
  dobRequired: boolean;
  relationshipRequired: boolean;
  photoVideoReleaseEnabled: boolean;
  photoVideoReleaseText: string;
  electronicConsentEnabled: boolean;
  marketingConsentEnabled: boolean;
  marketingConsentText: string;
  marketingHelperText: string;
  /** Anything the backend already knows about the signer. */
  prefill: Record<string, unknown>;
  selectedDate: string | null;
  /** Kiosk-wide switches from `data.settings`. */
  settings: KioskSettings;
};

function mapKioskForm(d: Record<string, unknown>): KioskForm {
  const t = (d.template ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    status: str(d.status) || "pending",
    alreadyCompleted: str(d.status) === "completed",
    templateId: num(t.id),
    title: str(t.title) || "Waiver & Release of Liability",
    version: num(t.version),
    body: str(d.body),
    highlightPoints: str(t.highlight_points),
    maxMinors: num(t.max_minors) ?? 10,
    minorSectionEnabled: t.minor_section_enabled !== false,
    dobRequired: t.dob_required !== false,
    relationshipRequired: t.relationship_required === true,
    photoVideoReleaseEnabled: t.photo_video_release_enabled === true,
    photoVideoReleaseText: str(t.photo_video_release_text),
    electronicConsentEnabled: t.electronic_consent_enabled === true,
    marketingConsentEnabled: t.marketing_consent_enabled === true,
    marketingConsentText: str(t.marketing_consent_text),
    marketingHelperText: str(t.marketing_helper_text),
    prefill: (d.prefill ?? {}) as Record<string, unknown>,
    selectedDate: typeof d.selected_date === "string" ? d.selected_date : null,
    settings: mapKioskSettings(d.settings),
  };
}

/**
 * GET /api/waivers/access/{token} — the kiosk form for a session.
 *
 * Public and token-addressed: no bearer token, which is why `publicEndpoint`
 * is set. A waiver already signed for the date comes back as `completed` with
 * no template, which the screen reports rather than rendering an empty form.
 */
export async function fetchKioskForm(
  accessToken: string,
  signal?: AbortSignal,
): Promise<KioskForm> {
  const res = await apiRequest<{
    success?: boolean;
    data?: Record<string, unknown>;
  }>(`/api/waivers/access/${encodeURIComponent(accessToken)}`, {
    signal,
    publicEndpoint: true,
  });
  return mapKioskForm(res?.data ?? {});
}

/**
 * GET /api/waiver-templates/{id}/kiosk-preview — the same form for a template
 * that is not active yet.
 *
 * The public kiosk route serves active templates only, so previewing a draft
 * has to go through this staff-authenticated endpoint instead. It returns the
 * same shape, and submission is blocked either way — the sheet says so before
 * opening it.
 */
export async function fetchTemplateKioskPreview(
  token: string,
  templateId: number,
  signal?: AbortSignal,
): Promise<KioskForm> {
  const res = await apiRequest<{
    success?: boolean;
    data?: Record<string, unknown>;
  }>(`/api/waiver-templates/${templateId}/kiosk-preview`, { token, signal });
  return mapKioskForm(res?.data ?? {});
}

/**
 * GET /api/waivers/kiosk/{templateId} — the walk-in kiosk form for a template.
 *
 * The generic counterpart to {@link fetchKioskForm}: no booking behind it, so
 * signer-specific tokens in the body are left blank and there is no prefill.
 * `locationId` picks which venue's details are substituted, and which location
 * the resulting waiver is filed against.
 */
export async function fetchTemplateKioskForm(
  templateId: number,
  opts: { locationId?: number | null; signal?: AbortSignal } = {},
): Promise<KioskForm> {
  const params = new URLSearchParams();
  if (opts.locationId != null)
    params.append("location_id", String(opts.locationId));
  const qs = params.toString();
  const res = await apiRequest<{
    success?: boolean;
    data?: Record<string, unknown>;
  }>(`/api/waivers/kiosk/${templateId}${qs ? `?${qs}` : ""}`, {
    signal: opts.signal,
    publicEndpoint: true,
  });
  return mapKioskForm(res?.data ?? {});
}

/**
 * POST /api/waivers/kiosk/{templateId}/submit — sign a walk-in waiver.
 *
 * Creates a fresh completed record rather than filling an assigned one, and is
 * recorded with source "kiosk".
 */
export async function submitTemplateKioskWaiver(
  templateId: number,
  payload: KioskSubmission,
  opts: { locationId?: number | null; selectedDate?: string | null } = {},
): Promise<KioskSubmitResult> {
  const body: Record<string, unknown> = { ...payload };
  if (opts.locationId != null) body.location_id = opts.locationId;
  if (opts.selectedDate) body.selected_date = opts.selectedDate;
  const res = await apiRequest<{
    success?: boolean;
    data?: { id?: number; status?: string; ad?: unknown };
  }>(`/api/waivers/kiosk/${templateId}/submit`, {
    method: "POST",
    body,
    publicEndpoint: true,
  });
  return {
    id: res?.data?.id ?? null,
    status: res?.data?.status ?? null,
    ad: mapKioskAd(res?.data?.ad),
  };
}

/**
 * POST /api/waivers/access/{token}/submit — sign the waiver.
 *
 * `kiosk: true` tells the backend this was signed at a kiosk rather than on the
 * guest's own device, which is what makes it answer with an ad to show.
 */
export async function submitKioskWaiver(
  accessToken: string,
  payload: KioskSubmission,
  opts: { kiosk?: boolean } = {},
): Promise<KioskSubmitResult> {
  const res = await apiRequest<{
    success?: boolean;
    data?: { id?: number; status?: string; ad?: unknown };
  }>(`/api/waivers/access/${encodeURIComponent(accessToken)}/submit`, {
    method: "POST",
    body: opts.kiosk ? { ...payload, kiosk: true } : payload,
    publicEndpoint: true,
  });
  return {
    id: res?.data?.id ?? null,
    status: res?.data?.status ?? null,
    ad: mapKioskAd(res?.data?.ad),
  };
}

/* ------------------------------------------- Returning customers (kiosk) -- */

/**
 * POST /api/waivers/kiosk/{templateId}/lookup — find a returning guest by phone.
 *
 * Public and throttled (10/min per IP), so a 429 is a normal outcome at a busy
 * kiosk rather than an error: it comes back as `rate_limited` so the screen can
 * ask the guest to wait instead of showing a failure. Every other transport
 * failure resolves to `error` with the server's message — the kiosk always has
 * "continue as a new customer" available, so a lookup never dead-ends.
 */
export async function lookupReturningCustomer(
  templateId: number,
  phone: string,
  signal?: AbortSignal,
): Promise<ReturningLookupResult> {
  try {
    const res = await apiRequest<{
      success?: boolean;
      data?: { status?: string; profile?: unknown };
    }>(`/api/waivers/kiosk/${templateId}/lookup`, {
      method: "POST",
      body: { phone },
      publicEndpoint: true,
      signal,
    });
    return classifyLookupResponse(res?.data?.status, res?.data?.profile);
  } catch (e) {
    return classifyLookupFailure(
      e instanceof ApiError ? e.status : 0,
      e instanceof Error ? e.message : null,
    );
  }
}

/* -------------------------------------------------- Post-waiver ad sends -- */

/** Where the ad's extra details get sent. The backend accepts these two only. */
export type AdLearnMoreChannel = "email" | "sms";

/**
 * POST /api/waivers/ads/learn-more — send the ad's details to the guest.
 *
 * The backend answers with a guest-facing sentence on both success and failure
 * (no destination on file, expired request, send failed), so the message is
 * passed straight through rather than being reworded here.
 */
export async function sendAdLearnMore(
  waiverId: number,
  adId: number,
  channel: AdLearnMoreChannel,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await apiRequest<{ success?: boolean; message?: string }>(
      `/api/waivers/ads/learn-more`,
      {
        method: "POST",
        body: { waiver_id: waiverId, ad_id: adId, channel },
        publicEndpoint: true,
      },
    );
    return {
      ok: res?.success !== false,
      message:
        res?.message ||
        (channel === "email"
          ? "Additional information sent by email."
          : "Additional information sent by text."),
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) {
      return {
        ok: false,
        message:
          "That has been requested a few times already. Please wait a moment.",
      };
    }
    return {
      ok: false,
      message:
        e instanceof Error && e.message
          ? e.message
          : "The message could not be sent. Please try again.",
    };
  }
}

/**
 * POST /api/waivers/kiosk-session — create a prefilled kiosk session bound to a
 * booking / purchase / activity and return the URL to open. Mirrors the web
 * `waiverService.createKioskSession`.
 */
export async function createKioskSession(
  token: string,
  sourceType: KioskSourceType,
  sourceId: number,
  opts: {
    templateId?: number;
    selectedDate?: string;
    locationId?: number;
  } = {},
): Promise<KioskSession> {
  const body: Record<string, unknown> = {
    source_type: sourceType,
    source_id: sourceId,
  };
  if (opts.templateId != null) body.template_id = opts.templateId;
  if (opts.selectedDate) body.selected_date = opts.selectedDate;
  if (opts.locationId != null) body.location_id = opts.locationId;
  const res = await apiRequest<{
    success?: boolean;
    data?: {
      access_token?: string | null;
      kiosk_url?: string | null;
      status?: string | null;
      already_completed?: boolean;
    };
  }>(`/api/waivers/kiosk-session`, { method: "POST", token, body });
  const d = res?.data ?? {};
  const kioskUrl = d.kiosk_url ?? null;
  return {
    kioskUrl,
    status: d.status ?? null,
    alreadyCompleted: d.already_completed ?? false,
    // The API returns the token outright for every source type, so prefer it
    // and only fall back to picking it out of the URL.
    accessToken: d.access_token?.trim() || kioskAccessTokenFrom(kioskUrl),
  };
}

/**
 * POST /api/waivers/{id}/check-in — mark a connected waiver's participant as
 * checked in. NOTE: route is a best-guess mirror of the web action; adjust if
 * your backend uses a different path.
 */
export async function checkInWaiver(token: string, id: number): Promise<void> {
  await apiRequest(`/api/waivers/${id}/check-in`, {
    method: "POST",
    token,
    body: {},
  });
}

/**
 * GET /api/waivers/for?type=&id= — waivers connected to an entity (the same
 * endpoint the web `WaiverConnectionPanel` uses). Returns the list + summary so
 * the details screen can mirror the web "Waivers" section.
 */
export async function fetchEntityWaivers(
  token: string,
  type: WaiverEntityType,
  id: number,
  signal?: AbortSignal,
): Promise<EntityWaivers> {
  const params = new URLSearchParams({ type, id: String(id) });
  const res = await apiRequest<{
    success: boolean;
    data: {
      waivers?: RawConnectedWaiver[];
      summary?: { total?: number; completed?: number; pending?: number };
    };
  }>(`/api/waivers/for?${params.toString()}`, { token, signal });

  const waivers = (res?.data?.waivers ?? []).map((w) => ({
    id: w.id,
    status: (w.status ?? "pending") as WaiverStatus,
    adultName: w.adult_name?.trim() || "Unnamed",
    template: w.template?.trim() || null,
    selectedDate: w.selected_date ?? null,
    submittedAt: w.submitted_at ?? null,
    minors: w.minors ?? [],
    checkedIn: w.checked_in === true || w.checked_in === 1 || !!w.checked_in_at,
    checkedInAt: w.checked_in_at ?? null,
    signingUrl: w.signing_url?.trim() || null,
  }));
  const s = res?.data?.summary ?? {};
  return {
    waivers,
    summary: {
      total: s.total ?? waivers.length,
      completed: s.completed ?? 0,
      pending: s.pending ?? 0,
    },
  };
}

/* ------------------------------------------------------- Post-waiver ads -- */

/**
 * Where an ad stands right now, derived server-side from its enabled flag and
 * its schedule (`WaiverTemplateAd::status()`), so the app never computes it
 * from the dates and ends up disagreeing with the rotation.
 */
export type WaiverAdStatus = "active" | "scheduled" | "expired" | "disabled";

export type WaiverAd = {
  id: number;
  templateId: number;
  /** Empty means every location — the same "all" semantics targeting uses
   *  elsewhere in the product (promos, gift cards, custom fields). */
  locationIds: number[];
  locationNames: string[];
  name: string | null;
  imagePath: string | null;
  destinationUrl: string | null;
  isEnabled: boolean;
  /** Shown only when no ordinary ad is eligible. At most one per template. */
  isFallback: boolean;
  startsAt: string | null;
  endsAt: string | null;
  position: number;
  status: WaiverAdStatus;
};

/** Per-template ad behaviour, stored on the template rather than on any one ad. */
export type WaiverAdSettings = {
  adsEnabled: boolean;
  rotationMode: "random" | "ordered";
  /** The backend clamps this to 1-10 seconds. */
  displaySeconds: number;
};

const AD_STATUSES = ["active", "scheduled", "expired", "disabled"];

function mapWaiverAd(raw: Record<string, unknown>): WaiverAd {
  const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const ids = Array.isArray(raw.location_ids) ? raw.location_ids : [];
  const names = Array.isArray(raw.location_names) ? raw.location_names : [];
  const status = String(raw.status ?? "");
  return {
    id: num(raw.id),
    templateId: num(raw.waiver_template_id),
    locationIds: ids.map((v) => num(v)).filter((v) => v > 0),
    locationNames: names.filter(
      (v): v is string => typeof v === "string" && !!v,
    ),
    name: str(raw.name),
    imagePath: str(raw.image_path),
    destinationUrl: str(raw.destination_url),
    isEnabled: raw.is_enabled !== false,
    isFallback: raw.is_fallback === true,
    startsAt: str(raw.starts_at),
    endsAt: str(raw.ends_at),
    position: num(raw.position),
    // Take the server's word, but never render an unknown string as a chip.
    status: AD_STATUSES.includes(status)
      ? (status as WaiverAdStatus)
      : "active",
  };
}

function mapAdSettings(
  raw: Record<string, unknown> | undefined,
): WaiverAdSettings {
  const s = raw ?? {};
  const seconds = Number(s.ads_display_seconds);
  return {
    adsEnabled: s.ads_enabled === true,
    rotationMode: s.ads_rotation_mode === "ordered" ? "ordered" : "random",
    displaySeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 5,
  };
}

/** GET /api/waiver-templates/{id}/ads — the rotation plus its settings. */
export async function fetchTemplateAds(
  token: string,
  templateId: number,
  signal?: AbortSignal,
): Promise<{ settings: WaiverAdSettings; ads: WaiverAd[] }> {
  const res = await apiRequest<{
    success?: boolean;
    data?: {
      settings?: Record<string, unknown>;
      ads?: Record<string, unknown>[];
    };
  }>(`/api/waiver-templates/${templateId}/ads`, { token, signal });
  return {
    settings: mapAdSettings(res?.data?.settings),
    ads: (res?.data?.ads ?? []).map(mapWaiverAd),
  };
}

/** A picked image, in the shape React Native's FormData takes. */
export type WaiverAdImage = { uri: string; name: string; type: string };

export type WaiverAdInput = {
  name?: string;
  destinationUrl?: string;
  /** Empty targets every location; a location manager is pinned to their own. */
  locationIds?: number[];
  startsAt?: string | null;
  endsAt?: string | null;
  isEnabled?: boolean;
  isFallback?: boolean;
};

/** The fields create and update share. */
function appendAdFields(form: FormData, input: WaiverAdInput): void {
  if (input.name != null) form.append("name", input.name);
  if (input.destinationUrl) form.append("destination_url", input.destinationUrl);
  (input.locationIds ?? []).forEach((id) =>
    form.append("location_ids[]", String(id)),
  );
  if (input.startsAt) form.append("starts_at", input.startsAt);
  if (input.endsAt) form.append("ends_at", input.endsAt);
  if (input.isEnabled != null)
    form.append("is_enabled", input.isEnabled ? "1" : "0");
  if (input.isFallback != null)
    form.append("is_fallback", input.isFallback ? "1" : "0");
}

async function submitAdForm(
  url: string,
  token: string,
  form: FormData,
): Promise<WaiverAd> {
  // A direct fetch, so React Native sets the multipart boundary itself — the
  // same shape the photo and membership uploads use.
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data?.message as string) || "That ad could not be saved.",
    );
  }
  return mapWaiverAd((data?.data ?? {}) as Record<string, unknown>);
}

/**
 * POST /api/waiver-templates/{id}/ads — add an ad. The image is required here
 * (png/jpg/jpeg/webp, up to 8 MB).
 */
export async function createTemplateAd(
  token: string,
  templateId: number,
  image: WaiverAdImage,
  input: WaiverAdInput,
): Promise<WaiverAd> {
  const form = new FormData();
  form.append("image", image as unknown as Blob);
  appendAdFields(form, input);
  return submitAdForm(
    apiUrl(`/api/waiver-templates/${templateId}/ads`),
    token,
    form,
  );
}

/**
 * POST /api/waiver-ads/{id} — update an ad. The backend's update route is a
 * POST so a replacement image can travel with it; the image is optional here.
 * `clearSchedule` / `clearLink` are how the server is told to blank a field
 * rather than leave it as it was.
 */
export async function updateTemplateAd(
  token: string,
  adId: number,
  input: WaiverAdInput & {
    image?: WaiverAdImage | null;
    clearSchedule?: boolean;
    clearLink?: boolean;
  },
): Promise<WaiverAd> {
  const form = new FormData();
  if (input.image) form.append("image", input.image as unknown as Blob);
  appendAdFields(form, input);
  if (input.clearSchedule) form.append("clear_schedule", "1");
  if (input.clearLink) form.append("clear_link", "1");
  // An empty set means "every location". The server only acts on it when the
  // field is present, so it has to be sent explicitly rather than omitted.
  if (input.locationIds && input.locationIds.length === 0)
    form.append("location_ids", "");
  return submitAdForm(apiUrl(`/api/waiver-ads/${adId}`), token, form);
}

/** DELETE /api/waiver-ads/{id} — removes the ad and its stored image. */
export async function deleteTemplateAd(
  token: string,
  adId: number,
): Promise<void> {
  await apiRequest(`/api/waiver-ads/${adId}`, { method: "DELETE", token });
}

/**
 * PUT /api/waiver-templates/{id}/ads/reorder — set the rotation order.
 * Company admins only; a location-bound user is refused with a 403.
 */
export async function reorderTemplateAds(
  token: string,
  templateId: number,
  orderedIds: number[],
): Promise<void> {
  await apiRequest(`/api/waiver-templates/${templateId}/ads/reorder`, {
    method: "PUT",
    token,
    body: { ordered_ids: orderedIds },
  });
}

/** PATCH /api/waiver-templates/{id}/ad-settings — rotation behaviour. */
export async function updateTemplateAdSettings(
  token: string,
  templateId: number,
  settings: Partial<WaiverAdSettings>,
): Promise<WaiverAdSettings> {
  const body: Record<string, unknown> = {};
  if (settings.adsEnabled != null) body.ads_enabled = settings.adsEnabled;
  if (settings.rotationMode) body.ads_rotation_mode = settings.rotationMode;
  if (settings.displaySeconds != null)
    body.ads_display_seconds = settings.displaySeconds;
  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/waiver-templates/${templateId}/ad-settings`,
    { method: "PATCH", token, body },
  );
  return mapAdSettings(res?.data);
}
