import { apiRequest } from "../lib/api";
import { fetchAllPages, uniqueById } from "../lib/fetchAllPages";
import {
  EVENT_PHOTOS_CATEGORY,
  emailTemplateCategoryLabel,
  type TemplateTargeting,
} from "../lib/email/emailTemplateOptions";
import {
  ALL_TRIGGER_GROUPS,
  TRIGGER_LABEL_OVERRIDES,
  type NotificationEntity,
  type VisitActivityFilter,
  type VisitPayloadFields,
} from "../lib/email/visitEmail";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Title-case a snake_case value: "booking_rescheduled" → "Booking Rescheduled". */
function humanize(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function looksLikeRow(v: unknown): v is { id: number } {
  return !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "number";
}

/**
 * Pull `{ rows, total }` out of a Laravel paginator wrapped in `{ success, data }`.
 * Tolerates a bare array or `{ data: [...] }` so a serialization change can't blank
 * the screen.
 */
function extractPaginated<T>(res: unknown): { rows: T[]; total: number } {
  const root = (res ?? {}) as Record<string, unknown>;
  const paginator = (root.data ?? {}) as Record<string, unknown>;
  const asArray = (v: unknown): T[] | null =>
    Array.isArray(v) && (v.length === 0 || looksLikeRow(v[0])) ? (v as T[]) : null;

  const rows = asArray(paginator.data) ?? asArray(root.data) ?? asArray(res) ?? [];
  const total = typeof paginator.total === "number" ? paginator.total : rows.length;
  return { rows, total };
}

// Fetch a generous page so client-derived stat counts are accurate at this
// app's scale (the backend caps nothing important here).
const PER_PAGE = 100;
/** Runaway guard for {@link fetchEveryPage} — 5,000 rows. */
const MAX_PAGES = 50;

/**
 * Every row of a paginated index, plus the server's total. The backend pages
 * these lists, so reading only the first page silently dropped everything past
 * {@link PER_PAGE} — rows missing from the list, its search and its stats.
 */
async function fetchEveryPage<T extends { id: number }>(
  token: string,
  path: string,
): Promise<{ rows: T[]; total: number }> {
  let total = 0;
  const rows = await fetchAllPages<T>(
    async (page) => {
      const res = await apiRequest<unknown>(`${path}?per_page=${PER_PAGE}&page=${page}`, {
        token,
      });
      const parsed = extractPaginated<T>(res);
      if (page === 1) total = parsed.total;
      const paginator = ((res ?? {}) as Record<string, unknown>).data;
      const lastPage =
        paginator && typeof paginator === "object" && !Array.isArray(paginator)
          ? Number((paginator as Record<string, unknown>).last_page) || 1
          : 1;
      return { items: parsed.rows, lastPage };
    },
    { maxPages: MAX_PAGES },
  );
  // A row created mid-walk can shift another onto the next page; keep it once.
  return { rows: uniqueById(rows), total };
}

/* ------------------------------------------------------------------ */
/* Email templates                                                     */
/* ------------------------------------------------------------------ */

export type EmailTemplateStatus = "active" | "draft" | "archived";

export type EmailTemplateRow = TemplateTargeting & {
  id: number;
  name: string;
  subject: string;
  /** Display label ("Event photos"); "General" when the template has none. */
  category: string;
  status: EmailTemplateStatus;
  createdAt: string | null;
  /** False when the server says this user may only view it (another location's, or every location's). */
  canManage: boolean;
};

type RawTemplate = {
  id: number;
  name?: string | null;
  subject?: string | null;
  category?: string | null;
  status?: string | null;
  created_at?: string | null;
  location_id?: number | null;
  location_ids?: number[] | null;
  all_locations?: boolean | null;
  location_names?: string[] | null;
  target_locations?: { id: number; name: string | null; active?: boolean | null }[] | null;
  location?: { name?: string | null } | null;
  can_manage?: boolean | null;
};

/**
 * Where a template applies. An older server sends only `location_id`, so that
 * (or its absence, for every location) is read the same way the web does.
 */
function mapTargeting(t: RawTemplate): TemplateTargeting {
  const categoryValue = t.category?.trim() || null;
  if (typeof t.all_locations !== "boolean") {
    const id = t.location_id ?? null;
    return {
      categoryValue,
      allLocations: id == null,
      locationIds: id == null ? [] : [id],
      locationNames: id != null && t.location?.name ? [t.location.name] : [],
      // no names to tell a deleted location from a missing one, so none is treated as deleted
      targetLocations: [],
    };
  }
  return {
    categoryValue,
    allLocations: t.all_locations,
    locationIds: Array.isArray(t.location_ids) ? t.location_ids.map(Number) : [],
    locationNames: Array.isArray(t.location_names) ? t.location_names : [],
    targetLocations: Array.isArray(t.target_locations)
      ? t.target_locations.map((target) => ({
          id: Number(target.id),
          name: target.name ?? null,
          active: target.active !== false,
        }))
      : [],
  };
}

function mapTemplateRow(t: RawTemplate): EmailTemplateRow {
  return {
    ...mapTargeting(t),
    id: t.id,
    name: t.name?.trim() || "Untitled template",
    subject: t.subject?.trim() || "",
    category: emailTemplateCategoryLabel(t.category),
    status: (t.status ?? "draft") as EmailTemplateStatus,
    createdAt: t.created_at ?? null,
    canManage: t.can_manage !== false,
  };
}

/** One insertable merge variable, e.g. {@literal {{ recipient_email }}}. */
export type EmailVariable = { name: string; description: string };

/** Grouped merge variables for the composer's "Template Variables" panel. */
export type EmailVariableGroups = {
  default: EmailVariable[];
  customer: EmailVariable[];
  user: EmailVariable[];
  /** Event photo fields plus each `link_…` name; empty from an older server. */
  event: EmailVariable[];
};

const toVarList = (rec: Record<string, string> | undefined): EmailVariable[] =>
  Object.entries(rec ?? {}).map(([name, description]) => ({ name, description: String(description) }));

/** GET /api/email-templates/variables — merge fields grouped default/customer/user/event. */
export async function fetchEmailTemplateVariables(
  token: string,
): Promise<EmailVariableGroups> {
  const res = await apiRequest<{
    data?: {
      default?: Record<string, string>;
      customer?: Record<string, string>;
      user?: Record<string, string>;
      event?: Record<string, string>;
    };
  }>("/api/email-templates/variables", { token });
  const d = res?.data ?? {};
  return {
    default: toVarList(d.default),
    customer: toVarList(d.customer),
    user: toVarList(d.user),
    event: toVarList(d.event),
  };
}

export type CreateEmailTemplateInput = {
  name: string;
  subject: string;
  body: string;
  status: EmailTemplateStatus;
  category?: string;
  /**
   * Company-level staff only: the locations it covers, empty for every
   * location. Left out for everyone else — the server keeps their templates to
   * their own location.
   */
  locationIds?: number[];
  /** Event photos only. */
  attachPhotos?: boolean;
  /** Event photos only; null clears it so the usual photo text is used. */
  smsBody?: string | null;
};

function templateBody(input: CreateEmailTemplateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    body: input.body,
    status: input.status,
  };
  if (input.category) body.category = input.category;
  if (input.locationIds !== undefined) body.location_ids = input.locationIds;
  if (input.attachPhotos !== undefined) body.attach_photos = input.attachPhotos;
  if (input.smsBody !== undefined) body.sms_body = input.smsBody;
  return body;
}

