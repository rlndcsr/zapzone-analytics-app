import { ApiError, apiRequest, apiUrl } from "../lib/api";
import { tokenizeCardWithAccept } from "../lib/payments/acceptTokenize";

/** Payment lifecycle status (backend `status` column). */
export type PaymentStatus =
  | "completed"
  | "pending"
  | "refunded"
  | "voided"
  | "failed"
  | string;

/** Flattened payment row backing the Payments list. */
export type PaymentRow = {
  id: number;
  /** Gateway transaction reference shown as the TRANSACTION number. */
  reference: string;
  /** Booking / event reference number (e.g. "BK2026…"), shown under the type. */
  payableReference: string | null;
  /** "Package Booking" / "Attraction" / "Event" from the payable type. */
  typeLabel: string;
  /** "19 guests" / "Qty: 3" — count phrased for the payable type. */
  countLabel: string | null;
  customerName: string;
  customerEmail: string;
  amount: number;
  /** Raw backend `method` ("authorize.net" / "cash" / …) — drives eligibility. */
  method: string;
  methodLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  /** Set for trashed rows (the DELETED AT column). */
  deletedAt: string | null;
  /** What this payment is for — refund/void/details all need the link. */
  payableId: number | null;
  payableType: string | null;
  notes: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  updatedAt: string | null;
  /** Customer signature captured at checkout (storage path or data URI). */
  signatureImage: string | null;
  /** null when the payment predates terms capture. */
  termsAccepted: boolean | null;
};

type RawPayable = {
  quantity?: number | null;
  participants?: number | null;
  reference_number?: string | null;
  // Guest-checkout name/email live on the payable when there's no customer record.
  guest_name?: string | null;
  guest_email?: string | null;
} | null;

type RawPayment = {
  id: number;
  transaction_id?: string | null;
  payment_id?: string | null;
  payable_id?: number | null;
  payable_type?: string | null;
  amount?: number | string | null;
  method?: string | null;
  status?: string | null;
  notes?: string | null;
  signature_image?: string | null;
  terms_accepted?: boolean | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  location?: { id?: number; name?: string | null } | null;
  location_id?: number | null;
  booking?: RawPayable;
  attraction_purchase?: RawPayable;
  event_purchase?: RawPayable;
};

const TYPE_LABELS: Record<string, string> = {
  booking: "Package Booking",
  attraction_purchase: "Attraction",
  event_purchase: "Event",
};

/** Humanize a snake_case / lowercase token into "Title Case". */
function humanize(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Map the backend `method` value to its display label. */
function methodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  const m = method.toLowerCase();
  if (m === "authorize_net" || m === "authorizenet" || m === "authorize.net") {
    return "Authorize.Net";
  }
  return humanize(method);
}

/** Phrase the payable's count: bookings show guests, purchases show quantity. */
function countLabel(type: string | null | undefined, payable: RawPayable): string | null {
  if (!payable) return null;
  if (type === "booking") {
    return payable.participants != null ? `${payable.participants} guests` : null;
  }
  return payable.quantity != null ? `Qty: ${payable.quantity}` : null;
}

function mapPayment(raw: RawPayment): PaymentRow {
  // Only the payable matching `payable_type` is non-null; pick whichever is set.
  const payable = raw.booking ?? raw.attraction_purchase ?? raw.event_purchase ?? null;
  // Prefer the linked customer; fall back to the payable's guest name/email for
  // guest checkouts (no customer record) so cards never read "Unknown".
  const customerFull = `${raw.customer?.first_name ?? ""} ${raw.customer?.last_name ?? ""}`.trim();
  const email = raw.customer?.email?.trim() || payable?.guest_email?.trim() || "";
  const name = customerFull || payable?.guest_name?.trim() || email || "Unknown";
  return {
    id: raw.id,
    reference: raw.transaction_id?.trim() || raw.payment_id?.trim() || `#${raw.id}`,
    payableReference:
      raw.booking?.reference_number?.trim() ||
      raw.event_purchase?.reference_number?.trim() ||
      null,
    typeLabel: TYPE_LABELS[raw.payable_type ?? ""] || humanize(raw.payable_type) || "Payment",
    countLabel: countLabel(raw.payable_type, payable),
    customerName: name,
    customerEmail: email,
    amount: Number(raw.amount ?? 0),
    method: (raw.method ?? "").toLowerCase(),
    methodLabel: methodLabel(raw.method),
    status: raw.status ?? "pending",
    statusLabel: humanize(raw.status) || "Pending",
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
    deletedAt: raw.deleted_at ?? null,
    payableId: raw.payable_id ?? null,
    payableType: raw.payable_type ?? null,
    notes: raw.notes?.trim() || null,
    paidAt: raw.paid_at ?? null,
    refundedAt: raw.refunded_at ?? null,
    updatedAt: raw.updated_at ?? null,
    signatureImage: raw.signature_image?.trim() || null,
    termsAccepted: raw.terms_accepted ?? null,
  };
}

