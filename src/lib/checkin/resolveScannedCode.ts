/**
 * What a scanned code at the unified Check-In / Waivers desk turned out to be.
 *
 * Direct port of the web's `utils/scanCode.ts`, so a QR that resolves to a
 * booking on the web resolves to a booking here — same patterns, same
 * precedence, same labels. Anything that disagrees would check a stranger in.
 */
export type ScannedKind =
  | "booking"
  | "attraction_purchase"
  | "ticket_order"
  | "event_purchase"
  | "membership"
  | "waiver"
  | "photo_delivery";

export type ScannedCode = {
  kind: ScannedKind;
  raw: string;
  id?: number;
  reference?: string;
  token?: string;
};

export type ScanResolution =
  | { ok: true; code: ScannedCode }
  | { ok: false; raw: string };

const BOOKING_REFERENCE = /^BK\d{8}[A-Z0-9]{6}$/;
const ORDER_REFERENCE = /^ORD\d{8}[A-Z0-9]{6}$/;
const EVENT_REFERENCE = /^EVT-[A-Z0-9]{8}$/;
const WAIVER_REFERENCE = /^WV\d{8}[A-Z0-9]{6}$/;
const MEMBERSHIP_TOKEN = /^mbr_[A-Za-z0-9]{40}$/;
const PHOTO_DELIVERY = /\/photos\/qr\/([A-Za-z0-9]{16,64})/;

/** `type` values a QR payload may declare, mapped to the kind they mean. */
const JSON_KINDS: Record<string, ScannedKind> = {
  attraction_purchase: "attraction_purchase",
  ticket_order: "ticket_order",
  event_purchase: "event_purchase",
  booking: "booking",
  waiver: "waiver",
  membership: "membership",
};

/** Human label per kind — used in the "can't be checked in here" message. */
export const KIND_LABELS: Record<ScannedKind, string> = {
  booking: "Booking",
  attraction_purchase: "Attraction ticket",
  ticket_order: "Bulk order",
  event_purchase: "Event ticket",
  membership: "Membership",
  waiver: "Waiver",
  photo_delivery: "Photo delivery",
};

/** Classifies a bare reference string by its prefix shape. */
function fromReference(value: string, raw: string): ScannedCode | null {
  const upper = value.trim().toUpperCase();

  if (BOOKING_REFERENCE.test(upper)) return { kind: "booking", reference: upper, raw };
  if (ORDER_REFERENCE.test(upper)) return { kind: "ticket_order", reference: upper, raw };
  if (EVENT_REFERENCE.test(upper)) return { kind: "event_purchase", reference: upper, raw };
  if (WAIVER_REFERENCE.test(upper)) return { kind: "waiver", reference: upper, raw };

  return null;
}

/**
 * Resolves a raw decoded QR string to the record it points at.
 *
 * Precedence matches the web exactly:
 *   1. a membership token (`mbr_…`),
 *   2. a photo-delivery URL,
 *   3. a JSON payload — its declared `type` first, then its `reference_number`,
 *   4. a bare reference string.
 *
 * Returns `{ ok: false }` rather than guessing, so the desk can say the code
 * wasn't recognised instead of looking up the wrong record.
 */
export function resolveScannedCode(decodedText: string): ScanResolution {
  const raw = (decodedText ?? "").trim();

  if (!raw) return { ok: false, raw };

  if (MEMBERSHIP_TOKEN.test(raw)) {
    return { ok: true, code: { kind: "membership", token: raw, raw } };
  }

  const photo = raw.match(PHOTO_DELIVERY);
  if (photo) {
    return { ok: true, code: { kind: "photo_delivery", token: photo[1], raw } };
  }

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const declared =
        typeof parsed.type === "string" ? JSON_KINDS[parsed.type] : undefined;

      if (declared) {
        const id = Number(parsed.id);
        const reference =
          typeof parsed.reference_number === "string"
            ? parsed.reference_number
            : undefined;

        if (Number.isInteger(id) && id > 0) {
          return { ok: true, code: { kind: declared, id, reference, raw } };
        }
        if (reference) {
          return { ok: true, code: { kind: declared, reference, raw } };
        }
      }

      if (typeof parsed.reference_number === "string") {
        const byReference = fromReference(parsed.reference_number, raw);
        if (byReference) return { ok: true, code: byReference };
      }
    } catch {
      return { ok: false, raw };
    }

    // JSON that declared nothing usable — never fall through to the bare
    // reference branch, which would read the whole object as a reference.
    return { ok: false, raw };
  }

  const byReference = fromReference(raw, raw);
  if (byReference) return { ok: true, code: byReference };

  return { ok: false, raw };
}