/** POST /api/email-templates — create a reusable template. */
export async function createEmailTemplate(
  token: string,
  input: CreateEmailTemplateInput,
): Promise<void> {
  await apiRequest("/api/email-templates", { method: "POST", token, body: templateBody(input) });
}

/** GET /api/email-templates — reusable templates for the company. */
export async function fetchEmailTemplates(
  token: string,
): Promise<{ rows: EmailTemplateRow[]; total: number }> {
  const { rows, total } = await fetchEveryPage<RawTemplate>(token, "/api/email-templates");
  return { total, rows: rows.map(mapTemplateRow) };
}

/**
 * POST /api/email-templates/{id}/duplicate — a draft copy; for a manager the
 * copy is for their own location. Returns the copy's id.
 */
export async function duplicateEmailTemplate(token: string, id: number): Promise<number> {
  const res = await apiRequest<{ data?: { id?: number } }>(
    `/api/email-templates/${id}/duplicate`,
    { method: "POST", token },
  );
  const copyId = Number(res?.data?.id);
  if (!Number.isInteger(copyId) || copyId <= 0) throw new Error("The template could not be copied");
  return copyId;
}

/** PATCH /api/email-templates/{id}/status — set a template's status (bulk-action write). */
export async function updateEmailTemplateStatus(
  token: string,
  id: number,
  status: EmailTemplateStatus,
): Promise<void> {
  await apiRequest(`/api/email-templates/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
}

/** Full template incl. the HTML body — powers the Template Details screen. */
export type EmailTemplateDetail = TemplateTargeting & {
  id: number;
  name: string;
  subject: string;
  body: string;
  status: EmailTemplateStatus;
  /** Display label — "General" when the template has none. */
  category: string;
  /** False when this user may only view it; the editor opens read-only. */
  canManage: boolean;
  /** Event photos: attach the photos as well as the link. */
  attachPhotos: boolean;
  /** Event photos: the text message; empty uses the usual photo text. */
  smsBody: string;
};

type RawTemplateDetail = RawTemplate & {
  body?: string | null;
  attach_photos?: boolean | null;
  sms_body?: string | null;
};

/** GET /api/email-templates/{id} — full template (with body) for the details screen. */
export async function fetchEmailTemplateDetail(
  token: string,
  id: number,
): Promise<EmailTemplateDetail> {
  const res = await apiRequest<{ data?: RawTemplateDetail }>(
    `/api/email-templates/${id}`,
    { token },
  );
  // Tolerate either a `{ data }` envelope or a bare object.
  const raw = (res?.data ?? (res as unknown as RawTemplateDetail)) ?? ({} as RawTemplateDetail);
  const row = mapTemplateRow(raw);
  return {
    ...row,
    body: raw.body ?? "",
    attachPhotos: row.categoryValue === EVENT_PHOTOS_CATEGORY ? Boolean(raw.attach_photos) : true,
    smsBody: raw.sms_body ?? "",
  };
}

/** DELETE /api/email-templates/{id} — the web list's Delete action. */
export async function deleteEmailTemplate(token: string, id: number): Promise<void> {
  await apiRequest(`/api/email-templates/${id}`, { method: "DELETE", token });
}

/**
 * POST /api/email-templates/preview — the subject and body with every merge
 * variable replaced by the server's sample data (web `previewContent`, the Edit
 * page's Preview button).
 */
export async function previewEmailContent(
  token: string,
  input: { subject: string; body: string; locationId?: number },
): Promise<{ subject: string; body: string }> {
  // location_id picks whose links and phone fill the sample (web: the first ticked location)
  const res = await apiRequest<{ data?: { subject?: string | null; body?: string | null } }>(
    "/api/email-templates/preview",
    {
      method: "POST",
      token,
      body: {
        subject: input.subject,
        body: input.body,
        ...(input.locationId ? { location_id: input.locationId } : {}),
      },
    },
  );
  return { subject: res?.data?.subject ?? "", body: res?.data?.body ?? "" };
}

/** PUT /api/email-templates/{id} — update an existing template (edit flow). */
export async function updateEmailTemplate(
  token: string,
  id: number,
  input: CreateEmailTemplateInput,
): Promise<void> {
  await apiRequest(`/api/email-templates/${id}`, { method: "PUT", token, body: templateBody(input) });
}

/* ------------------------------------------------------------------ */
/* Email campaigns                                                     */
/* ------------------------------------------------------------------ */

export type EmailCampaignRow = {
  id: number;
  name: string;
  subject: string;
  recipients: number;
  sentCount: number;
  failedCount: number;
  status: string;
  statusLabel: string;
  sentAt: string | null;
};

type RawCampaign = {
  id: number;
  name?: string | null;
  subject?: string | null;
  total_recipients?: number | null;
  sent_count?: number | null;
  failed_count?: number | null;
  status?: string | null;
  sent_at?: string | null;
};

/** GET /api/email-campaigns — bulk email sends. */
export async function fetchEmailCampaigns(
  token: string,
): Promise<{ rows: EmailCampaignRow[]; total: number }> {
  const { rows, total } = await fetchEveryPage<RawCampaign>(token, "/api/email-campaigns");
  return {
    total,
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name?.trim() || "Untitled campaign",
      subject: c.subject?.trim() || "",
      recipients: Number(c.total_recipients ?? 0),
      sentCount: Number(c.sent_count ?? 0),
      failedCount: Number(c.failed_count ?? 0),
      status: c.status ?? "draft",
      statusLabel: humanize(c.status) || "Draft",
      sentAt: c.sent_at ?? null,
    })),
  };
}

export type CampaignRecipientType =
  | "customers"
  | "attendants"
  | "company_admin"
  | "location_managers"
  | "custom"
  | "event_registrants";

/** Who an Event Registrants campaign goes to. */
export type CampaignEventFilter = {
  /** Location registration forms (the web's event picker sends form ids). */
  registrationEventIds: number[];
  /** Skip anyone whose photos are not ready yet. */
  onlyWithPhotos: boolean;
};

export type CreateEmailCampaignInput = {
  name: string;
  subject: string;
  body: string;
  recipientTypes: CampaignRecipientType[];
  customEmails?: string[];
  emailTemplateId?: number | null;
  sendNow: boolean;
  locationId?: number | null;
  /** Only when sending to event registrants. */
  events?: CampaignEventFilter;
};

function campaignRecipientBody(input: {
  recipientTypes: CampaignRecipientType[];
  customEmails?: string[];
  locationId?: number | null;
  events?: CampaignEventFilter;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { recipient_types: input.recipientTypes };
  if (input.customEmails?.length) body.custom_emails = input.customEmails;
  if (input.locationId != null) body.location_id = input.locationId;
  if (input.events && input.recipientTypes.includes("event_registrants")) {
    body.recipient_filters = {
      registration_event_ids: input.events.registrationEventIds,
      only_with_photos: input.events.onlyWithPhotos,
    };
  }
  return body;
}

/**
 * POST /api/email-campaigns — create a bulk send (draft when sendNow is false).
 * A large send carries on after the reply: `status` is then "sending" and
 * `message` says so.
 */
export async function createEmailCampaign(
  token: string,
  input: CreateEmailCampaignInput,
): Promise<{ status: string; message: string | null; totalRecipients: number }> {
  const body: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    body: input.body,
    send_now: input.sendNow,
    ...campaignRecipientBody(input),
  };
  if (input.emailTemplateId != null) body.email_template_id = input.emailTemplateId;
  const res = await apiRequest<{
    message?: string | null;
    data?: { status?: string | null; total_recipients?: number | null };
  }>("/api/email-campaigns", { method: "POST", token, body });
  return {
    status: res?.data?.status ?? "",
    message: res?.message ?? null,
    totalRecipients: Number(res?.data?.total_recipients ?? 0),
  };
}

export type CampaignRecipientPreview = {
  total: number;
  /** Per recipient type ("event_registrant", "customer", …). */
  byType: Record<string, number>;
  /** Event registrants who have their own photo link. */
  withPhotos: number;
};

/** POST /api/email-campaigns/preview-recipients — who a campaign would reach, before it is sent. */
export async function previewCampaignRecipients(
  token: string,
  input: {
    recipientTypes: CampaignRecipientType[];
    customEmails?: string[];
    locationId?: number | null;
    events?: CampaignEventFilter;
  },
  signal?: AbortSignal,
): Promise<CampaignRecipientPreview> {
  const res = await apiRequest<{
    data?: {
      total_recipients?: number | null;
      by_type?: Record<string, number> | null;
      with_photos?: number | null;
    };
  }>("/api/email-campaigns/preview-recipients", {
    method: "POST",
    token,
    signal,
    body: campaignRecipientBody(input),
  });
  return {
    total: Number(res?.data?.total_recipients ?? 0),
    byType: res?.data?.by_type ?? {},
    withPhotos: Number(res?.data?.with_photos ?? 0),
  };
}

export type EmailCampaignStats = {
  totalCampaigns: number;
  emailsSent: number;
  failedEmails: number;
  successRate: number;
};

type RawCampaignStats = {
  data?: {
    total_campaigns?: number;
    total_emails_sent?: number;
    total_emails_failed?: number;
    success_rate?: number;
  };
};

/** GET /api/email-campaigns/statistics — the four campaign stat cards. */
export async function fetchEmailCampaignStats(
  token: string,
): Promise<EmailCampaignStats> {
  const res = await apiRequest<RawCampaignStats>(
    "/api/email-campaigns/statistics",
    { token },
  );
  const d = res.data ?? {};
  return {
    totalCampaigns: d.total_campaigns ?? 0,
    emailsSent: d.total_emails_sent ?? 0,
    failedEmails: d.total_emails_failed ?? 0,
    successRate: Number(d.success_rate ?? 0),
  };
}

/** One delivery-log row shown on the campaign details screen. */
export type EmailCampaignLog = {
  id: number;
  recipientEmail: string;
  recipientType: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
};

/** Full campaign incl. recipients, dates, and delivery logs for the details screen. */
export type EmailCampaignDetail = {
  id: number;
  name: string;
  subject: string;
  body: string;
  status: string;
  statusLabel: string;
  recipientTypes: string[];
  customEmails: string[];
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  createdByName: string | null;
  locationName: string | null;
  /** Why a send stopped part-way (status "failed"). */
  errorMessage: string | null;
  /** Event Registrants: how many location forms it went to. */
  eventFormCount: number;
  /** Event Registrants: only people whose photos were ready. */
  onlyWithPhotos: boolean;
  logs: EmailCampaignLog[];
};

type RawCampaignLog = {
  id: number;
  recipient_email?: string | null;
  recipient_type?: string | null;
  status?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
};

type RawCampaignDetail = RawCampaign & {
  body?: string | null;
  recipient_types?: string[] | null;
  custom_emails?: string[] | null;
  scheduled_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  error_message?: string | null;
  recipient_filters?: {
    registration_event_ids?: unknown;
    only_with_photos?: unknown;
  } | null;
  location?: { name?: string | null } | null;
  creator?: { first_name?: string | null; last_name?: string | null } | null;
  logs?: RawCampaignLog[] | null;
};

/** GET /api/email-campaigns/{id} — full campaign for the details screen. */
export async function fetchEmailCampaignDetail(
  token: string,
  id: number,
): Promise<EmailCampaignDetail> {
  const res = await apiRequest<{ data?: RawCampaignDetail }>(
    `/api/email-campaigns/${id}`,
    { token },
  );
  const d = (res?.data ?? (res as unknown as RawCampaignDetail)) ?? ({} as RawCampaignDetail);
  const c = d.creator;
  const createdBy = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "";
  const filters = d.recipient_filters;
  return {
    id: d.id,
    name: d.name?.trim() || "Untitled campaign",
    subject: d.subject?.trim() || "",
    body: d.body ?? "",
    status: d.status ?? "draft",
    statusLabel: humanize(d.status) || "Draft",
    recipientTypes: Array.isArray(d.recipient_types) ? d.recipient_types : [],
    customEmails: Array.isArray(d.custom_emails) ? d.custom_emails : [],
    totalRecipients: Number(d.total_recipients ?? 0),
    sentCount: Number(d.sent_count ?? 0),
    failedCount: Number(d.failed_count ?? 0),
    scheduledAt: d.scheduled_at ?? null,
    sentAt: d.sent_at ?? null,
    completedAt: d.completed_at ?? null,
    createdAt: d.created_at ?? null,
    createdByName: createdBy || null,
    locationName: d.location?.name ?? null,
    errorMessage: d.error_message?.trim() || null,
    eventFormCount: Array.isArray(filters?.registration_event_ids)
      ? filters.registration_event_ids.length
      : 0,
    // stored from a JSON body (true) or form data ("1"), as the web reads it
    onlyWithPhotos: [true, 1, "1", "true"].includes(filters?.only_with_photos as never),
    logs: Array.isArray(d.logs)
      ? d.logs.map((l) => ({
          id: l.id,
          recipientEmail: l.recipient_email ?? "",
          recipientType: l.recipient_type ?? "",
          status: l.status ?? "pending",
          errorMessage: l.error_message ?? null,
          sentAt: l.sent_at ?? null,
        }))
      : [],
  };
}

/** POST /api/email-campaigns/{id}/cancel — stop a pending/sending campaign. */
export async function cancelEmailCampaign(token: string, id: number): Promise<void> {
  await apiRequest(`/api/email-campaigns/${id}/cancel`, { method: "POST", token });
}

/**
 * POST /api/email-campaigns/{id}/resend — retry failed (or all) recipients.
 * Returns the server's message ("Sending to 40 people now…", "There was no one
 * left to send it to again.").
 */
export async function resendEmailCampaign(
  token: string,
  id: number,
  type: "failed" | "all" = "failed",
): Promise<string | null> {
  const res = await apiRequest<{ message?: string | null }>(`/api/email-campaigns/${id}/resend`, {
    method: "POST",
    token,
    body: { type },
  });
  return res?.message ?? null;
}

/** DELETE /api/email-campaigns/{id} — remove a finished/cancelled campaign. */
export async function deleteEmailCampaign(token: string, id: number): Promise<void> {
  await apiRequest(`/api/email-campaigns/${id}`, { method: "DELETE", token });
}

/* ------------------------------------------------------------------ */
/* Email notifications                                                 */
/* ------------------------------------------------------------------ */

/** The return-visit promo a Visit Completed email carries (API shape). */
export type EmailPromoSummary = {
  id: number;
  code: string | null;
  offer: string | null;
  name: string | null;
  ends_on: string | null;
  terms?: string;
  location_note?: string | null;
  problem: string | null;
};

/** Another active visit email sent instead of this one for some visits (API shape). */
export type VisitEmailOverride = {
  id: number;
  name: string;
  location_name: string | null;
  promo_code: string | null;
  covers_everything: boolean;
};

export type EmailNotificationRow = {
  id: number;
  name: string;
  triggerType: string;
  triggerLabel: string;
  entityLabel: string;
  recipientCount: number;
  isActive: boolean;
  isDefault: boolean;
  /** A default whose subject or body was edited — only then can it be reset. */
  isCustomized: boolean;
  /** False when this user may not change it (company-wide follow-up emails). */
  canEdit: boolean;
  locationId: number | null;
  promoSummary: EmailPromoSummary | null;
};

type RawNotification = {
  id: number;
  name?: string | null;
  trigger_type?: string | null;
  entity_type?: string | null;
  recipient_types?: string[] | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
  is_subject_customized?: boolean | null;
  is_body_customized?: boolean | null;
  location_id?: number | null;
  can_edit?: boolean;
  promo_summary?: EmailPromoSummary | null;
};

const triggerLabelOf = (trigger: string | null | undefined): string =>
  (trigger && TRIGGER_LABEL_OVERRIDES[trigger]) || humanize(trigger);

export type EmailNotificationStats = {
  total: number;
  active: number;
  bookingTriggers: number;
  purchaseTriggers: number;
};

/** GET /api/email-notifications — automated per-event emails (+ derived stats). */
export async function fetchEmailNotifications(
  token: string,
): Promise<{ rows: EmailNotificationRow[]; total: number; stats: EmailNotificationStats }> {
  const { rows, total } = await fetchEveryPage<RawNotification>(
    token,
    "/api/email-notifications",
  );
  const mapped: EmailNotificationRow[] = rows.map((n) => ({
    id: n.id,
    name: n.name?.trim() || "Notification",
    triggerType: n.trigger_type ?? "",
    triggerLabel: triggerLabelOf(n.trigger_type),
    entityLabel: humanize(n.entity_type) || "—",
    recipientCount: Array.isArray(n.recipient_types) ? n.recipient_types.length : 0,
    isActive: n.is_active !== false,
    isDefault: !!n.is_default,
    isCustomized: !!n.is_subject_customized || !!n.is_body_customized,
    canEdit: n.can_edit !== false,
    locationId: n.location_id ?? null,
    promoSummary: n.promo_summary ?? null,
  }));

  const stats: EmailNotificationStats = {
    total,
    active: mapped.filter((n) => n.isActive).length,
    bookingTriggers: mapped.filter((n) => n.triggerType.includes("booking")).length,
    purchaseTriggers: mapped.filter((n) => n.triggerType.includes("purchase")).length,
  };

  return { rows: mapped, total, stats };
}

/** PATCH /api/email-notifications/{id}/toggle-status — flip active/inactive (bulk-action write). */
export async function toggleEmailNotificationStatus(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/email-notifications/${id}/toggle-status`, {
    method: "PATCH",
    token,
  });
}