/* ------------------------------------------------- per-row action eligibility */

/** A payment can only be acted on when it is linked to something payable. */
const hasPayable = (p: PaymentRow) => p.payableId != null && !!p.payableType;

/** Gateway refund — settled Authorize.Net charges only (web `canRefund`). */
export function canRefund(p: PaymentRow): boolean {
  return hasPayable(p) && p.status === "completed" && p.method === "authorize.net";
}

/**
 * Void — Authorize.Net only, before settlement. The web treats anything older
 * than two days as settled and hides the action (web `canVoid`).
 */
export function canVoid(p: PaymentRow): boolean {
  if (!hasPayable(p)) return false;
  if (p.status !== "completed" && p.status !== "pending") return false;
  if (p.method !== "authorize.net") return false;
  const when = p.paidAt ?? p.createdAt;
  if (when) {
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(when).getTime() > twoDaysMs) return false;
  }
  return true;
}

/** Manual refund — cash / in-store / card, recorded without a gateway call. */
export function canManualRefund(p: PaymentRow): boolean {
  return (
    hasPayable(p) &&
    p.status === "completed" &&
    ["in-store", "cash", "card"].includes(p.method)
  );
}

/** Refund/void bookkeeping rows the backend writes alongside the original. */
export function isRefundRecord(p: PaymentRow): boolean {
  return p.status === "refunded" && !!p.notes?.includes("Refund from Payment #");
}

export function isVoidRecord(p: PaymentRow): boolean {
  return p.status === "voided" && !!p.notes?.includes("Void of Payment #");
}

