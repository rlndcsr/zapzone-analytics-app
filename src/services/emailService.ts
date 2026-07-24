import { apiRequest } from "../lib/api";

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

/* ------------------------------------------------------------------ */
/* Email templates                                                     */
/* ------------------------------------------------------------------ */

export type EmailTemplateStatus = "active" | "draft" | "archived";

export type EmailTemplateRow = {
  id: number;
  name: string;
  subject: string;
  category: string;
  status: EmailTemplateStatus;
  createdAt: string | null;
};

type RawTemplate = {
  id: number;
  name?: string | null;
  subject?: string | null;
  category?: string | null;
  status?: string | null;
  created_at?: string | null;
};

/** One insertable merge variable, e.g. {@literal {{ recipient_email }}}. */
export type EmailVariable = { name: string; description: string };

/** Grouped merge variables for the composer's "Template Variables" panel. */
export type EmailVariableGroups = {
  default: EmailVariable[];
  customer: EmailVariable[];
  user: EmailVariable[];
};

const toVarList = (rec: Record<string, string> | undefined): EmailVariable[] =>
  Object.entries(rec ?? {}).map(([name, description]) => ({ name, description }));

/** GET /api/email-templates/variables — merge fields grouped default/customer/user. */
export async function fetchEmailTemplateVariables(
  token: string,
): Promise<EmailVariableGroups> {
  const res = await apiRequest<{
    data?: {
      default?: Record<string, string>;
      customer?: Record<string, string>;
      user?: Record<string, string>;
    };
  }>("/api/email-templates/variables", { token });
  const d = res?.data ?? {};
  return {
    default: toVarList(d.default),
    customer: toVarList(d.customer),
    user: toVarList(d.user),
  };
}

export type CreateEmailTemplateInput = {
  name: string;
  subject: string;
  body: string;
  status: EmailTemplateStatus;
  category?: string;
  locationId?: number | null;
};

/** POST /api/email-templates — create a reusable template. */
export async function createEmailTemplate(
  token: string,
  input: CreateEmailTemplateInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    body: input.body,
    status: input.status,
  };
  if (input.category) body.category = input.category;
  if (input.locationId != null) body.location_id = input.locationId;
  await apiRequest("/api/email-templates", { method: "POST", token, body });
}

/** GET /api/email-templates — reusable templates for the company. */
export async function fetchEmailTemplates(
  token: string,
): Promise<{ rows: EmailTemplateRow[]; total: number }> {
  const res = await apiRequest<unknown>(`/api/email-templates?per_page=${PER_PAGE}`, {
    token,
  });
  const { rows, total } = extractPaginated<RawTemplate>(res);
  return {
    total,
    rows: rows.map((t) => ({
      id: t.id,
      name: t.name?.trim() || "Untitled template",
      subject: t.subject?.trim() || "",
      category: t.category?.trim() || "General",
      status: (t.status ?? "draft") as EmailTemplateStatus,
      createdAt: t.created_at ?? null,
    })),
  };
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
  const res = await apiRequest<unknown>(`/api/email-campaigns?per_page=${PER_PAGE}`, {
    token,
  });
  const { rows, total } = extractPaginated<RawCampaign>(res);
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
  | "custom";

export type CreateEmailCampaignInput = {
  name: string;
  subject: string;
  body: string;
  recipientTypes: CampaignRecipientType[];
  customEmails?: string[];
  emailTemplateId?: number | null;
  sendNow: boolean;
  locationId?: number | null;
};

/** POST /api/email-campaigns — create a bulk send (draft when sendNow is false). */
export async function createEmailCampaign(
  token: string,
  input: CreateEmailCampaignInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    subject: input.subject,
    body: input.body,
    recipient_types: input.recipientTypes,
    send_now: input.sendNow,
  };
  if (input.customEmails?.length) body.custom_emails = input.customEmails;
  if (input.emailTemplateId != null) body.email_template_id = input.emailTemplateId;
  if (input.locationId != null) body.location_id = input.locationId;
  await apiRequest("/api/email-campaigns", { method: "POST", token, body });
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

/* ------------------------------------------------------------------ */
/* Email notifications                                                 */
/* ------------------------------------------------------------------ */

export type EmailNotificationRow = {
  id: number;
  name: string;
  triggerType: string;
  triggerLabel: string;
  entityLabel: string;
  recipientCount: number;
  isActive: boolean;
  isDefault: boolean;
};

type RawNotification = {
  id: number;
  name?: string | null;
  trigger_type?: string | null;
  entity_type?: string | null;
  recipient_types?: string[] | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
};

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
  const res = await apiRequest<unknown>(
    `/api/email-notifications?per_page=${PER_PAGE}`,
    { token },
  );
  const { rows, total } = extractPaginated<RawNotification>(res);
  const mapped: EmailNotificationRow[] = rows.map((n) => ({
    id: n.id,
    name: n.name?.trim() || "Notification",
    triggerType: n.trigger_type ?? "",
    triggerLabel: humanize(n.trigger_type),
    entityLabel: humanize(n.entity_type) || "—",
    recipientCount: Array.isArray(n.recipient_types) ? n.recipient_types.length : 0,
    isActive: n.is_active !== false,
    isDefault: !!n.is_default,
  }));

  const stats: EmailNotificationStats = {
    total,
    active: mapped.filter((n) => n.isActive).length,
    bookingTriggers: mapped.filter((n) => n.triggerType.includes("booking")).length,
    purchaseTriggers: mapped.filter((n) => n.triggerType.includes("purchase")).length,
  };

  return { rows: mapped, total, stats };
}

