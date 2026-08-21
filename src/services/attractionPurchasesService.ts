import { apiRequest } from "../lib/api";
import type {
  AppliedDiscount as PayloadAppliedDiscount,
  AppliedFee as PayloadAppliedFee,
} from "./pricingService";

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
  /** Transaction date (YYYY-MM-DD), distinct from the scheduled visit. */
  purchaseDate: string | null;
  notes: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  locationId: number | null;
  /** Set when this ticket is a line of a bulk order, which locks its edits. */
  ticketOrderId: number | null;
  linePosition: number | null;
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
  ticket_order_id?: number | null;
  line_position?: number | null;
  purchase_date?: string | null;
  notes?: string | null;
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
    purchaseDate: raw.purchase_date ?? null,
    notes: raw.notes?.trim() || null,
    scheduledDate: raw.scheduled_date ?? null,
    scheduledTime: raw.scheduled_time ?? null,
    locationId: raw.location_id ?? null,
    ticketOrderId: raw.ticket_order_id ?? null,
    linePosition: raw.line_position ?? null,
    deletedAt: raw.deleted_at ?? null,
  };
}

type FetchParams = {
  token: string;
  userId: number;
  locationId?: number;
  /** Window on COALESCE(scheduled_date, purchase_date) — the web calendar's `scheduled_from`. */
  scheduledFrom?: string;
  /** Inclusive end of that window (web `scheduled_to`). */
  scheduledTo?: string;
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
  scheduledFrom,
  scheduledTo,
  signal,
}: FetchParams): Promise<PurchaseRow[]> {
  const all: RawPurchase[] = [];
  // The index sorts by non-unique `purchase_date`, so LIMIT/OFFSET paging can
  // repeat a row across pages and double-count tickets — key by id.
  const seen = new Set<number>();
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
    if (scheduledFrom) params.append("scheduled_from", scheduledFrom);
    if (scheduledTo) params.append("scheduled_to", scheduledTo);

    const res = await apiRequest<PurchasesListResponse>(
      `/api/attraction-purchases?${params.toString()}`,
      { token, signal },
    );
    for (const raw of res?.data?.purchases ?? []) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      all.push(raw);
    }
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
 * purchase. Card purchases post this first (unpaid), then charge the card via
 * `POST /api/payments/charge`, exactly as the web `CreatePurchase` does.
 */
