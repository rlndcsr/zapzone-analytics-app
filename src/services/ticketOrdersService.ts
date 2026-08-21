import { apiRequest } from "../lib/api";

/*
 * Ticket-order (multi-item order) API client — mirrors the web admin's
 * `TicketOrderService` against `App\Http\Controllers\Api\TicketOrderController`.
 *
 * One order carries many lines (attraction tickets and event tickets, in any
 * mix), and the server prices the whole cart: per-line special pricing, fees and
 * discounts all come back from `POST /api/ticket-orders/quote`, so the app never
 * recomputes an order total locally the way the single-purchase screen does for
 * one attraction.
 *
 * The bearer token matters on checkout beyond authorization: the controller
 * treats a request with no Sanctum user as a public online order and rejects
 * anything other than a card payment. Staff-collected cash and pay-later orders
 * only go through with the token attached.
 */

/* ---------------------------------------------------------------- domain -- */

export type CartItemType = "attraction" | "event";

export type CartAddOn = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

/**
 * One line of the order being drafted on the device. `key` is local identity
 * only — the server has no notion of it — so a line can be edited or removed
 * before checkout without disturbing the others.
 */
export type CartItem = {
  key: string;
  type: CartItemType;
  id: number;
  name: string;
  image: string | null;
  locationId: number;
  unitPrice: number;
  quantity: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  addOns: CartAddOn[];
};

export type QuoteLine = {
  type: CartItemType;
  /** 1-based, in the order the items were sent — how a line is matched back. */
  position: number;
  entityId: number;
  entityName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  addOnsTotal: number;
  discountAmount: number;
  feeTotal: number;
  totalAmount: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
};

export type CartQuote = {
  locationId: number | null;
  lines: QuoteLine[];
  subtotal: number;
  discountAmount: number;
  feeTotal: number;
  totalAmount: number;
  itemCount: number;
  ticketCount: number;
};

export type TicketOrder = {
  id: number;
  referenceNumber: string;
  status: string;
  locationId: number;
  totalAmount: number;
  amountPaid: number;
  itemCount: number;
  ticketCount: number;
  qrToken: string | null;
};

export type TicketOrderLine = {
  id: number;
  type: CartItemType;
  position: number;
  name: string;
  entityId: number;
  quantity: number;
  totalAmount: number;
  amountPaid: number;
  status: string;
  checkedInAt: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
};

/** A placed order with its lines — what the check-in scanner opens. */
export type TicketOrderDetail = {
  id: number;
  referenceNumber: string;
  status: string;
  locationId: number;
  customerName: string;
  customerEmail: string | null;
  itemCount: number;
  ticketCount: number;
  totalAmount: number;
  amountPaid: number;
  /** What is still owed. Gates check-in, exactly as on the web. */
  remainingBalance: number;
  paymentMethod: string | null;
  notes: string | null;
  lines: TicketOrderLine[];
};

/** What a check-in attempt actually did, per line (web `checkIn`). */
export type TicketOrderCheckInResult = {
  checkedIn: number;
  /** Lines the server refused, each with its reason — unpaid, already in, … */
  skipped: { id: number; reason: string }[];
};

export type TicketOrderCheckoutInput = {
  customer_id?: number;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  payment_method?: "authorize.net" | "in-store" | "paylater";
  notes?: string;
};

/* ------------------------------------------------------------- mapping --- */

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

type RawQuoteLine = Record<string, unknown>;
type RawQuote = Record<string, unknown>;
type RawOrder = Record<string, unknown>;

const mapQuoteLine = (raw: RawQuoteLine): QuoteLine => ({
  type: raw.type === "event" ? "event" : "attraction",
  position: num(raw.position),
  entityId: num(raw.entity_id),
  entityName: typeof raw.entity_name === "string" ? raw.entity_name : "",
  quantity: num(raw.quantity),
  unitPrice: num(raw.unit_price),
  subtotal: num(raw.subtotal),
  addOnsTotal: num(raw.add_ons_total),
  discountAmount: num(raw.discount_amount),
  feeTotal: num(raw.fee_total),
  totalAmount: num(raw.total_amount),
  scheduledDate: str(raw.scheduled_date),
  scheduledTime: str(raw.scheduled_time),
});