export type NotificationEntityType = "all" | "package" | "attraction";
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
  subject: string;
  body: string;
  includeQrCode: boolean;
  isActive: boolean;
  emailTemplateId?: number | null;
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
  if (input.emailTemplateId != null) body.email_template_id = input.emailTemplateId;
  await apiRequest("/api/email-notifications", { method: "POST", token, body });
}

/** Trigger-event options for a notification, grouped for the picker. */
export const NOTIFICATION_TRIGGER_GROUPS: {
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    label: "Booking Events",
    options: [
      { value: "booking_created", label: "Booking Created" },
      { value: "booking_confirmed", label: "Booking Confirmed" },
      { value: "booking_updated", label: "Booking Updated" },
      { value: "booking_rescheduled", label: "Booking Rescheduled" },
      { value: "booking_cancelled", label: "Booking Cancelled" },
      { value: "booking_checked_in", label: "Booking Checked In" },
      { value: "booking_completed", label: "Booking Completed" },
      { value: "booking_reminder", label: "Booking Reminder" },
      { value: "booking_followup", label: "Booking Follow-up" },
      { value: "booking_no_show", label: "Booking No-Show" },
    ],
  },
  {
    label: "Purchase Events",
    options: [
      { value: "purchase_created", label: "Purchase Created" },
      { value: "purchase_confirmed", label: "Purchase Confirmed" },
      { value: "purchase_cancelled", label: "Purchase Cancelled" },
      { value: "purchase_completed", label: "Purchase Completed" },
      { value: "purchase_checked_in", label: "Purchase Checked In" },
      { value: "purchase_refunded", label: "Purchase Refunded" },
      { value: "purchase_reminder", label: "Purchase Reminder" },
      { value: "purchase_followup", label: "Purchase Follow-up" },
    ],
  },
  {
    label: "Payment Events",
    options: [
      { value: "payment_received", label: "Payment Received" },
      { value: "payment_failed", label: "Payment Failed" },
      { value: "payment_refunded", label: "Payment Refunded" },
      { value: "payment_partial", label: "Partial Payment" },
      { value: "payment_pending", label: "Payment Pending" },
    ],
  },
  {
    label: "Reports",
    options: [
      { value: "end_of_day_sales_report", label: "End of Day Sales Report" },
    ],
  },
];

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