/** Full notification config (trigger/entity/recipients/content) for the details screen. */
export type EmailNotificationDetail = {
  id: number;
  name: string;
  triggerType: string;
  triggerLabel: string;
  entityType: string;
  entityLabel: string;
  recipientTypes: string[];
  customEmails: string[];
  /** Don't Send To: addresses this email never goes to. */
  excludedEmails: string[];
  subject: string;
  body: string;
  templateName: string | null;
  emailTemplateId: number | null;
  includeQrCode: boolean;
  isActive: boolean;
  isDefault: boolean;
  /** A default email's key, e.g. "review_request_customer" (shown in the edit header). */
  defaultKey: string | null;
  sendBeforeHours: number | null;
  sendAfterHours: number | null;
  locationName: string | null;
  createdAt: string | null;
  locationId: number | null;
  canEdit: boolean;
  promoId: number | null;
  promoSummary: EmailPromoSummary | null;
  fromName: string;
  reviewUrl: string;
  activityFilter: VisitActivityFilter | null;
  visitOverrides: VisitEmailOverride[];
  /** Log counts by status, from the show response's `statistics`. */
  statistics: { sent: number; failed: number; pending: number } | null;
};

type RawNotificationDetail = RawNotification & {
  subject?: string | null;
  body?: string | null;
  custom_emails?: string[] | null;
  excluded_emails?: string[] | null;
  default_key?: string | null;
  include_qr_code?: boolean | null;
  send_before_hours?: number | null;
  send_after_hours?: number | null;
  email_template_id?: number | null;
  location?: { name?: string | null } | null;
  /** The serialized relation, which the API names `template` — not to be
   *  confused with `email_template_id`, the write-payload column above. */
  template?: { name?: string | null } | null;
  created_at?: string | null;
  promo_id?: number | null;
  from_name?: string | null;
  review_url?: string | null;
  activity_filter?: VisitActivityFilter | null;
  visit_overrides?: VisitEmailOverride[];
};

