import { apiRequest } from "../lib/api";
import { fetchAllPages, uniqueById } from "../lib/fetchAllPages";

// Port of the web admin's SmsNotificationService (zappoint
// src/services/SmsNotificationService.ts) — the same /api/sms-notifications
// endpoints, so the app and the web edit one set of SMS templates.

export type SmsEntityType = "package" | "attraction" | "event" | "waiver" | "all";

export type SmsNotification = {
  id: number;
  name: string;
  description: string | null;
  trigger_type: string;
  entity_type: SmsEntityType | string;
  body: string | null;
  default_body: string | null;
  /** The body that is sent: the custom one, else the default. */
  effective_body?: string;
  recipient_types: string[];
  is_active: boolean;
  is_default: boolean;
  is_body_customized?: boolean;
};

export type SmsOptions = {
  /** Grouped `{ booking: { booking_confirmed: "Party Booking Confirmed" }, … }`. */
  trigger_types: Record<string, Record<string, string>>;
  entity_types: Record<string, string>;
  recipient_types: Record<string, string>;
  /** False until the server has its Twilio credentials — templates still edit. */
  sms_configured: boolean;
};

const BASE = "/api/sms-notifications";
/** The web asks for 200 a page; the list is a few dozen templates. */
const PER_PAGE = 200;
const MAX_PAGES = 10;

type Paginated<T> = { data?: { data?: T[]; last_page?: number } };
type Envelope<T> = { success?: boolean; message?: string; data: T };

/** GET /api/sms-notifications — every template, all pages. */
export async function fetchSmsNotifications(
  token: string,
): Promise<SmsNotification[]> {
  const rows = await fetchAllPages<SmsNotification>(
    async (page) => {
      const res = await apiRequest<Paginated<SmsNotification>>(
        `${BASE}?per_page=${PER_PAGE}&page=${page}`,
        { token },
      );
      return {
        items: res?.data?.data ?? [],
        lastPage: Number(res?.data?.last_page) || 1,
      };
    },
    { maxPages: MAX_PAGES },
  );
  return uniqueById(rows);
}

/** GET /api/sms-notifications/options — trigger labels, recipients, configured flag. */
export async function fetchSmsOptions(token: string): Promise<SmsOptions> {
  const res = await apiRequest<Envelope<SmsOptions>>(`${BASE}/options`, { token });
  return res.data;
}

/** PUT /api/sms-notifications/{id} — a default only takes body/recipients/active. */
export async function updateSmsNotification(
  token: string,
  id: number,
  payload: { body: string; recipient_types: string[]; is_active: boolean },
): Promise<SmsNotification> {
  const res = await apiRequest<Envelope<SmsNotification>>(`${BASE}/${id}`, {
    method: "PUT",
    token,
    body: payload,
  });
  return res.data;
}

/** PATCH /api/sms-notifications/{id}/toggle-status — flip Active / Off. */
export async function toggleSmsNotification(
  token: string,
  id: number,
): Promise<SmsNotification> {
  const res = await apiRequest<Envelope<SmsNotification>>(
    `${BASE}/${id}/toggle-status`,
    { method: "PATCH", token },
  );
  return res.data;
}

/** POST /api/sms-notifications/{id}/reset-default — back to the shipped wording. */
export async function resetSmsNotification(
  token: string,
  id: number,
): Promise<SmsNotification> {
  const res = await apiRequest<Envelope<SmsNotification>>(
    `${BASE}/${id}/reset-default`,
    { method: "POST", token },
  );
  return res.data;
}

/** POST /api/sms-notifications/{id}/send-test — a "[TEST]" copy with sample data. */
export async function sendTestSms(
  token: string,
  id: number,
  phone: string,
): Promise<{ success: boolean; message: string }> {
  const res = await apiRequest<{ success?: boolean; message?: string }>(
    `${BASE}/${id}/send-test`,
    { method: "POST", token, body: { phone } },
  );
  return {
    success: res?.success !== false,
    message: res?.message || "Test SMS sent",
  };
}

/** POST /api/sms-notifications/seed-defaults — add any default template the company lacks. */
export async function seedSmsDefaults(token: string): Promise<void> {
  await apiRequest(`${BASE}/seed-defaults`, { method: "POST", token });
}
