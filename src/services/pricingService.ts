import { apiRequest } from "../lib/api";

/**
 * Fee-support + special-pricing lookups, mirroring the web's generic
 * `/fee-supports/for-entity` and `/special-pricings/for-entity` endpoints. Kept
 * entity-agnostic (event | attraction | package) so both purchase flows reuse it.
 */

export type PricingEntityType = "package" | "attraction" | "event";
export type FeeApplicationType = "additive" | "inclusive";
export type DiscountType = "fixed" | "percentage";

// ---- Fees ------------------------------------------------------------------

export type FeeBreakdownItem = {
  fee_support_id: number;
  fee_name: string;
  fee_label: string;
  fee_calculation_type: "fixed" | "percentage";
  fee_application_type: FeeApplicationType;
  fee_amount: number;
  displayed_base_price: number;
  total: number;
};

export type FeeBreakdown = {
  original_base_price: number;
  displayed_base_price: number;
  fees: FeeBreakdownItem[];
  total: number;
};

/** Fee entry as sent on a purchase payload (matches the web `AppliedFee`). */
export type AppliedFee = {
  fee_name: string;
  fee_amount: number;
  fee_application_type: FeeApplicationType;
};

// ---- Special pricing (discounts) -------------------------------------------

export type DiscountApplied = {
  special_pricing_id: number;
  name: string;
  description: string | null;
  discount_label: string;
  discount_type: DiscountType;
  discount_amount: number;
  is_stackable: boolean;
  recurrence_display: string;
};

export type SpecialPricingBreakdown = {
  original_price: number;
  discounted_price: number;
  total_discount: number;
  discounts_applied: DiscountApplied[];
  has_special_pricing: boolean;
};

/** Discount entry as sent on a purchase payload (matches the web `AppliedDiscount`). */
export type AppliedDiscount = {
  discount_name: string;
  discount_amount: number;
  discount_type: DiscountType;
  original_price: number;
  special_pricing_id: number | null;
};

// ---- Raw (snake_case, numbers may arrive as strings) -----------------------

type RawFeeItem = Partial<Record<keyof FeeBreakdownItem, unknown>>;
type RawFeeBreakdown = {
  original_base_price?: unknown;
  displayed_base_price?: unknown;
  fees?: RawFeeItem[] | null;
  total?: unknown;
};
type RawDiscount = Partial<Record<keyof DiscountApplied, unknown>>;
type RawSpecialBreakdown = {
  original_price?: unknown;
  discounted_price?: unknown;
  total_discount?: unknown;
  discounts_applied?: RawDiscount[] | null;
  has_special_pricing?: unknown;
};

type Envelope<T> = { success?: boolean; data?: T | null; message?: string };

const num = (v: unknown): number => Number(v ?? 0) || 0;

function mapFeeBreakdown(raw: RawFeeBreakdown): FeeBreakdown {
  return {
    original_base_price: num(raw.original_base_price),
    displayed_base_price: num(raw.displayed_base_price),
    total: num(raw.total),
    fees: (raw.fees ?? []).map((f) => ({
      fee_support_id: num(f.fee_support_id),
      fee_name: String(f.fee_name ?? ""),
      fee_label: String(f.fee_label ?? f.fee_name ?? ""),
      fee_calculation_type:
        f.fee_calculation_type === "percentage" ? "percentage" : "fixed",
      fee_application_type:
        f.fee_application_type === "inclusive" ? "inclusive" : "additive",
      fee_amount: num(f.fee_amount),
      displayed_base_price: num(f.displayed_base_price),
      total: num(f.total),
    })),
  };
}

function mapSpecialBreakdown(raw: RawSpecialBreakdown): SpecialPricingBreakdown {
  return {
    original_price: num(raw.original_price),
    discounted_price: num(raw.discounted_price),
    total_discount: num(raw.total_discount),
    has_special_pricing: !!raw.has_special_pricing,
    discounts_applied: (raw.discounts_applied ?? []).map((d) => ({
      special_pricing_id: num(d.special_pricing_id),
      name: String(d.name ?? ""),
      description: (d.description as string | null) ?? null,
      discount_label: String(d.discount_label ?? ""),
      discount_type: d.discount_type === "percentage" ? "percentage" : "fixed",
      discount_amount: num(d.discount_amount),
      is_stackable: !!d.is_stackable,
      recurrence_display: String(d.recurrence_display ?? ""),
    })),
  };
}

// ---- Fetchers --------------------------------------------------------------

type FeeParams = {
  token: string;
  entityType: PricingEntityType;
  entityId: number;
  basePrice: number;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/fee-supports/for-entity — the fees applied to a base price for an
 * entity/location. Returns `null` when no fee data comes back.
 */
export async function fetchFeeBreakdown({
  token,
  entityType,
  entityId,
  basePrice,
  locationId,
  signal,
}: FeeParams): Promise<FeeBreakdown | null> {
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
    base_price: String(basePrice),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<Envelope<RawFeeBreakdown>>(
    `/api/fee-supports/for-entity?${params.toString()}`,
    { token, signal },
  );
  if (!res?.success || !res.data) return null;
  return mapFeeBreakdown(res.data);
}

type SpecialPricingParams = {
  token: string;
  entityType: PricingEntityType;
  entityId: number;
  basePrice: number;
  date?: string;
  time?: string;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/special-pricings/for-entity — active special-pricing discounts for an
 * entity on a given date/time. Returns `null` when none apply.
 */
export async function fetchSpecialPricing({
  token,
  entityType,
  entityId,
  basePrice,
  date,
  time,
  locationId,
  signal,
}: SpecialPricingParams): Promise<SpecialPricingBreakdown | null> {
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
    base_price: String(basePrice),
  });
  if (date) params.append("date", date);
  if (time) params.append("time", time);
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<Envelope<RawSpecialBreakdown>>(
    `/api/special-pricings/for-entity?${params.toString()}`,
    { token, signal },
  );
  if (!res?.data) return null;
  const breakdown = mapSpecialBreakdown(res.data);
  return breakdown.has_special_pricing ? breakdown : null;
}

// ---- Payload builders (mirror web utils/fees.ts + utils/discounts.ts) -------

export function buildAppliedFees(fb: FeeBreakdown | null): AppliedFee[] {
  if (!fb?.fees?.length) return [];
  return fb.fees.map((f) => ({
    fee_name: f.fee_name,
    fee_amount: f.fee_amount,
    fee_application_type: f.fee_application_type,
  }));
}

export function buildAppliedDiscounts(
  b: SpecialPricingBreakdown | null,
): AppliedDiscount[] {
  if (!b || !b.has_special_pricing || !b.discounts_applied.length) return [];
  return b.discounts_applied.map((d) => ({
    discount_name: d.name,
    discount_amount: d.discount_amount,
    discount_type: d.discount_type,
    original_price: b.original_price,
    special_pricing_id: d.special_pricing_id,
  }));
}
