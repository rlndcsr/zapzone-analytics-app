import { apiRequest, apiUrl } from "../lib/api";

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
  methodLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  /** Set for trashed rows (the DELETED AT column). */
  deletedAt: string | null;
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
  payable_type?: string | null;
  amount?: number | string | null;
  method?: string | null;
  status?: string | null;
  created_at?: string | null;
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
    methodLabel: methodLabel(raw.method),
    status: raw.status ?? "pending",
    statusLabel: humanize(raw.status) || "Pending",
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
    deletedAt: raw.deleted_at ?? null,
  };
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

/** PATCH /api/payments/{id}/restore — restore a soft-deleted payment. */
export async function restorePayment(token: string, id: number): Promise<void> {
  await apiRequest(`/api/payments/${id}/restore`, { method: "PATCH", token });
}

/** DELETE /api/payments/{id}/force-delete — permanently delete a payment. */
export async function forceDeletePayment(token: string, id: number): Promise<void> {
  await apiRequest(`/api/payments/${id}/force-delete`, { method: "DELETE", token });
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
