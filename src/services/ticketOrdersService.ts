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
  /**
   * Signature the public QR upload needs. Staff requests are authorized by the
   * bearer token instead, so this is usually absent — carried anyway to keep the
   * upload identical on both paths.
   */
  qrToken: string | null;
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
