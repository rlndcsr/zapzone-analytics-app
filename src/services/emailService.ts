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