const mapQuote = (raw: RawQuote): CartQuote => ({
  locationId: raw.location_id == null ? null : num(raw.location_id),
  lines: Array.isArray(raw.lines)
    ? (raw.lines as RawQuoteLine[]).map(mapQuoteLine)
    : [],
  subtotal: num(raw.subtotal),
  discountAmount: num(raw.discount_amount),
  feeTotal: num(raw.fee_total),
  totalAmount: num(raw.total_amount),
  itemCount: num(raw.item_count),
  ticketCount: num(raw.ticket_count),
});

const mapOrder = (raw: RawOrder, qrToken: string | null): TicketOrder => ({
  id: num(raw.id),
  referenceNumber:
    typeof raw.reference_number === "string" ? raw.reference_number : "",
  status: typeof raw.status === "string" ? raw.status : "pending",
  locationId: num(raw.location_id),
  totalAmount: num(raw.total_amount),
  amountPaid: num(raw.amount_paid),
  itemCount: num(raw.item_count),
  ticketCount: num(raw.ticket_count),
  qrToken,
});

const mapOrderLine = (raw: Record<string, unknown>): TicketOrderLine => ({
  id: num(raw.id),
  type: raw.type === "event" ? "event" : "attraction",
  position: num(raw.position),
  name: typeof raw.name === "string" ? raw.name : "",
  entityId: num(raw.entity_id),
  quantity: num(raw.quantity),
  totalAmount: num(raw.total_amount),
  amountPaid: num(raw.amount_paid),
  status: typeof raw.status === "string" ? raw.status : "pending",
  checkedInAt: str(raw.checked_in_at),
  scheduledDate: str(raw.scheduled_date),
  scheduledTime: str(raw.scheduled_time),
});

const mapOrderDetail = (raw: RawOrder): TicketOrderDetail => {
  const totalAmount = num(raw.total_amount);
  const amountPaid = num(raw.amount_paid);
  return {
    id: num(raw.id),
    referenceNumber:
      typeof raw.reference_number === "string" ? raw.reference_number : "",
    status: typeof raw.status === "string" ? raw.status : "pending",
    locationId: num(raw.location_id),
    customerName:
      typeof raw.customer_name === "string" && raw.customer_name.trim()
        ? raw.customer_name
        : "Walk-in Customer",
    customerEmail: str(raw.customer_email),
    itemCount: num(raw.item_count),
    ticketCount: num(raw.ticket_count),
    totalAmount,
    amountPaid,
    // Trust the server's figure; derive it only when the field is absent, so a
    // response without it still gates check-in instead of reading as paid.
    remainingBalance:
      raw.remaining_balance == null
        ? Math.max(0, totalAmount - amountPaid)
        : num(raw.remaining_balance),
    paymentMethod: str(raw.payment_method),
    notes: str(raw.notes),
    lines: Array.isArray(raw.lines)
      ? (raw.lines as Record<string, unknown>[]).map(mapOrderLine)
      : [],
  };
};

/** The cart as the controller's `items.*` rules expect it. */
const toApiItems = (items: CartItem[]) =>
  items.map((item) => ({
    type: item.type,
    id: item.id,
    quantity: item.quantity,
    scheduled_date: item.scheduledDate ?? null,
    scheduled_time: item.scheduledTime ?? null,
    add_ons: item.addOns.map((a) => ({ id: a.id, quantity: a.quantity })),
  }));

type Envelope = { success?: boolean; data?: unknown; qr_token?: unknown };

/* ------------------------------------------------------------ endpoints -- */

/**
 * POST /api/ticket-orders/quote — server-side pricing for the whole cart.
 * Nothing is written, so this is safe to call on every edit (the screen
 * debounces it).
 */
