/** The `type` a multi-item ticket order encodes (web `generateOrderQRData`). */
const TICKET_ORDER_TYPE = "ticket_order";

/**
 * What a scanned attraction-check-in QR turned out to be.
 *
 * Two shapes are admitted at that scanner, so it has to say which one it read
 * rather than hand back a bare number: an order and a ticket both carry `id`,
 * and confusing them checks in a stranger's ticket.
 */
export type ScannedTicketQr =
  | { kind: "order"; orderId: number }
  | { kind: "purchase"; purchaseId: number };

function positiveInt(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Classifies a scanned QR payload for the attraction check-in scanner.
 *
 * Mirrors the web scanner's `onScanSuccess` (AttractionCheckIn.tsx), in its
 * order of precedence:
 *   1. JSON with `type: "ticket_order"` and an `id` → a whole order,
 *   2. JSON with `purchaseId` / `purchase_id` / `id` → one attraction ticket,
 *   3. a plain string containing digits — the first run of digits is the id.
 *
 * The type test comes first for the reason the web does it first: an order
 * payload also has an `id`, so reading (2) before (1) would silently resolve an
 * order to the attraction purchase that happens to share that number.
 *
 * Returns `null` when nothing id-shaped is present, so the caller can surface
 * an "invalid QR" state instead of hitting the API.
 */
export function parseScannedTicketQr(decoded: string): ScannedTicketQr | null {
  const text = decoded?.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    if (parsed?.type === TICKET_ORDER_TYPE) {
      const orderId = positiveInt(parsed.orderId ?? parsed.order_id ?? parsed.id);
      // A `ticket_order` payload we cannot read an id out of is invalid — never
      // fall through to the ticket branches, which would claim its `id`.
      return orderId == null ? null : { kind: "order", orderId };
    }

    const purchaseId = positiveInt(
      parsed?.purchaseId ?? parsed?.purchase_id ?? parsed?.id,
    );
    if (purchaseId != null) return { kind: "purchase", purchaseId };
  } catch {
    // Not JSON — fall through to the digit-run form.
  }

  // Plain string — take the first run of digits (a bare ticket id).
  const match = text.match(/\d+/);
  if (match) {
    const purchaseId = positiveInt(parseInt(match[0], 10));
    if (purchaseId != null) return { kind: "purchase", purchaseId };
  }

  return null;
}

/** A booking reference and/or id decoded from a scanned QR payload. */
export type BookingQrRef = { referenceNumber: string | null; bookingId: number | null };

/**
 * Extracts a booking reference / id from a scanned QR payload.
 *
 * Mirrors the web booking scanner (CheckIn.tsx): the QR may encode either
 *   1. a JSON object with `bookingId` / `booking_id` / `id` and/or
 *      `reference_number` / `referenceNumber`, or
 *   2. a plain string, which is treated as the booking's reference number.
 *
 * The reference number is preferred by the caller when both are present, again
 * matching the web (it looks up by reference first, then by id).
 */
export function parseBookingQr(decoded: string): BookingQrRef {
  const text = decoded?.trim();
  if (!text) return { referenceNumber: null, bookingId: null };

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const idRaw = parsed?.bookingId ?? parsed?.booking_id ?? parsed?.id;
    const id = Number(idRaw);
    const ref = parsed?.reference_number ?? parsed?.referenceNumber;
    return {
      referenceNumber:
        typeof ref === "string" && ref.trim() ? ref.trim() : null,
      bookingId: Number.isInteger(id) && id > 0 ? id : null,
    };
  } catch {
    // Not JSON — the raw string is the reference number (matches the web).
    return { referenceNumber: text, bookingId: null };
  }
}
