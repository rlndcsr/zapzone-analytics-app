import { resolveScannedCode } from "./resolveScannedCode.ts";

/**
 * What a scanned QR turned out to be, for a caller that only admits tickets.
 *
 * Two shapes are admitted at that scanner, so it has to say which one it read
 * rather than hand back a bare number: an order and a ticket both carry `id`,
 * and confusing them checks in a stranger's ticket.
 */
export type ScannedTicketQr =
  | { kind: "order"; orderId: number }
  | { kind: "purchase"; purchaseId: number };

/**
 * Classifies a scanned QR payload as an attraction ticket or a bulk order.
 *
 * Delegates to `resolveScannedCode`, the single reader every scanner shares, so
 * a payload means the same thing wherever it is scanned.
 *
 * This deliberately has NO "first run of digits" fallback. That fallback used to
 * run `/\d+/` over any payload, which resolved a membership token or a photo
 * link to whichever attraction purchase happened to share those digits — a
 * stranger's ticket. A payload that does not declare what it is now returns
 * `null` so the caller can say the code wasn't recognised.
 */
export function parseScannedTicketQr(decoded: string): ScannedTicketQr | null {
  const resolution = resolveScannedCode(decoded);
  if (!resolution.ok) return null;

  const { kind, id } = resolution.code;
  if (id == null) return null;

  if (kind === "ticket_order") return { kind: "order", orderId: id };
  if (kind === "attraction_purchase") return { kind: "purchase", purchaseId: id };

  return null;
}

/** A booking reference and/or id decoded from a scanned QR payload. */
export type BookingQrRef = {
  referenceNumber: string | null;
  bookingId: number | null;
};

const NO_BOOKING: BookingQrRef = { referenceNumber: null, bookingId: null };

/**
 * Extracts a booking reference / id from a scanned QR payload.
 *
 * Only a payload that resolves to a *booking* yields one. The old behaviour —
 * treating any non-JSON string as a booking reference, and any JSON `id` as a
 * booking id — is gone: scanning an attraction ticket read its `id` as a
 * booking id, loaded a different guest's booking, and offered to check that
 * guest in. Anything that isn't a booking now returns nulls, and the caller
 * reports an unrecognised code instead of looking up the wrong record.
 */
export function parseBookingQr(decoded: string): BookingQrRef {
  const resolution = resolveScannedCode(decoded);
  if (!resolution.ok || resolution.code.kind !== "booking") return NO_BOOKING;

  const { reference, id } = resolution.code;
  return {
    referenceNumber: reference?.trim() || null,
    bookingId: id != null && Number.isInteger(id) && id > 0 ? id : null,
  };
}
