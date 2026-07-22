import { apiRequest } from "../lib/api";
import type { AppliedDiscount, AppliedFee } from "./pricingService";

/** Booking lifecycle status, mirroring the backend `status` enum. */
export type EventPurchaseStatus =
  | "pending"
  | "confirmed"
  | "checked-in"
  | "completed"
  | "cancelled";

/** Payment settlement state, mirroring the backend `payment_status` enum. */
export type EventPaymentStatus =
  | "paid"
  | "partial"
  | "pending"
  | "refunded"
  | "voided";

/** Flattened event-purchase row backing the list + KPI cards. */
export type EventPurchaseRow = {
  id: number;
  referenceNumber: string;
  eventName: string;
  customerName: string;
  email: string;
  phone: string;
  quantity: number;
  /** Booking lifecycle (pending → confirmed → checked-in → completed). */
  status: EventPurchaseStatus;
  /** Payment settlement (paid / partial / pending / refunded / voided). */
  paymentStatus: EventPaymentStatus;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: string;
  createdAt: string;
  purchaseDate: string | null;
  purchaseTime: string | null;
  locationId: number | null;
  /** True when there's no linked customer (guest / walk-in) — drives the web
   *  "Customer Type" filter. */
  isGuest: boolean;
  /** Soft-delete timestamp; only present for trashed purchases. */
  deletedAt: string | null;
};