/** "#123" out of "Refund from Payment #123" / "Void of Payment #123". */
export function originalPaymentId(notes: string | null): string | null {
  const match = notes?.match(/(?:Refund from|Void of) Payment #(\d+)/);
  return match ? match[1] : null;
}

function looksLikePayment(v: unknown): v is RawPayment {
  return !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "number";
}

// GET /api/payments returns { success, data: { payments: [...], pagination } }.
// The list has no aggregate/summary endpoint and no server-side search, so we
// pull a generous page and compute stats + search + paging client-side. This
// covers the current data volume; the page size is intentionally high so stats
// stay accurate.
const PER_PAGE = 1000;

function extractPayments(res: unknown): { rows: RawPayment[]; total: number } {
  const root = (res ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  const asArray = (v: unknown): RawPayment[] | null =>
    Array.isArray(v) && (v.length === 0 || looksLikePayment(v[0]))
      ? (v as RawPayment[])
      : null;

  const rows =
    asArray(data.payments) ?? asArray(data.data) ?? asArray(root.data) ?? asArray(res) ?? [];
  const pagination = (data.pagination ?? {}) as Record<string, unknown>;
  const total = typeof pagination.total === "number" ? pagination.total : rows.length;
  return { rows, total };
}

export type PaymentList = { rows: PaymentRow[]; total: number };

/** GET /api/payments — the payment transactions the user can access. */
export async function fetchPayments(token: string): Promise<PaymentList> {
  const res = await apiRequest<unknown>(`/api/payments?per_page=${PER_PAGE}`, {
    token,
  });
  const { rows, total } = extractPayments(res);
  return { rows: rows.map(mapPayment), total };
}

/** GET /api/payments/trashed — soft-deleted payments (the "View Deleted" list). */
export async function fetchTrashedPayments(token: string): Promise<PaymentList> {
  const res = await apiRequest<unknown>(`/api/payments/trashed?per_page=${PER_PAGE}`, {
    token,
  });
  const { rows, total } = extractPayments(res);
  return { rows: rows.map(mapPayment), total };
}

/* ------------------------------------------------------------ row actions -- */

/** PATCH /api/payments/{id}/refund — gateway refund via Authorize.Net. */
export async function refundPayment(
  token: string,
  id: number,
  amount?: number,
): Promise<void> {
  await apiRequest(`/api/payments/${id}/refund`, {
    method: "PATCH",
    token,
    body: amount != null ? { amount } : {},
  });
}

/** PATCH /api/payments/{id}/manual-refund — record a cash / in-store refund. */
export async function manualRefundPayment(
  token: string,
  id: number,
  body: { amount?: number; reason?: string } = {},
): Promise<void> {
  await apiRequest(`/api/payments/${id}/manual-refund`, {
    method: "PATCH",
    token,
    body,
  });
}

/** PATCH /api/payments/{id}/void — cancel an unsettled Authorize.Net charge. */
export async function voidPayment(token: string, id: number): Promise<void> {
  await apiRequest(`/api/payments/${id}/void`, { method: "PATCH", token });
}

/** DELETE /api/payments/{id} — soft delete (restorable from "View Deleted"). */
export async function deletePayment(token: string, id: number): Promise<void> {
  await apiRequest(`/api/payments/${id}`, { method: "DELETE", token });
}

/**
 * Absolute URL for one payment's invoice PDF. `stream` picks the view endpoint
 * (inline) over the download one, matching the web's `getInvoice(id, stream)`.
 * Returns a PDF, so callers fetch it with expo-file-system, not apiRequest.
 */
export function invoiceUrl(paymentId: number, stream = false): string {
  return apiUrl(`/api/payments/${paymentId}/invoice${stream ? "/view" : ""}`);
}

/**
 * Absolute URL for one PDF containing the selected payments' invoices — the
 * endpoint behind the web's "View Selected" / "Download Selected" bulk actions
 * (`exportBulkInvoices`). `view_mode=individual` gives one invoice per page.
 */
export function bulkInvoicesUrl(paymentIds: number[], stream = false): string {
  const qs = new URLSearchParams({ view_mode: "individual" });
  paymentIds.forEach((id) => qs.append("payment_ids[]", String(id)));
  if (stream) qs.append("stream", "true");
  return apiUrl(`/api/payments/invoices/export?${qs.toString()}`);
}

/** PATCH /api/payments/{id}/restore — restore a soft-deleted payment. */
export async function restorePayment(token: string, id: number): Promise<void> {
  await apiRequest(`/api/payments/${id}/restore`, { method: "PATCH", token });
}

/** DELETE /api/payments/{id}/force-delete — permanently delete a payment. */
export async function forceDeletePayment(token: string, id: number): Promise<void> {
  await apiRequest(`/api/payments/${id}/force-delete`, { method: "DELETE", token });
}

/* ------------------------------------------------- card payments (Authorize.Net) */

/** Public Accept.js credentials for a location (web `getAuthorizeNetPublicKey`). */
export type AuthorizeNetPublicKey = {
  apiLoginId: string;
  clientKey: string;
  environment: "sandbox" | "production";
  acceptJsUrl: string;
};

/** Opaque payment nonce the charge endpoint requires (never the raw card). */
export type PaymentOpaqueData = {
  dataDescriptor: string;
  dataValue: string;
};

/** Payable kinds accepted by POST /api/payments/charge (web `PAYMENT_TYPE`). */
export const PAYMENT_TYPE = {
  BOOKING: "booking",
  ATTRACTION_PURCHASE: "attraction_purchase",
  EVENT_PURCHASE: "event_purchase",
} as const;

export type PaymentPayableType =
  (typeof PAYMENT_TYPE)[keyof typeof PAYMENT_TYPE];

/** POST /api/payments/charge body (mirrors the web `PaymentChargeRequest`). */
export type PaymentChargeRequest = {
  location_id: number;
  opaqueData: PaymentOpaqueData;
  amount: number;
  order_id?: string;
  customer_id?: number;
  description?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  signature_image?: string;
  terms_accepted?: boolean;
  payable_id?: number;
  payable_type?: PaymentPayableType;
  send_email?: boolean;
  qr_code?: string;
};

export type PaymentChargeResponse = {
  success: boolean;
  message?: string;
  transaction_id?: string;
  auth_code?: string;
};

type PublicKeyResponse = {
  api_login_id?: string;
  client_key?: string;
  environment?: string;
  accept_js_url?: string;
};

/** GET /api/authorize-net/public-key/{locationId} — same endpoint as the web. */
export async function fetchAuthorizeNetPublicKey(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<AuthorizeNetPublicKey> {
  const res = await apiRequest<PublicKeyResponse>(
    `/api/authorize-net/public-key/${locationId}`,
    { token, signal },
  );
  const environment = res?.environment === "production" ? "production" : "sandbox";
  return {
    apiLoginId: res?.api_login_id ?? "",
    clientKey: res?.client_key ?? "",
    environment,
    acceptJsUrl:
      res?.accept_js_url ??
      (environment === "production"
        ? "https://js.authorize.net/v1/Accept.js"
        : "https://jstest.authorize.net/v1/Accept.js"),
  };
}

export type CardData = {
  cardNumber: string;
  month: string;
  year: string;
  cardCode: string;
};

/**
 * Turns card data into Authorize.Net opaque data — the mobile counterpart of
 * the web's `window.Accept.dispatchData`. Delegates to the Accept endpoint the
 * same way Authorize.Net's own mobile SDKs do; the card number goes device →
 * Authorize.Net and never reaches the ZapZone backend.
 */
export async function tokenizeCard(
  cardData: CardData,
  credentials: AuthorizeNetPublicKey,
): Promise<PaymentOpaqueData> {
  return tokenizeCardWithAccept(cardData, credentials);
}

/**
 * A charge round-trips through Authorize.Net, so it routinely outruns the
 * default 15s budget. The web uses axios with no timeout at all; this is
 * generous enough to behave the same without hanging forever.
 */
const CHARGE_TIMEOUT_MS = 60000;

/** POST /api/payments/charge — charges an already-tokenized card. */
export async function chargePayment(
  token: string,
  body: PaymentChargeRequest,
): Promise<PaymentChargeResponse> {
  return apiRequest<PaymentChargeResponse>("/api/payments/charge", {
    method: "POST",
    token,
    body,
    timeoutMs: CHARGE_TIMEOUT_MS,
  });
}

/**
 * Whether a thrown charge failure leaves the outcome genuinely unknown.
 *
 * Tokenization errors and HTTP rejections both prove no money moved: the first
 * never reaches our backend, the second was refused before or by the gateway.
 * A transport failure (`ApiError.status === 0` — timeout or dropped connection)
 * is different: the request may have been processed and only the response lost.
 * Rolling back on that could delete a record the customer actually paid for, so
 * callers must leave it alone and tell the operator to verify.
 */
export function chargeOutcomeUnknown(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}

/** What to tell the operator when a charge's outcome can't be determined. */
export const CHARGE_UNKNOWN_MESSAGE =
  "The payment result never came back, so it may or may not have gone through. " +
  "Check the Payments list before charging this card again.";

/**
 * Tokenize then charge — the mobile equivalent of the web's
 * `PaymentService.processCardPayment`, so every screen runs the two legs in the
 * same order with the same payload.
 *
 * A resolved response with `success: false` means the gateway declined; callers
 * roll back the record they created, exactly as the web does. A thrown error
 * usually means the same, EXCEPT when {@link chargeOutcomeUnknown} holds — see
 * that function for why those must not be rolled back.
 */
export async function processCardPayment(
  token: string,
  cardData: CardData,
  credentials: AuthorizeNetPublicKey,
  payment: Omit<PaymentChargeRequest, "opaqueData">,
): Promise<PaymentChargeResponse> {
  const opaqueData = await tokenizeCard(cardData, credentials);
  return chargePayment(token, { ...payment, opaqueData });
}

/**
 * The web's post-decline copy: it maps the gateway message to a reason and
 * always states that the record was cancelled and no charge was made, so the
 * operator knows not to retry against a half-created booking/purchase.
 *
 * @param message  Raw `message` from the failed charge response.
 * @param subject  What was rolled back — "purchase" or "booking".
 */
export function declineMessage(
  message: string | undefined,
  subject: "purchase" | "booking",
): string {
  const raw = (message ?? "").toLowerCase();
  const cancelled = `The ${subject} has been cancelled and no charges were made.`;
  if (raw.includes("declin"))
    return `Your card was declined. ${cancelled} Please check the card details or try a different card.`;
  if (raw.includes("insufficient"))
    return `Insufficient funds on the card. ${cancelled} Please try a different card or payment method.`;
  if (raw.includes("expired") || raw.includes("expiration"))
    return `The card appears to be expired. ${cancelled} Please use a different card.`;
  if (raw.includes("cvv") || raw.includes("security code"))
    return `Invalid security code (CVV). ${cancelled} Please check the code on the card and try again.`;
  return `Payment could not be processed. ${cancelled} Please check the card details and try again.`;
}

/** Filters for the Package Invoices PDF export. */
export type PackageInvoiceParams = {
  packageId: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  /** true → stream (view in browser); false/omitted → download attachment. */
  stream?: boolean;
};

/**
 * Absolute URL for GET /api/payments/package-invoices/export. The endpoint
 * returns a PDF stream, so callers download it with an Authorization header
 * (via expo-file-system) rather than {@link apiRequest}'s JSON handling.
 */
export function packageInvoicesUrl(params: PackageInvoiceParams): string {
  const qs = new URLSearchParams({ package_id: String(params.packageId) });
  if (params.startDate) qs.append("start_date", params.startDate);
  if (params.endDate) qs.append("end_date", params.endDate);
  if (params.status && params.status !== "all") qs.append("status", params.status);
  if (params.stream) qs.append("stream", "true");
  return apiUrl(`/api/payments/package-invoices/export?${qs.toString()}`);
}