/** GET /api/email-notifications/{id} — full notification for the details screen. */
export async function fetchEmailNotificationDetail(
  token: string,
  id: number,
): Promise<EmailNotificationDetail> {
  const res = await apiRequest<{
    data?: RawNotificationDetail;
    statistics?: { total_sent?: number; total_failed?: number; total_pending?: number } | null;
  }>(`/api/email-notifications/${id}`, { token });
  const d = (res?.data ?? (res as unknown as RawNotificationDetail)) ?? ({} as RawNotificationDetail);
  const stats = res?.statistics;
  return {
    id: d.id,
    name: d.name?.trim() || "Notification",
    triggerType: d.trigger_type ?? "",
    triggerLabel: triggerLabelOf(d.trigger_type),
    entityType: d.entity_type ?? "all",
    entityLabel: humanize(d.entity_type) || "All Entities",
    recipientTypes: Array.isArray(d.recipient_types) ? d.recipient_types : [],
    customEmails: Array.isArray(d.custom_emails) ? d.custom_emails : [],
    excludedEmails: Array.isArray(d.excluded_emails) ? d.excluded_emails : [],
    subject: d.subject?.trim() || "",
    body: d.body ?? "",
    templateName: d.template?.name ?? null,
    emailTemplateId: d.email_template_id ?? null,
    includeQrCode: !!d.include_qr_code,
    isActive: d.is_active !== false,
    isDefault: !!d.is_default,
    defaultKey: d.default_key ?? null,
    sendBeforeHours: d.send_before_hours ?? null,
    sendAfterHours: d.send_after_hours ?? null,
    locationName: d.location?.name ?? null,
    createdAt: d.created_at ?? null,
    locationId: d.location_id ?? null,
    canEdit: d.can_edit !== false,
    promoId: d.promo_id ?? null,
    promoSummary: d.promo_summary ?? null,
    fromName: d.from_name ?? "",
    reviewUrl: d.review_url ?? "",
    activityFilter: d.activity_filter ?? null,
    visitOverrides: Array.isArray(d.visit_overrides) ? d.visit_overrides : [],
    statistics: stats
      ? {
          sent: Number(stats.total_sent ?? 0),
          failed: Number(stats.total_failed ?? 0),
          pending: Number(stats.total_pending ?? 0),
        }
      : null,
  };
}