type RawEventPurchase = {
  id: number;
  reference_number?: string | null;
  quantity?: number | string | null;
  status?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_method?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  location_id?: number | null;
  purchase_date?: string | null;
  purchase_time?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  event?: { name?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

// Web loads a single large page and filters/sorts client-side; mirror that.
const PER_PAGE = 100;

function mapPurchase(raw: RawEventPurchase): EventPurchaseRow {
  const customerName = raw.customer
    ? `${raw.customer.first_name ?? ""} ${raw.customer.last_name ?? ""}`.trim()
    : "";

  return {
    id: raw.id,
    referenceNumber: raw.reference_number?.trim() || "",
    eventName: raw.event?.name?.trim() || "Unknown Event",
    customerName: customerName || raw.guest_name?.trim() || "Walk-in Customer",
    email: raw.customer?.email ?? raw.guest_email ?? "",
    phone: raw.customer?.phone ?? raw.guest_phone ?? "",
    quantity: Number(raw.quantity ?? 0),
    status: (raw.status as EventPurchaseStatus) ?? "pending",
    paymentStatus: (raw.payment_status as EventPaymentStatus) ?? "pending",
    totalAmount: Number(raw.total_amount ?? 0),
    amountPaid: Number(raw.amount_paid ?? 0),
    paymentMethod: raw.payment_method ?? "",
    createdAt: raw.created_at ?? "",
    purchaseDate: raw.purchase_date ?? null,
    purchaseTime: raw.purchase_time ?? null,
    locationId: raw.location_id ?? null,
    isGuest: !raw.customer,
    deletedAt: raw.deleted_at ?? null,
  };
}

// The /event-purchases response nests the list under `data.purchases`,
// `data.event_purchases`, or `data` — mirror the web's resilient reader.
function extractPurchases(res: unknown): RawEventPurchase[] {
  if (Array.isArray(res)) return res as RawEventPurchase[];
  const data = (res as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as RawEventPurchase[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.purchases)) return obj.purchases as RawEventPurchase[];
    if (Array.isArray(obj.event_purchases)) return obj.event_purchases as RawEventPurchase[];
    if (Array.isArray(obj.data)) return obj.data as RawEventPurchase[];
  }
  return [];
}

type FetchParams = {
  token: string;
  userId: number;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/event-purchases — the same endpoint the web Event Purchases page
 * uses. Returns all event purchases the user can access.
 */
export async function fetchEventPurchases({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<EventPurchaseRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    user_id: String(userId),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<unknown>(
    `/api/event-purchases?${params.toString()}`,
    { token, signal },
  );
  return extractPurchases(res).map(mapPurchase);
}

/**
 * GET /api/event-purchases/trashed — soft-deleted purchases (the web "View
 * Deleted" list). Read-only here; restore/force-delete come later.
 */
export async function fetchTrashedEventPurchases({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<EventPurchaseRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    user_id: String(userId),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<unknown>(
    `/api/event-purchases/trashed?${params.toString()}`,
    { token, signal },
  );
  return extractPurchases(res).map(mapPurchase);
}

/** One add-on line on a new purchase. */
export type EventPurchaseAddonInput = {
  add_on_id: number;
  quantity: number;
  price_at_purchase: number;
};

/**
 * Payload for POST /api/event-purchases — mirrors the web on-site purchase
 * (in-store / pay-later; card payment is web-only and deferred). Fees and
 * special-pricing discounts are computed server-side and echoed back on submit
 * as `applied_fees` / `applied_discounts` (same as the web).
 */
export type CreateEventPurchaseInput = {
  event_id: number;
  customer_id?: number | null;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  location_id: number;
  purchase_date: string;
  purchase_time: string;
  quantity: number;
  total_amount: number;
  amount_paid: number;
  discount_amount?: number;
  payment_method: "in-store" | "paylater";
  payment_status?: string;
  status?: "confirmed";
  notes?: string;
  send_email: boolean;
  add_ons?: EventPurchaseAddonInput[];
  applied_fees?: AppliedFee[];
  applied_discounts?: AppliedDiscount[];
};

type CreatePurchaseResponse = {
  success: boolean;
  data: { id: number } & Record<string, unknown>;
  message?: string;
};

/** POST /api/event-purchases — create an on-site event purchase. */
export async function createEventPurchase(
  token: string,
  input: CreateEventPurchaseInput,
): Promise<{ id: number }> {
  const res = await apiRequest<CreatePurchaseResponse>("/api/event-purchases", {
    method: "POST",
    token,
    body: input,
  });
  return { id: res.data.id };
}

/* ----------------------------------------------- purchase detail + delete -- */

/** A fee line applied to a purchase (mirrors web `applied_fees`). */
export type EventAppliedFee = { name: string; amount: number };
/** A discount line applied to a purchase (mirrors web `applied_discounts`). */
export type EventAppliedDiscount = { name: string; amount: number };
/** One purchased add-on line on the detail screen. */
export type EventPurchaseAddonLine = {
  id: number;
  name: string;
  quantity: number;
  priceAtPurchase: number;
};

/**
 * Full event-purchase record backing the details screen — the flattened form of
 * GET /api/event-purchases/{id} (the same endpoint the web ViewEventPurchase
 * page uses).
 */
export type EventPurchaseDetail = {
  id: number;
  referenceNumber: string;
  status: EventPurchaseStatus;
  paymentStatus: EventPaymentStatus;
  customerName: string;
  email: string;
  phone: string;
  isGuest: boolean;
  eventName: string;
  locationName: string;
  quantity: number;
  createdAt: string;
  purchaseDate: string | null;
  purchaseTime: string | null;
  totalAmount: number;
  amountPaid: number;
  discountAmount: number;
  paymentMethod: string;
  transactionId: string | null;
  notes: string;
  specialRequests: string;
  addOns: EventPurchaseAddonLine[];
  appliedFees: EventAppliedFee[];
  appliedDiscounts: EventAppliedDiscount[];
};

type RawEventAddonLine = {
  id?: number;
  name?: string | null;
  price?: number | string | null;
  pivot?: {
    quantity?: number | string | null;
    price_at_purchase?: number | string | null;
  } | null;
};

type RawEventPurchaseDetail = RawEventPurchase & {
  transaction_id?: string | null;
  discount_amount?: number | string | null;
  notes?: string | null;
  special_requests?: string | null;
  location?: { name?: string | null } | null;
  add_ons?: RawEventAddonLine[] | null;
  applied_fees?:
    | { fee_name?: string | null; fee_amount?: number | string | null }[]
    | null;
  applied_discounts?:
    | { discount_name?: string | null; discount_amount?: number | string | null }[]
    | null;
};

function mapDetail(raw: RawEventPurchaseDetail): EventPurchaseDetail {
  const base = mapPurchase(raw);
  return {
    id: base.id,
    referenceNumber: base.referenceNumber,
    status: base.status,
    paymentStatus: base.paymentStatus,
    customerName: base.customerName,
    email: base.email,
    phone: base.phone,
    isGuest: base.isGuest,
    eventName: base.eventName,
    locationName: raw.location?.name?.trim() || "",
    quantity: base.quantity,
    createdAt: base.createdAt,
    purchaseDate: base.purchaseDate,
    purchaseTime: base.purchaseTime,
    totalAmount: base.totalAmount,
    amountPaid: base.amountPaid,
    discountAmount: Number(raw.discount_amount ?? 0),
    paymentMethod: base.paymentMethod,
    transactionId: raw.transaction_id ?? null,
    notes: raw.notes?.trim() || "",
    specialRequests: raw.special_requests?.trim() || "",
    addOns: (raw.add_ons ?? []).map((a, i) => ({
      id: a.id ?? i,
      name: a.name?.trim() || "Add-on",
      quantity: Number(a.pivot?.quantity ?? 1),
      priceAtPurchase: Number(a.pivot?.price_at_purchase ?? a.price ?? 0),
    })),
    appliedFees: (raw.applied_fees ?? []).map((f) => ({
      name: f.fee_name?.trim() || "Fee",
      amount: Number(f.fee_amount ?? 0),
    })),
    appliedDiscounts: (raw.applied_discounts ?? []).map((d) => ({
      name: d.discount_name?.trim() || "Discount",
      amount: Number(d.discount_amount ?? 0),
    })),
  };
}

/**
 * Unwrap a single event-purchase from the show response. The backend `show()`
 * returns the model DIRECTLY (`response()->json($eventPurchase)`) — a bare
 * object with no `{ data }` envelope — unlike the attraction-purchase show,
 * which wraps in `{ success, data }`. Accept both (and a `{ data: {...} }`
 * fallback), mirroring the web ViewEventPurchase reader
 * `raw?.data ? raw.data : (raw?.id ? raw : null)`.
 */
function extractPurchase(res: unknown): RawEventPurchaseDetail | null {
  if (!res || typeof res !== "object") return null;
  const obj = res as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object") {
    return obj.data as RawEventPurchaseDetail;
  }
  if (typeof obj.id === "number" || typeof obj.id === "string") {
    return obj as RawEventPurchaseDetail;
  }
  return null;
}

/** GET /api/event-purchases/{id} — full record for the details screen. */
export async function fetchEventPurchaseDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<EventPurchaseDetail | null> {
  const res = await apiRequest<unknown>(`/api/event-purchases/${id}`, {
    token,
    signal,
  });
  const raw = extractPurchase(res);
  return raw ? mapDetail(raw) : null;
}

/**
 * PATCH /api/event-purchases/{id}/status — update a purchase's status. Mirrors
 * the web `updateStatus` the bulk bar loops over (no bulk-status endpoint).
 */
export async function updateEventPurchaseStatus(
  token: string,
  id: number,
  status: EventPurchaseStatus,
): Promise<void> {
  await apiRequest(`/api/event-purchases/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
}

/**
 * DELETE /api/event-purchases/{id} — soft-delete a purchase. Same endpoint the
 * web Event Purchases uses (`deletePurchase`); no dedicated mobile route.
 */
export async function deleteEventPurchase(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/event-purchases/${id}`, { method: "DELETE", token });
}