export type CreateAttractionPurchaseInput = {
  attraction_id: number;
  customer_id?: number;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  /** Billing address — the same fields the web purchase form collects. */
  guest_address?: string;
  guest_city?: string;
  guest_state?: string;
  guest_zip?: string;
  /** 2-letter country code, as the web submits it. */
  guest_country?: string;
  /** Opt-in for automated / promotional SMS (web `sms_consent`). */
  sms_consent?: boolean;
  quantity: number;
  amount: number;
  total_amount: number;
  amount_paid: number;
  currency: "USD";
  /** Web parity: "in-store" maps to `cash`; the other two pass through as-is. */
  method: "cash" | "paylater" | "authorize.net";
  payment_method: "in-store" | "paylater" | "authorize.net";
  status?: "confirmed";
  location_id: number;
  purchase_date: string;
  scheduled_date?: string;
  scheduled_time?: string;
  notes?: string;
  send_email: boolean;
  additional_addons?: PurchaseAddonInput[];
  /** Fee-support / special-pricing lines, as the web purchase page sends them. */
  applied_fees?: PayloadAppliedFee[];
  discount_amount?: number;
  applied_discounts?: PayloadAppliedDiscount[];
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

/* ------------------------------------------------------- purchase edit --- */

/** Payment methods the web Edit Purchase form offers (backend `Rule::in`). */
export type AttractionPaymentMethod =
  | "card"
  | "in-store"
  | "paylater"
  | "authorize.net";

/** Statuses the backend accepts on a purchase (`AttractionPurchase::STATUSES`). */
export type EditablePurchaseStatus =
  | "pending"
  | "confirmed"
  | "checked-in"
  | "cancelled"
  | "refunded";

/** One add-on already on the purchase, with its frozen `price_at_purchase`. */
export type PurchaseAddOnPivot = {
  id: number;
  name: string;
  /** The add-on's own current price (may differ from the frozen one). */
  price: number;
  quantity: number;
  priceAtPurchase: number;
};

/**
 * The purchase as the Edit Purchase form needs it — every field the web
 * EditPurchase seeds its state from, flattened out of
 * GET /api/attraction-purchases/{id}.
 */
export type AttractionPurchaseEditRecord = {
  id: number;
  /** Set when this ticket is a line of a bulk order, which locks its edits. */
  ticketOrderId: number | null;
  linePosition: number | null;
  attractionId: number | null;
  customerId: number | null;
  /** "First Last" of the linked customer account, when there is one. */
  customerName: string | null;
  locationId: number | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  quantity: number;
  status: EditablePurchaseStatus;
  paymentMethod: AttractionPaymentMethod;
  amountPaid: number;
  discountAmount: number;
  notes: string;
  /** YYYY-MM-DD, or "" when unscheduled. */
  scheduledDate: string;
  /** HH:MM, or "" when unscheduled. */
  scheduledTime: string;
  addOns: PurchaseAddOnPivot[];
  appliedFees: PayloadAppliedFee[];
  appliedDiscounts: PayloadAppliedDiscount[];
  /** The purchase's attraction, used to backfill the picker + location label. */
  attraction: {
    id: number;
    name: string;
    price: number;
    pricingType: string;
    category: string;
    locationId: number | null;
    locationName: string | null;
  } | null;
};

type RawEditPurchase = Omit<RawPurchaseDetail, "attraction"> & {
  ticket_order_id?: number | null;
  line_position?: number | null;
  attraction_id?: number | null;
  customer_id?: number | null;
  discount_amount?: number | string | null;
  attraction?: {
    id?: number;
    name?: string | null;
    price?: number | string | null;
    pricing_type?: string | null;
    category?: string | null;
    location_id?: number | null;
    location?: { id?: number; name?: string | null } | null;
  } | null;
  applied_discounts?:
    | {
        discount_name?: string | null;
        discount_amount?: number | string | null;
        discount_type?: "fixed" | "percentage" | null;
        original_price?: number | string | null;
        special_pricing_id?: number | null;
      }[]
    | null;
};

function mapEditRecord(raw: RawEditPurchase): AttractionPurchaseEditRecord {
  const status = (raw.status === "completed" ? "confirmed" : raw.status) ?? "pending";
  const customer = raw.customer;
  return {
    id: raw.id,
    ticketOrderId: raw.ticket_order_id ?? null,
    linePosition: raw.line_position ?? null,
    attractionId: raw.attraction_id ?? raw.attraction?.id ?? null,
    customerId: raw.customer_id ?? null,
    customerName: customer
      ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || null
      : null,
    locationId: raw.location_id ?? raw.attraction?.location_id ?? null,
    guestName: raw.guest_name ?? "",
    guestEmail: raw.guest_email ?? "",
    guestPhone: raw.guest_phone ?? "",
    quantity: Number(raw.quantity ?? 1) || 1,
    status: status as EditablePurchaseStatus,
    paymentMethod: (raw.payment_method || "in-store") as AttractionPaymentMethod,
    amountPaid: Number(raw.amount_paid ?? 0),
    discountAmount: Number(raw.discount_amount ?? 0),
    notes: raw.notes ?? "",
    scheduledDate: raw.scheduled_date ? raw.scheduled_date.split("T")[0] : "",
    scheduledTime: raw.scheduled_time ?? "",
    addOns: (raw.add_ons ?? []).map((a, i) => ({
      id: a.id ?? i,
      name: a.name?.trim() || a.add_on?.name?.trim() || "Add-on",
      price: Number(a.price ?? a.pivot?.price_at_purchase ?? 0),
      quantity: Number(a.pivot?.quantity ?? 0),
      priceAtPurchase: Number(a.pivot?.price_at_purchase ?? a.price ?? 0),
    })),
    appliedFees: (raw.applied_fees ?? []).map((f) => ({
      fee_name: f.fee_name?.trim() || "",
      fee_amount: Number(f.fee_amount ?? 0),
      fee_application_type: f.fee_application_type ?? "additive",
    })),
    appliedDiscounts: (raw.applied_discounts ?? []).map((d) => ({
      discount_name: d.discount_name?.trim() || "",
      discount_amount: Number(d.discount_amount ?? 0),
      discount_type: d.discount_type ?? "fixed",
      original_price: Number(d.original_price ?? 0),
      special_pricing_id: d.special_pricing_id ?? null,
    })),
    attraction: raw.attraction?.id
      ? {
          id: raw.attraction.id,
          name: raw.attraction.name?.trim() || "Untitled Attraction",
          price: Number(raw.attraction.price ?? 0),
          pricingType: raw.attraction.pricing_type ?? "flat",
          category: raw.attraction.category?.trim() || "",
          locationId: raw.attraction.location_id ?? null,
          locationName: raw.attraction.location?.name?.trim() || null,
        }
      : null,
  };
}

/**
 * GET /api/attraction-purchases/{id} — the same endpoint the web EditPurchase
 * loads, mapped to everything its form seeds from. Returns `null` when the
 * purchase can't be resolved (the web's "Purchase Not Found" state).
 */
export async function fetchAttractionPurchaseForEdit(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<AttractionPurchaseEditRecord | null> {
  const res = await apiRequest<{ success: boolean; data: RawEditPurchase | null }>(
    `/api/attraction-purchases/${id}`,
    { token, signal },
  );
  return res?.data ? mapEditRecord(res.data) : null;
}

/**
 * Body for PUT /api/attraction-purchases/{id} — field-for-field the web
 * `UpdatePurchaseData` the EditPurchase form submits.
 */
export type UpdateAttractionPurchaseInput = {
  attraction_id?: number;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  quantity: number;
  scheduled_date: string;
  scheduled_time: string;
  status: EditablePurchaseStatus;
  payment_method: AttractionPaymentMethod;
  amount_paid: number;
  notes?: string;
  applied_fees: PayloadAppliedFee[] | null;
  applied_discounts: PayloadAppliedDiscount[] | null;
  discount_amount: number;
  total_amount: number;
  /** Only sent when the add-on lines actually changed, like the web. */
  additional_addons?: PurchaseAddonInput[];
};

/**
 * The only fields a bulk-order line may change — pricing, customer and status
 * belong to the order (web `EditPurchase` isOrderLine).
 */
export type UpdateOrderLineInput = {
  scheduled_date: string;
  scheduled_time: string;
  notes?: string;
};

/** PUT /api/attraction-purchases/{id} — save an edited purchase. */
export async function updateAttractionPurchase(
  token: string,
  id: number,
  input: UpdateAttractionPurchaseInput | UpdateOrderLineInput,
): Promise<boolean> {
  const res = await apiRequest<{ success: boolean; message?: string }>(
    `/api/attraction-purchases/${id}`,
    { method: "PUT", token, body: input },
  );
  return !!res?.success;
}

/**
 * POST /api/attraction-purchases/{id}/qrcode — re-send the receipt email with
 * the ticket QR attached. Same endpoint + payload as the web `sendReceipt`.
 */
export async function sendAttractionPurchaseReceipt(
  token: string,
  id: number,
  qrCode: string,
  sendEmail = true,
): Promise<void> {
  await apiRequest(`/api/attraction-purchases/${id}/qrcode`, {
    method: "POST",
    token,
    body: { qr_code: qrCode, send_email: sendEmail },
  });
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

/**
 * DELETE /api/attraction-purchases/{id}/force-delete — permanent removal.
 *
 * Used only to roll back a purchase whose card payment failed, matching the
 * web's `forceDeletePurchase` cleanup: a soft delete would leave the row in the
 * "View Deleted" list looking like a real (recoverable) sale that never was.
 */
export async function forceDeleteAttractionPurchase(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/attraction-purchases/${id}/force-delete`, {
    method: "DELETE",
    token,
  });
}

/**
 * PUT /api/attraction-purchases/{id} — update a purchase's status. Mirrors the
 * web `updatePurchase(id, { status })` the Manage Purchases bulk bar loops over
 * (there is no bulk-status endpoint; the caller fans out per id, like the web).
 */
export async function updateAttractionPurchaseStatus(
  token: string,
  id: number,
  status: PurchaseStatus,
): Promise<void> {
  await apiRequest(`/api/attraction-purchases/${id}`, {
    method: "PUT",
    token,
    body: { status },
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