export async function quoteTicketOrder(
  token: string,
  items: CartItem[],
  signal?: AbortSignal,
): Promise<CartQuote> {
  const res = await apiRequest<Envelope>("/api/ticket-orders/quote", {
    method: "POST",
    token,
    signal,
    body: { items: toApiItems(items) },
  });
  const data = res?.data;
  if (!data || typeof data !== "object") {
    throw new Error("We could not price this order.");
  }
  return mapQuote(data as RawQuote);
}

/**
 * POST /api/ticket-orders — creates the order and its lines, unpaid. The charge
 * (or the cash record) is a separate step against the returned order, exactly as
 * the web does it, so a failed card can roll the whole order back.
 */
export async function checkoutTicketOrder(
  token: string,
  items: CartItem[],
  input: TicketOrderCheckoutInput,
): Promise<TicketOrder> {
  const res = await apiRequest<Envelope>("/api/ticket-orders", {
    method: "POST",
    token,
    body: { items: toApiItems(items), ...input },
  });
  const data = res?.data;
  if (!data || typeof data !== "object") {
    throw new Error("We could not place this order.");
  }
  return mapOrder(
    data as RawOrder,
    typeof res.qr_token === "string" ? res.qr_token : null,
  );
}

/**
 * GET /api/ticket-orders/{id} — one placed order with all of its lines. This is
 * what a scanned order QR resolves to (web `ticketOrderService.get`).
 */
export async function fetchTicketOrder(
  token: string,
  orderId: number,
  signal?: AbortSignal,
): Promise<TicketOrderDetail> {
  const res = await apiRequest<Envelope>(`/api/ticket-orders/${orderId}`, {
    token,
    signal,
  });
  const data = res?.data;
  if (!data || typeof data !== "object") {
    throw new Error("We could not load this order.");
  }
  return mapOrderDetail(data as RawOrder);
}

/**
 * POST /api/ticket-orders/{id}/check-in — admits the order.
 *
 * Omitting `lineIds` checks in every eligible line; passing them checks in just
 * those (web `checkIn(id, lineIds?)`). The server decides eligibility and
 * reports what it refused in `skipped`, so unpaid or already-admitted lines are
 * its call to make, not the app's.
 */
export async function checkInTicketOrder(
  token: string,
  orderId: number,
  lineIds?: number[],
): Promise<TicketOrderCheckInResult> {
  const res = await apiRequest<Envelope>(
    `/api/ticket-orders/${orderId}/check-in`,
    {
      method: "POST",
      token,
      body: lineIds && lineIds.length ? { line_ids: lineIds } : {},
    },
  );
  const data = (res?.data ?? {}) as Record<string, unknown>;
  return {
    checkedIn: num(data.checked_in),
    skipped: Array.isArray(data.skipped)
      ? (data.skipped as Record<string, unknown>[]).map((s) => ({
          id: num(s.id),
          reason: typeof s.reason === "string" ? s.reason : "Not eligible",
        }))
      : [],
  };
}

/**
 * POST /api/ticket-orders/{id}/qrcode — attaches the scannable ticket to the
 * order so the receipt email carries it. Best-effort: a missing QR must never
 * fail an order that has otherwise gone through.
 */
export async function storeTicketOrderQrCode(
  token: string,
  orderId: number,
  qrCode: string,
  qrToken: string | null,
): Promise<void> {
  try {
    await apiRequest(`/api/ticket-orders/${orderId}/qrcode`, {
      method: "POST",
      token,
      body: { qr_code: qrCode, qr_token: qrToken ?? undefined },
    });
  } catch {
    /* the order stands without its QR — staff can re-send the receipt */
  }
}

/**
 * DELETE /api/ticket-orders/{id}/rollback — removes an order whose card never
 * cleared. Best-effort by design: if this fails the order simply stays pending
 * for staff to clear, and the payment error is what the user must see.
 */
export async function rollbackTicketOrder(
  token: string,
  orderId: number,
): Promise<void> {
  try {
    await apiRequest(`/api/ticket-orders/${orderId}/rollback`, {
      method: "DELETE",
      token,
    });
  } catch {
    /* never mask the payment error with a cleanup error */
  }
}