export type EmailNotificationLogStatus = "sent" | "failed" | "pending";

/** One email this notification sent (or tried to) — a row of Notification Logs. */
export type EmailNotificationLog = {
  id: number;
  recipientEmail: string;
  recipientType: string;
  subject: string;
  status: EmailNotificationLogStatus;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string | null;
};

type RawNotificationLog = {
  id: number;
  recipient_email?: string | null;
  recipient_type?: string | null;
  subject?: string | null;
  status?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

/** GET /api/email-notifications/{id}/logs — newest first, paginated like the web. */
export async function fetchEmailNotificationLogs(
  token: string,
  id: number,
  page = 1,
  perPage = 10,
): Promise<{ logs: EmailNotificationLog[]; total: number; lastPage: number }> {
  const res = await apiRequest<unknown>(
    `/api/email-notifications/${id}/logs?page=${page}&per_page=${perPage}`,
    { token },
  );
  const { rows, total } = extractPaginated<RawNotificationLog>(res);
  const paginator = ((res as { data?: { last_page?: number } } | null)?.data ?? {}) as {
    last_page?: number;
  };
  return {
    logs: rows.map((l) => ({
      id: l.id,
      recipientEmail: l.recipient_email ?? "",
      recipientType: l.recipient_type ?? "",
      subject: l.subject ?? "",
      status:
        l.status === "sent" || l.status === "failed" ? l.status : "pending",
      errorMessage: l.error_message ?? null,
      sentAt: l.sent_at ?? null,
      createdAt: l.created_at ?? null,
    })),
    total,
    lastPage: Math.max(1, Number(paginator.last_page ?? 1)),
  };
}

/** POST /api/email-notifications/{id}/logs/{logId}/resend — retry a failed send. */
export async function resendEmailNotificationLog(
  token: string,
  id: number,
  logId: number,
): Promise<void> {
  await apiRequest(`/api/email-notifications/${id}/logs/${logId}/resend`, {
    method: "POST",
    token,
  });
}

/** PUT /api/email-notifications/{id} — update an automated notification (edit flow). */
export async function updateEmailNotification(
  token: string,
  id: number,
  input: CreateEmailNotificationInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    trigger_type: input.triggerType,
    entity_type: input.entityType,
    recipient_types: input.recipientTypes,
    subject: input.subject,
    body: input.body,
    include_qr_code: input.includeQrCode,
    is_active: input.isActive,
  };
  if (input.customEmails?.length) body.custom_emails = input.customEmails;
  if (input.excludedEmails) body.excluded_emails = input.excludedEmails;
  if (input.sendBeforeHours !== undefined) body.send_before_hours = input.sendBeforeHours;
  if (input.sendAfterHours !== undefined) body.send_after_hours = input.sendAfterHours;
  if (input.emailTemplateId != null) body.email_template_id = input.emailTemplateId;
  Object.assign(body, input.visitFields);
  await apiRequest(`/api/email-notifications/${id}`, { method: "PUT", token, body });
}

