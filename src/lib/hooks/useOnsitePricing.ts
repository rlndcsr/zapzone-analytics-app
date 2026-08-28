import { useEffect, useMemo, useRef, useState } from "react";

import { clampAmount } from "../orderAmounts";
import { getToken } from "../session";
import {
  buildAppliedDiscounts,
  buildAppliedFees,
  fetchFeeBreakdown,
  fetchSpecialPricing,
  type AppliedDiscount,
  type AppliedFee,
  type FeeBreakdown,
  type PricingEntityType,
  type SpecialPricingBreakdown,
} from "../../services/pricingService";

/** Debounce for the fee / special-pricing lookups (matches the web's 500ms). */
const PRICING_DEBOUNCE_MS = 500;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

export type OnsitePricing = {
  /** unit price × quantity. */
  subtotal: number;
  /** Σ add-on price × qty. */
  addOnsTotal: number;
  /** max(0, subtotal + add-ons − manual discount) — the fee/pricing base price. */
  baseTotal: number;
  /** subtotal + add-ons — the most a manual discount may take off. */
  discountCeiling: number;
  /** The caller's discount clamped into [0, discountCeiling]. */
  discountNum: number;
  feeBreakdown: FeeBreakdown | null;
  specialPricing: SpecialPricingBreakdown | null;
  /** Special-pricing discount amount (0 when none apply). */
  specialPricingDiscount: number;
  /** Grand total: fees applied, special pricing subtracted. */
  total: number;
  appliedFees: AppliedFee[];
  appliedDiscounts: AppliedDiscount[];
};

/** The priced thing — an event or attraction row/detail satisfies this. */
export type PricingEntity = {
  id: number;
  price: number;
  locationId: number | null;
  addOns: { id: number; price: number }[];
};

type Args = {
  entity: PricingEntity | null;
  entityType: PricingEntityType;
  quantity: number;
  addonQty: Record<number, number>;
  /**
   * Manual discount in dollars, as typed. The hook clamps it into
   * [0, subtotal + add-ons] and returns the effective value.
   */
  discountNum: number;
  purchaseDate: string;
  purchaseTime: string;
};

/**
 * Computes purchase pricing exactly like the web (`OnsitePurchaseEvent.tsx`,
 * `PurchaseAttraction.tsx`): base = subtotal + add-ons − manual discount, then
 * server-side fees applied and special-pricing discounts subtracted, both
 * fetched (debounced) from the shared `/for-entity` endpoints. Keeps this
 * business logic out of the screen.
 */
export function useOnsitePricing({
  entity,
  entityType,
  quantity,
  addonQty,
  discountNum: rawDiscount,
  purchaseDate,
  purchaseTime,
}: Args): OnsitePricing {
  const subtotal = entity ? entity.price * quantity : 0;
  const addOnsTotal = useMemo(() => {
    if (!entity) return 0;
    return entity.addOns.reduce(
      (sum, a) => sum + a.price * (addonQty[a.id] ?? 0),
      0,
    );
  }, [entity, addonQty]);
  // A manual discount can never exceed what is owed before it, nor go negative.
  // Clamping here keeps every screen that prices through this hook consistent,
  // and keeps a half-typed amount out of the fee/special-pricing requests.
  const discountCeiling = Math.max(0, subtotal + addOnsTotal);
  const discountNum = clampAmount(rawDiscount, discountCeiling);
  const baseTotal = Math.max(0, discountCeiling - discountNum);

  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [specialPricing, setSpecialPricing] =
    useState<SpecialPricingBreakdown | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset when the selected entity changes (or clears), like the web.
  useEffect(() => {
    setFeeBreakdown(null);
    setSpecialPricing(null);
  }, [entity]);

  // Fees — recompute on any base-price change.
  useEffect(() => {
    if (!entity) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const fb = await fetchFeeBreakdown({
          token,
          entityType,
          entityId: entity.id,
          basePrice: baseTotal,
          locationId: entity.locationId ?? undefined,
          signal: controller.signal,
        });
        if (mountedRef.current) setFeeBreakdown(fb);
      } catch {
        if (!controller.signal.aborted && mountedRef.current) {
          setFeeBreakdown(null);
        }
      }
    }, PRICING_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [entity, entityType, baseTotal]);

  // Special pricing — also depends on the chosen date/time.
  useEffect(() => {
    if (!entity) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = await fetchSpecialPricing({
          token,
          entityType,
          entityId: entity.id,
          basePrice: baseTotal,
          date: purchaseDate || todayISO(),
          time: purchaseTime || undefined,
          locationId: entity.locationId ?? undefined,
          signal: controller.signal,
        });
        if (mountedRef.current) setSpecialPricing(sp);
      } catch {
        if (!controller.signal.aborted && mountedRef.current) {
          setSpecialPricing(null);
        }
      }
    }, PRICING_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [entity, entityType, baseTotal, purchaseDate, purchaseTime]);

  const specialPricingDiscount = specialPricing?.has_special_pricing
    ? specialPricing.total_discount
    : 0;

  const total = feeBreakdown
    ? Math.max(0, feeBreakdown.total - specialPricingDiscount)
    : Math.max(0, baseTotal - specialPricingDiscount);

  const appliedFees = useMemo(
    () => buildAppliedFees(feeBreakdown),
    [feeBreakdown],
  );
  const appliedDiscounts = useMemo(
    () => buildAppliedDiscounts(specialPricing),
    [specialPricing],
  );

  return {
    subtotal,
    addOnsTotal,
    baseTotal,
    discountCeiling,
    discountNum,
    feeBreakdown,
    specialPricing,
    specialPricingDiscount,
    total,
    appliedFees,
    appliedDiscounts,
  };
}
