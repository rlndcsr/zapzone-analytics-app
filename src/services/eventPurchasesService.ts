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
