import { apiRequest } from "../lib/api";

/** Purchase status, normalized like the web ("completed" -> "confirmed"). */
export type PurchaseStatus =
  | "confirmed"
  | "pending"
  | "checked-in"
  | "cancelled"
  | "refunded"
  | "voided";

/** Flattened attraction-purchase row backing the list + KPI cards. */
export type PurchaseRow = {
  id: number;
  attractionName: string;
  category: string;
  customerName: string;
  email: string;
  phone: string;
  quantity: number;
  status: PurchaseStatus;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: string;
  createdAt: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  locationId: number | null;
  /** Soft-delete timestamp; only present for trashed purchases. */
  deletedAt: string | null;
};

type RawPurchase = {
  id: number;
  quantity?: number | string | null;
  status?: string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_method?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  location_id?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  attraction?: { name?: string | null; category?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type PurchasesListResponse = {
  success: boolean;
  data: {
    purchases: RawPurchase[];
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
};

// The web Manage Purchases KPIs aggregate over its purchase *cache*, which
// holds the full purchase set (filled by a background sync); the cards are
// computed client-side over that whole list. To match, we must load the full
// set too — a single page (per_page: 100) truncated the data and skewed every
// KPI. We request a large page and then page through `last_page`, so we get
// every record whether the backend honours the large page (1 request) or caps
// per_page server-side (the minimum necessary requests) — the same page-all
// approach already used for bookings.
const PER_PAGE = 500;
// Deleted ("trashed") view keeps its own page size — it has no KPI cards and
// stays a client-paginated list, so its data loading is intentionally
// unaffected by the KPI fix.
const TRASHED_PER_PAGE = 100;

function mapPurchase(raw: RawPurchase): PurchaseRow {
  const customerName = raw.customer
    ? `${raw.customer.first_name ?? ""} ${raw.customer.last_name ?? ""}`.trim()
    : "";
  // Backend "completed" is shown as "confirmed" on the web.
  const status = (raw.status === "completed" ? "confirmed" : raw.status) as PurchaseStatus;

  return {
    id: raw.id,
    attractionName: raw.attraction?.name?.trim() || "Unknown Attraction",
    category: raw.attraction?.category?.trim() || "",
    customerName: customerName || raw.guest_name?.trim() || "Walk-in Customer",
    email: raw.customer?.email ?? raw.guest_email ?? "",
    phone: raw.customer?.phone ?? raw.guest_phone ?? "",
    quantity: Number(raw.quantity ?? 0),
    status: status ?? "pending",
    totalAmount: Number(raw.total_amount ?? 0),
    amountPaid: Number(raw.amount_paid ?? 0),
    paymentMethod: raw.payment_method ?? "",
    createdAt: raw.created_at ?? "",
    scheduledDate: raw.scheduled_date ?? null,
    scheduledTime: raw.scheduled_time ?? null,
    locationId: raw.location_id ?? null,
    deletedAt: raw.deleted_at ?? null,
  };
}

type FetchParams = {
  token: string;
  userId: number;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/attraction-purchases — the same endpoint the web Manage Purchases
 * page uses. Returns all attraction purchases the user can access.
 */
export async function fetchAttractionPurchases({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<PurchaseRow[]> {
  const all: RawPurchase[] = [];
  let page = 1;
  let lastPage = 1;

  // Page through every page so the KPI aggregation sees the complete dataset,
  // regardless of any server-side per_page cap (see PER_PAGE note above).
  do {
    const params = new URLSearchParams({
      per_page: String(PER_PAGE),
      page: String(page),
      user_id: String(userId),
    });
    if (locationId != null) params.append("location_id", String(locationId));

    const res = await apiRequest<PurchasesListResponse>(
      `/api/attraction-purchases?${params.toString()}`,
      { token, signal },
    );
    all.push(...(res?.data?.purchases ?? []));
    lastPage = res?.data?.pagination?.last_page ?? page;
    page += 1;
  } while (page <= lastPage);

  return all.map(mapPurchase);
}

/** One add-on line on a new purchase. */
export type PurchaseAddonInput = {
  addon_id: number;
  quantity: number;
  price_at_purchase: number;
};

/**
 * Payload for POST /api/attraction-purchases — mirrors the web on-site
 * purchase (in-store / pay-later; card payment is web-only and deferred).
 */
export type CreateAttractionPurchaseInput = {
  attraction_id: number;
  customer_id?: number;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  quantity: number;
  amount: number;
  total_amount: number;
  amount_paid: number;
  currency: "USD";
  method: "cash" | "paylater";
  payment_method: "in-store" | "paylater";
  status?: "confirmed";
  location_id: number;
  purchase_date: string;
  scheduled_date?: string;
  scheduled_time?: string;
  notes?: string;
  send_email: boolean;
  additional_addons?: PurchaseAddonInput[];
};

type CreatePurchaseResponse = {
  success: boolean;
  data: { id: number } & Record<string, unknown>;
  message?: string;
};

/** POST /api/attraction-purchases — create an on-site purchase. */
export async function createAttractionPurchase(
  token: string,
  input: CreateAttractionPurchaseInput,
): Promise<{ id: number }> {
  const res = await apiRequest<CreatePurchaseResponse>(
    "/api/attraction-purchases",
    { method: "POST", token, body: input },
  );
  return { id: res.data.id };
}

/* ----------------------------------------------------- purchase detail --- */

/** A fee line applied to a purchase (mirrors web `applied_fees`). */
export type AppliedFee = {
  name: string;
  amount: number;
  applicationType: "additive" | "inclusive";
};

/** One purchased add-on line on the detail screen. */
export type PurchaseAddonLine = {
  id: number;
  name: string;
  quantity: number;
  priceAtPurchase: number;
};

/**
 * Full attraction-purchase record backing the Purchase Details screen — the
 * flattened form of GET /api/attraction-purchases/{id} (the same endpoint the
 * web PurchaseDetails page uses).
 */
export type AttractionPurchaseDetail = {
  id: number;
  status: PurchaseStatus;
  customerName: string;
  email: string;
  phone: string;
  quantity: number;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: string;
  transactionId: string | null;
  paymentId: string | null;
  createdAt: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  notes: string;
  locationId: number | null;
  attractionName: string;
  category: string;
  /** 0/null means "Unlimited". */
  duration: number | null;
  durationUnit: string;
  addOns: PurchaseAddonLine[];
  appliedFees: AppliedFee[];
};

type RawAddonLine = {
  id?: number;
  name?: string | null;
  price?: number | string | null;
  price_at_purchase?: number | string | null;
  quantity?: number | string | null;
  add_on?: { name?: string | null } | null;
  pivot?: {
    quantity?: number | string | null;
    price_at_purchase?: number | string | null;
  } | null;
};

type RawPurchaseDetail = RawPurchase & {
  transaction_id?: string | null;
  payment_id?: string | null;
  total_amount?: number | string | null;
  notes?: string | null;
  attraction?: {
    name?: string | null;
    category?: string | null;
    duration?: number | string | null;
    duration_unit?: string | null;
  } | null;
  add_ons?: RawAddonLine[] | null;
  applied_fees?:
    | {
        fee_name?: string | null;
        fee_amount?: number | string | null;
        fee_application_type?: "additive" | "inclusive" | null;
      }[]
    | null;
};

function mapDetail(raw: RawPurchaseDetail): AttractionPurchaseDetail {
  const base = mapPurchase(raw);
  const durationRaw =
    raw.attraction?.duration == null ? null : Number(raw.attraction.duration);
  return {
    id: base.id,
    status: base.status,
    customerName: base.customerName,
    email: base.email,
    phone: base.phone,
    quantity: base.quantity,
    totalAmount: base.totalAmount,
    amountPaid: base.amountPaid,
    paymentMethod: base.paymentMethod,
    transactionId: raw.transaction_id ?? null,
    paymentId: raw.payment_id ?? null,
    createdAt: base.createdAt,
    scheduledDate: base.scheduledDate,
    scheduledTime: base.scheduledTime,
    notes: raw.notes?.trim() || "",
    locationId: base.locationId,
    attractionName: base.attractionName,
    category: raw.attraction?.category?.trim() || "",
    duration: durationRaw && !Number.isNaN(durationRaw) ? durationRaw : null,
    durationUnit: raw.attraction?.duration_unit ?? "minutes",
    addOns: (raw.add_ons ?? []).map((a, i) => ({
      id: a.id ?? i,
      name: a.name?.trim() || a.add_on?.name?.trim() || "Add-on",
      quantity: Number(a.quantity ?? a.pivot?.quantity ?? 1),
      priceAtPurchase: Number(
        a.price_at_purchase ?? a.pivot?.price_at_purchase ?? a.price ?? 0,
      ),
    })),
    appliedFees: (raw.applied_fees ?? []).map((f) => ({
      name: f.fee_name?.trim() || "Fee",
      amount: Number(f.fee_amount ?? 0),
      applicationType: f.fee_application_type ?? "additive",
    })),
  };
}

/**
 * GET /api/attraction-purchases/{id} — full purchase record for the details
 * screen. Same endpoint the web PurchaseDetails page calls.
 */
export async function fetchAttractionPurchaseDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<AttractionPurchaseDetail | null> {
  const res = await apiRequest<{ success: boolean; data: RawPurchaseDetail | null }>(
    `/api/attraction-purchases/${id}`,
    { token, signal },
  );
  return res?.data ? mapDetail(res.data) : null;
}

/**
 * DELETE /api/attraction-purchases/{id} — soft-delete a purchase. Same endpoint
 * the web Manage Purchases uses (`deletePurchase`); no dedicated mobile route.
 */
export async function deleteAttractionPurchase(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/attraction-purchases/${id}`, {
    method: "DELETE",
    token,
  });
}

/** Envelope for a single-purchase response (verify / check-in). */
type SinglePurchaseResponse = {
  success: boolean;
  data: RawPurchase | null;
  message?: string;
};

/** Result of verifying or checking in a single attraction purchase. */
export type PurchaseActionResult = {
  success: boolean;
  purchase: PurchaseRow | null;
  message?: string;
};

type VerifyParams = {
  token: string;
  purchaseId: number;
  /** Staff member performing the scan (mirrors the web `user_id` query param). */
  userId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/attraction-purchases/{id}/verify — the same endpoint the web
 * check-in scanner calls to look up a scanned ticket. Returns the purchase so
 * the caller can gate on its status before checking in.
 */
export async function verifyAttractionPurchase({
  token,
  purchaseId,
  userId,
  signal,
}: VerifyParams): Promise<PurchaseActionResult> {
  const params = new URLSearchParams();
  if (userId != null) params.append("user_id", String(userId));
  const qs = params.toString();

  const res = await apiRequest<SinglePurchaseResponse>(
    `/api/attraction-purchases/${purchaseId}/verify${qs ? `?${qs}` : ""}`,
    { token, signal },
  );
  return {
    success: !!res?.success,
    purchase: res?.data ? mapPurchase(res.data) : null,
    message: res?.message,
  };
}

type FetchOneParams = {
  token: string;
  purchaseId: number;
  signal?: AbortSignal;
};

/**
 * GET /api/attraction-purchases/{id} — a single purchase. The web scanner uses
 * this to backfill `scheduled_date`/`scheduled_time` when the verify response
 * omits them; returns `null` if the purchase can't be resolved.
 */
export async function fetchAttractionPurchase({
  token,
  purchaseId,
  signal,
}: FetchOneParams): Promise<PurchaseRow | null> {
  const res = await apiRequest<SinglePurchaseResponse>(
    `/api/attraction-purchases/${purchaseId}`,
    { token, signal },
  );
  return res?.data ? mapPurchase(res.data) : null;
}

type CheckInParams = {
  token: string;
  purchaseId: number;
  /** Staff member performing the check-in (recorded as `checked_in_by`). */
  userId?: number;
};

/**
 * PATCH /api/attraction-purchases/{id}/check-in — marks a confirmed ticket as
 * used. Same endpoint + payload (`{ user_id? }`) the web scanner uses.
 */
export async function checkInAttractionPurchase({
  token,
  purchaseId,
  userId,
}: CheckInParams): Promise<PurchaseActionResult> {
  const res = await apiRequest<SinglePurchaseResponse>(
    `/api/attraction-purchases/${purchaseId}/check-in`,
    { method: "PATCH", token, body: userId != null ? { user_id: userId } : {} },
  );
  return {
    success: !!res?.success,
    purchase: res?.data ? mapPurchase(res.data) : null,
    message: res?.message,
  };
}

/**
 * GET /api/attraction-purchases/trashed — soft-deleted purchases (the web
 * "View Deleted" list). Read-only here; restore/force-delete come later.
 */
export async function fetchTrashedAttractionPurchases({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<PurchaseRow[]> {
  const params = new URLSearchParams({
    per_page: String(TRASHED_PER_PAGE),
    user_id: String(userId),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<PurchasesListResponse>(
    `/api/attraction-purchases/trashed?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.purchases ?? [];
  return items.map(mapPurchase);
}