/** DELETE /api/email-notifications/{id} — remove a non-default notification. */
export async function deleteEmailNotification(token: string, id: number): Promise<void> {
  await apiRequest(`/api/email-notifications/${id}`, { method: "DELETE", token });
}

/** POST /api/email-notifications/{id}/duplicate — clone a notification. */
export async function duplicateEmailNotification(token: string, id: number): Promise<void> {
  await apiRequest(`/api/email-notifications/${id}/duplicate`, { method: "POST", token });
}

/** POST /api/email-notifications/{id}/send-test — send a test email to one address. */
export async function sendTestEmailNotification(
  token: string,
  id: number,
  email: string,
): Promise<void> {
  await apiRequest(`/api/email-notifications/${id}/send-test`, {
    method: "POST",
    token,
    body: { email },
  });
}

/** POST /api/email-notifications/{id}/reset-default — restore a default's template. */
export async function resetDefaultNotification(token: string, id: number): Promise<void> {
  await apiRequest(`/api/email-notifications/${id}/reset-default`, {
    method: "POST",
    token,
  });
}

export type NotificationEntityType = NotificationEntity;
export type NotificationRecipientType =
  | "customer"
  | "staff"
  | "company_admin"
  | "location_manager"
  | "custom";

export type CreateEmailNotificationInput = {
  name: string;
  triggerType: string;
  entityType: NotificationEntityType;
  recipientTypes: NotificationRecipientType[];
  customEmails?: string[];
  /**
   * Don't Send To. Sent whenever given — an empty list too, so removing the
   * last address saves — and left as it is on the server when omitted.
   */
  excludedEmails?: string[];
  /** Reminder / follow-up timing; each sent only when given (null clears it). */
  sendBeforeHours?: number | null;
  sendAfterHours?: number | null;
  subject: string;
  body: string;
  includeQrCode: boolean;
  isActive: boolean;
  emailTemplateId?: number | null;
  /** Visit-email keys (recipients, promo, sender, review link, activity), applied last. */
  visitFields?: VisitPayloadFields;
};

