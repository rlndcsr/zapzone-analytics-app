import { ApiError, apiRequest } from "../lib/api";
import { combineFreshPricing } from "../lib/pricing/combineFreshPricing";
import {
  normalizeSpecialBreakdown,
  type PurchaseSpecialQuote,
  type SpecialDeal,
} from "../lib/pricing/specialPricing";

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
  /** What it takes off one ticket; `discount_amount` is that × `quantity`. */
  unit_discount_amount: number;
  quantity: number;
};

export type SpecialPricingBreakdown = {
  /** Unit price × quantity — the tickets only, never the add-ons. */
  original_price: number;
  discounted_price: number;
  total_discount: number;
  discounts_applied: DiscountApplied[];
  has_special_pricing: boolean;
  quantity: number;
  unit_price: number;
};

/** Discount entry as sent on a purchase payload (matches the web `AppliedDiscount`). */
export type AppliedDiscount = {
  discount_name: string;
  discount_amount: number;
  discount_type: DiscountType;
  original_price: number;
  special_pricing_id: number | null;
  /** "special_pricing" on a special — how the server tells it from a promo. */
  source?: string;
  /** "$13.00" / "10%". */
  discount_label?: string;
  unit_discount_amount?: number;
  quantity?: number;
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
  quantity?: unknown;
  unit_price?: unknown;
};

type Envelope<T> = { success?: boolean; data?: T | null; message?: string };

const num = (v: unknown): number => Number(v ?? 0) || 0;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

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

