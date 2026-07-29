import { apiRequest } from "../lib/api";

/*
 * Gift-card and promo-code validation for the booking wizard's "Discounts &
 * Promotions" fields. Both hit the same endpoints the web uses:
 *   POST /api/promos/validate-code      { code, location_id?, subtotal? }
 *   POST /api/gift-cards/validate-code  { code, location_id?, subtotal? }
 *
 * Neither endpoint consumes the code — they only tell you what it is worth
 * against the current subtotal. Redemption happens server-side when the booking
 * is created, so a validated code here is just a quoted discount.
 */

/** A validated code and what it takes off the current subtotal. */
export type DiscountCodeResult = {
  valid: boolean;
  /** Amount this code removes from the subtotal (0 when invalid). */
  discountAmount: number;
  /** Why it was rejected, when `valid` is false. */
  message: string | null;
  /** Gift cards only — the remaining balance on the card. */
  balance: number | null;
};

type RawResult = {
  success?: boolean;
  message?: string | null;
  data?: {
    is_valid?: boolean;
    discount_amount?: number | string | null;
    balance?: number | string | null;
  } | null;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function mapResult(res: RawResult): DiscountCodeResult {
  const valid = !!res?.data?.is_valid;
  return {
    valid,
    discountAmount: valid ? num(res?.data?.discount_amount) : 0,
    message: valid ? null : (res?.message?.trim() || "That code isn't valid."),
    balance: res?.data?.balance == null ? null : num(res.data.balance),
  };
}

type ValidateParams = {
  token: string;
  code: string;
  subtotal: number;
  locationId?: number | null;
};

/** POST /api/promos/validate-code — quote a promo against the subtotal. */
export async function validatePromoCode({
  token,
  code,
  subtotal,
  locationId,
}: ValidateParams): Promise<DiscountCodeResult> {
  const res = await apiRequest<RawResult>("/api/promos/validate-code", {
    method: "POST",
    token,
    body: {
      code: code.trim(),
      subtotal,
      ...(locationId != null ? { location_id: locationId } : {}),
    },
  });
  return mapResult(res);
}

/** POST /api/gift-cards/validate-code — quote a gift card against the subtotal. */
export async function validateGiftCardCode({
  token,
  code,
  subtotal,
  locationId,
}: ValidateParams): Promise<DiscountCodeResult> {
  const res = await apiRequest<RawResult>("/api/gift-cards/validate-code", {
    method: "POST",
    token,
    body: {
      code: code.trim(),
      subtotal,
      ...(locationId != null ? { location_id: locationId } : {}),
    },
  });
  return mapResult(res);
}