/** POST /api/email-notifications — create an automated per-event email. */
export async function createEmailNotification(
  token: string,
  input: CreateEmailNotificationInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    trigger_type: input.triggerType,
    entity_type: input.entityType,
    recipient_types: input.recipientTypes,
    subject: input.subject,
    body: input.body,
    include_qr_code: input.includeQrCode,
    is_active: input.isActive,
  };
  if (input.customEmails?.length) body.custom_emails = input.customEmails;
  if (input.excludedEmails) body.excluded_emails = input.excludedEmails;
  if (input.sendBeforeHours !== undefined) body.send_before_hours = input.sendBeforeHours;
  if (input.sendAfterHours !== undefined) body.send_after_hours = input.sendAfterHours;
  if (input.emailTemplateId != null) body.email_template_id = input.emailTemplateId;
  Object.assign(body, input.visitFields);
  await apiRequest("/api/email-notifications", { method: "POST", token, body });
}

/** Trigger-event options for a notification, grouped for the picker. */
export const NOTIFICATION_TRIGGER_GROUPS: {
  label: string;
  options: { value: string; label: string }[];
}[] = ALL_TRIGGER_GROUPS;

/** Curated merge variables for the notification composer (mirrors the web groups). */
export const NOTIFICATION_VARIABLE_GROUPS: {
  title: string;
  vars: EmailVariable[];
}[] = [
  {
    title: "Customer Variables",
    vars: [
      { name: "customer_name", description: "Full customer name" },
      { name: "customer_first_name", description: "Customer first name" },
      { name: "customer_last_name", description: "Customer last name" },
      { name: "customer_email", description: "Customer email" },
    ],
  },
  {
    title: "Booking Variables",
    vars: [
      { name: "booking_reference", description: "Booking reference number" },
      { name: "booking_date", description: "Booking date" },
      { name: "booking_time", description: "Booking time" },
      { name: "participants", description: "Number of participants" },
      { name: "total_amount", description: "Total amount" },
    ],
  },
  {
    title: "Package Variables",
    vars: [
      { name: "package_name", description: "Package name" },
      { name: "package_price", description: "Package price" },
    ],
  },
  {
    title: "Room Variables",
    vars: [
      { name: "room_name", description: "Room / space name" },
      { name: "room_capacity", description: "Room capacity" },
    ],
  },
];