function mapSpecialBreakdown(
  input: RawSpecialBreakdown,
  quantity: number,
): SpecialPricingBreakdown {
  // A server that predates per-ticket specials answers for one unit; this
  // brings its answer to the same per-ticket figures the current one returns.
  const raw = normalizeSpecialBreakdown(input, quantity) as RawSpecialBreakdown;
  const qty = Math.max(1, num(raw.quantity));
  return {
    original_price: num(raw.original_price),
    discounted_price: num(raw.discounted_price),
    total_discount: num(raw.total_discount),
    has_special_pricing: !!raw.has_special_pricing,
    quantity: qty,
    unit_price: num(raw.unit_price),
    discounts_applied: (raw.discounts_applied ?? []).map((d) => ({
      special_pricing_id: num(d.special_pricing_id),
      name: String(d.name ?? ""),
      description: (d.description as string | null) ?? null,
      discount_label: String(d.discount_label ?? ""),
      discount_type: d.discount_type === "percentage" ? "percentage" : "fixed",
      discount_amount: num(d.discount_amount),
      is_stackable: !!d.is_stackable,
      recurrence_display: String(d.recurrence_display ?? ""),
      unit_discount_amount: num(d.unit_discount_amount ?? d.discount_amount),
      quantity: Math.max(1, num(d.quantity ?? qty)),
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
 * entity/location. Returns `null` when no fee data comes back, or when it has
 * no usable total — a missing total would otherwise read as $0 (web
 * resolveFeeBreakdown), so callers keep the fee they showed instead.
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
  if (!res?.success || !res.data || !isFiniteNumber(res.data.total)) return null;
  return mapFeeBreakdown(res.data);
}

type SpecialPricingParams = {
  token: string;
  entityType: PricingEntityType;
  entityId: number;
  /**
   * ONE unit's price — a ticket, a participant, or a flat package — never a
   * subtotal. The server multiplies by `quantity`, so a fixed special comes
   * off every ticket and a percentage never touches the add-ons (backend
   * 44e1a85).
   */
  basePrice: number;
  /** Tickets (or per-person participants); 1 for a flat package. */
  quantity?: number;
  /** The VISIT date, Y-m-d — never the day of the sale. */
  date?: string;
  time?: string;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/special-pricings/for-entity — active special-pricing discounts for an
 * entity on a given visit date/time. Returns `null` when none apply; throws
 * when the check itself fails, so a caller can tell "no special" from
 * "couldn't check" and hold the payment instead of charging full price.
 */
export async function fetchSpecialPricing({
  token,
  entityType,
  entityId,
  basePrice,
  quantity = 1,
  date,
  time,
  locationId,
  signal,
}: SpecialPricingParams): Promise<SpecialPricingBreakdown | null> {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
    base_price: String(basePrice),
    quantity: String(qty),
  });
  if (date) params.append("date", date);
  if (time) params.append("time", time);
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<Envelope<RawSpecialBreakdown>>(
    `/api/special-pricings/for-entity?${params.toString()}`,
    { token, signal },
  );
  if (!res?.data) return null;
  const breakdown = mapSpecialBreakdown(res.data, qty);
  return breakdown.has_special_pricing ? breakdown : null;
}

/* ---- Deals (which days get a special) -------------------------------------- */

export type SpecialDealsResult = {
  deals: SpecialDeal[];
  /** "YYYY-MM-DD" → the labels of the specials that day. */
  dates: Record<string, { discount_label: string }[]>;
};

type RawDeal = Partial<Record<keyof SpecialDeal, unknown>>;

function mapDeal(d: RawDeal): SpecialDeal {
  const text = (v: unknown) => (v == null || v === "" ? null : String(v));
  return {
    special_pricing_id: num(d.special_pricing_id),
    name: String(d.name ?? "Special"),
    description: text(d.description),
    discount_type: d.discount_type === "percentage" ? "percentage" : "fixed",
    discount_amount: num(d.discount_amount),
    discount_label: String(d.discount_label ?? ""),
    recurrence_type: String(d.recurrence_type ?? ""),
    recurrence_value: d.recurrence_value == null ? null : num(d.recurrence_value),
    recurrence_display: String(d.recurrence_display ?? ""),
    specific_date: text(d.specific_date),
    start_date: text(d.start_date),
    end_date: text(d.end_date),
    time_start: text(d.time_start),
    time_end: text(d.time_end),
    next_dates: Array.isArray(d.next_dates) ? d.next_dates.map(String) : [],
  };
}

/**
 * GET /api/special-pricings/deals — the specials for one item and the days
 * (venue calendar, ~6 months) they fall on, for the "deal day" marks and the
 * note under the date picker. A server without the route answers 404; that is
 * read as "no deals to show", never as an error — the marks are a hint, the
 * price itself comes from {@link fetchSpecialPricing}.
 */
export async function fetchSpecialDeals({
  token,
  entityType,
  entityId,
  locationId,
  days = 180,
  signal,
}: {
  token: string;
  entityType: PricingEntityType;
  entityId: number;
  locationId?: number | null;
  days?: number;
  signal?: AbortSignal;
}): Promise<SpecialDealsResult> {
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(entityId),
    days: String(days),
  });
  if (locationId != null) params.append("location_id", String(locationId));
  try {
    const res = await apiRequest<
      Envelope<{ deals?: RawDeal[] | null; dates?: Record<string, unknown> | null }>
    >(`/api/special-pricings/deals?${params.toString()}`, { token, signal });
    const rawDates = res?.data?.dates ?? {};
    const dates: SpecialDealsResult["dates"] = {};
    for (const [day, list] of Object.entries(rawDates)) {
      if (!Array.isArray(list)) continue;
      dates[day] = list.map((x) => ({
        discount_label: String((x as { discount_label?: unknown })?.discount_label ?? ""),
      }));
    }
    return {
      deals: (res?.data?.deals ?? []).map(mapDeal),
      dates,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { deals: [], dates: {} };
    throw e;
  }
}

/* ---- Edit screens: the special after a reschedule -------------------------- */

type RawQuote = {
  changed?: unknown;
  special_discounts?: Record<string, unknown>[] | null;
  special_pricing_discount?: unknown;
  given_special?: unknown;
  proposed_special?: unknown;
  delta?: unknown;
};

function mapQuoteEntry(d: Record<string, unknown>): AppliedDiscount {
  return {
    discount_name: String(d.discount_name ?? d.name ?? "Special pricing"),
    discount_amount: num(d.discount_amount),
    discount_type: d.discount_type === "percentage" ? "percentage" : "fixed",
    original_price: num(d.original_price),
    special_pricing_id: d.special_pricing_id == null ? null : num(d.special_pricing_id),
    source: "special_pricing",
    ...(d.discount_label != null && { discount_label: String(d.discount_label) }),
    ...(d.unit_discount_amount != null && { unit_discount_amount: num(d.unit_discount_amount) }),
    ...(d.quantity != null && { quantity: num(d.quantity) }),
  };
}

/**
 * POST /api/attraction-purchases/{id}/special-quote or
 * /api/event-purchases/{id}/special-quote — what the special becomes if this
 * purchase moves to another visit (staff only). The server decides; the edit
 * screen only shows and applies its answer.
 *
 * Resolves `null` when the server has no such route (404, a server older
 * than backend 44e1a85): the screen then behaves as it always did rather than
 * refusing every reschedule.
 */
export async function quotePurchaseSpecial(
  token: string,
  entityType: "attraction" | "event",
  purchaseId: number,
  payload: Record<string, string | number | null>,
  signal?: AbortSignal,
): Promise<PurchaseSpecialQuote<AppliedDiscount> | null> {
  const path =
    entityType === "attraction"
      ? `/api/attraction-purchases/${purchaseId}/special-quote`
      : `/api/event-purchases/${purchaseId}/special-quote`;
  let res: Envelope<RawQuote> | null;
  try {
    res = await apiRequest<Envelope<RawQuote>>(path, {
      method: "POST",
      token,
      body: payload,
      signal,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  const q = res?.data;
  if (!q) throw new Error("The server returned no special price for this change.");
  return {
    changed: !!q.changed,
    specialDiscounts: (q.special_discounts ?? []).map(mapQuoteEntry),
    specialPricingDiscount: num(q.special_pricing_discount),
    givenSpecial: num(q.given_special),
    proposedSpecial: num(q.proposed_special),
    delta: num(q.delta),
  };
}

// ---- Fresh submit-time pricing ----------------------------------------------

type FreshPricingParams = {
  token: string;
  entityType: PricingEntityType;
  entityId: number;
  /** The base price computed from CURRENT inputs (quantity, add-ons, manual
   *  discount, participants, etc.) — never a value read back from debounced
   *  fee/special-pricing state. Used for the fee lookup, and for the
   *  special-pricing lookup too unless `specialPricingBasePrice` is given. */
  basePrice: number;
  /** The ONE-unit price the special is priced from (a ticket, a participant,
   *  a flat package) — the same figure the screen's debounced special lookup
   *  sends, so this stays a faithful fresh re-fetch. Falls back to
   *  `basePrice` only for a caller that has no unit price. */
  specialPricingBasePrice?: number;
  /** Units the special covers (tickets / participants); defaults to 1. */
  specialQuantity?: number;
  locationId?: number;
  /** The visit date/time — never the day of the sale. */
  date?: string;
  time?: string;
};

export type FreshPricing = {
  feeBreakdown: FeeBreakdown | null;
  specialPricing: SpecialPricingBreakdown | null;
  specialPricingDiscount: number;
  /** Fees applied, special pricing subtracted — combined exactly like
   *  `useOnsitePricing`'s `total`, just resolved on demand instead of from a
   *  debounced effect. */
  total: number;
};

/**
 * Resolves fee + special-pricing fresh, right now, for the given base price —
 * the submit-time counterpart to the debounced `useOnsitePricing` hook (and to
 * each booking screen's own debounced fee/special-pricing effects). Screens
 * call this immediately before charging/creating a purchase or booking so the
 * amount reflects the latest inputs, not whatever the last debounce fired with.
 *
 * Returns `null` if either lookup fails — callers fall back to their existing
 * (debounced) total. That fallback is safe only because every caller also
 * refuses to submit while its debounced special check is pending or has
 * failed, so the fallback figure is always a verified one, never full price
 * standing in for an unchecked special.
 */
export async function resolveFreshPricing({
  token,
  entityType,
  entityId,
  basePrice,
  specialPricingBasePrice,
  specialQuantity,
  locationId,
  date,
  time,
}: FreshPricingParams): Promise<FreshPricing | null> {
  try {
    const [feeBreakdown, specialPricing] = await Promise.all([
      fetchFeeBreakdown({ token, entityType, entityId, basePrice, locationId }),
      fetchSpecialPricing({
        token,
        entityType,
        entityId,
        basePrice: specialPricingBasePrice ?? basePrice,
        quantity: specialQuantity,
        date,
        time,
        locationId,
      }),
    ]);
    const { specialPricingDiscount, total } = combineFreshPricing(
      feeBreakdown,
      specialPricing,
      basePrice,
    );
    return { feeBreakdown, specialPricing, specialPricingDiscount, total };
  } catch {
    return null;
  }
}

// ---- Saved discounts (edit screens) -----------------------------------------

export type RawSavedDiscount = {
  discount_name?: string | null;
  discount_amount?: number | string | null;
  discount_type?: "fixed" | "percentage" | null;
  original_price?: number | string | null;
  special_pricing_id?: number | null;
  source?: string | null;
  discount_label?: string | null;
  unit_discount_amount?: number | string | null;
  quantity?: number | string | null;
};

/**
 * One discount as a purchase was saved with it, keeping the per-ticket fields
 * a special carries (backend 44e1a85) so an edit's re-save never strips them.
 */
export function mapSavedDiscount(d: RawSavedDiscount): AppliedDiscount {
  return {
    discount_name: d.discount_name?.trim() || "",
    discount_amount: Number(d.discount_amount ?? 0),
    discount_type: d.discount_type ?? "fixed",
    original_price: Number(d.original_price ?? 0),
    special_pricing_id: d.special_pricing_id ?? null,
    ...(d.source ? { source: d.source } : {}),
    ...(d.discount_label ? { discount_label: d.discount_label } : {}),
    ...(d.unit_discount_amount != null
      ? { unit_discount_amount: Number(d.unit_discount_amount) }
      : {}),
    ...(d.quantity != null ? { quantity: Number(d.quantity) } : {}),
  };
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
  // The per-ticket fields let a later edit or reschedule rescale the special
  // exactly (web buildAppliedDiscounts / backend toAppliedDiscounts).
  return b.discounts_applied.map((d) => ({
    discount_name: d.name,
    discount_amount: d.discount_amount,
    discount_type: d.discount_type,
    original_price: b.original_price,
    special_pricing_id: d.special_pricing_id,
    source: "special_pricing",
    discount_label: d.discount_label,
    unit_discount_amount: d.unit_discount_amount,
    quantity: d.quantity,
  }));
}
