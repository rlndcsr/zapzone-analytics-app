import { apiRequest, webUrl } from "../lib/api";

/*
 * Waivers API client — mirrors the web admin's `src/services/waiverService.ts`
 * against the same Laravel backend. All endpoints are under `/api` and require a
 * Sanctum bearer token (passed explicitly per call, like the other services).
 *
 * Backend authorization (enforced server-side; the mobile UI mirrors it so we
 * never surface an action the caller's role would be rejected for):
 *   - Lists are auto-scoped to the caller's company; managers/attendants are
 *     further locked to their own location_id.
 *   - assign / group-invite create: admin or location_manager (attendant blocked).
 *   - delete waiver: company_admin only.
 *   - template writes: admin, or manager when settings.manager_can_build_templates.
 *   - print/export: admin, or manager when settings.manager_print_export_enabled.
 *   - deletion log: admin, or manager when settings.manager_can_view_deletion_log.
 */

/* ------------------------------------------------------------------ enums -- */

export type WaiverStatus =
  | "pending"
  | "completed"
  | "expired"
  | "replaced"
  | "deleted";

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
  /**
   * Participant check-in timestamp (nullable ISO string). Mirrors the web
   * admin's `Waiver.checked_in_at`; its truthiness drives the "Checked In" vs
   * "Not Checked In" badge (the web never uses a separate boolean).
   */
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

/** Company-level waiver settings (permission flags + UI hints). */
export type WaiverSettings = {
  adminDeleteEnabled: boolean;
  managerPrintExportEnabled: boolean;
  managerCanBuildTemplates: boolean;
  managerCanViewDeletionLog: boolean;
  marketingConsentEnabled: boolean;
  searchAutoRefreshSeconds: number;
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

export type WaiverSearchFilters = {
  status?: WaiverStatus;
  /** `all=1` ignores the date filter (browse across all dates). */
  all?: boolean;
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
  if (filters.all) params.append("all", "1");
  else if (filters.date) params.append("date", filters.date);
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

/* ------------------------------------------------------------- Settings -- */

/** GET /api/waiver-settings — company permission flags + UI hints. */
export async function fetchWaiverSettings(
  token: string,
  signal?: AbortSignal,
): Promise<WaiverSettings> {
  const res = await apiRequest<{
    success: boolean;
    data: {
      admin_delete_enabled?: boolean;
      manager_print_export_enabled?: boolean;
      manager_can_build_templates?: boolean;
      manager_can_view_deletion_log?: boolean;
      marketing_consent_enabled?: boolean;
      search_auto_refresh_seconds?: number;
    };
  }>(`/api/waiver-settings`, { token, signal });
  const d = res?.data ?? {};
  return {
    adminDeleteEnabled: d.admin_delete_enabled ?? true,
    managerPrintExportEnabled: d.manager_print_export_enabled ?? true,
    managerCanBuildTemplates: d.manager_can_build_templates ?? false,
    managerCanViewDeletionLog: d.manager_can_view_deletion_log ?? false,
    marketingConsentEnabled: d.marketing_consent_enabled ?? true,
    searchAutoRefreshSeconds: d.search_auto_refresh_seconds ?? 30,
  };
}

/* --------------------------------------------- Entity waiver connections -- */

/** The entity kinds a waiver can be connected to (mirrors the web panel). */
export type WaiverEntityType =
  | "booking"
  | "attraction_purchase"
  | "event_purchase"
  | "customer";

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
  /** Public completion link if the API provides one; otherwise built client-side. */
  kioskUrl: string | null;
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
  kiosk_url?: string | null;
  link?: string | null;
  url?: string | null;
};

/**
 * Public kiosk URL where a customer completes the waiver for a booking. The web
 * WaiverConnectionPanel's "Kiosk" / "Copy link" open this page; the mobile app
 * has no window.origin, so it builds the same path on the web frontend host
 * (EXPO_PUBLIC_WEB_URL). NOTE: adjust this path if your kiosk route differs.
 */
export function buildWaiverKioskUrl(
  entityType: WaiverEntityType,
  entityId: number,
): string {
  return webUrl(`/waiver/kiosk/${entityType}/${entityId}`);
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
    kioskUrl: w.kiosk_url?.trim() || w.link?.trim() || w.url?.trim() || null,
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
