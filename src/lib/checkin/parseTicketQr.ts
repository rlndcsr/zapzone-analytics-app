/**
 * Extracts an attraction-purchase id from a scanned QR payload.
 *
 * Mirrors the web scanner (AttractionCheckIn.tsx): the QR may encode either
 *   1. a JSON object with `purchaseId` / `purchase_id` / `id`, or
 *   2. a plain string containing digits — the first run of digits is the id.
 *
 * Returns `null` when neither form yields a positive numeric id, so the caller
 * can surface an "invalid QR" state instead of hitting the API.
 */
export function parseTicketPurchaseId(decoded: string): number | null {
  const text = decoded?.trim();
  if (!text) return null;

  // (1) JSON payload with an id-like field.
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const raw = parsed?.purchaseId ?? parsed?.purchase_id ?? parsed?.id;
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) return id;
  } catch {
    // Not JSON — fall through to the digit-run form.
  }

  // (2) Plain string — take the first run of digits.
  const match = text.match(/\d+/);
  if (match) {
    const id = parseInt(match[0], 10);
    if (Number.isInteger(id) && id > 0) return id;
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
