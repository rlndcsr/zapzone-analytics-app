import { useEffect, useMemo, useRef, useState } from "react";

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
import type { EventRow } from "../../services/eventsService";

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
  feeBreakdown: FeeBreakdown | null;
  specialPricing: SpecialPricingBreakdown | null;
  /** Special-pricing discount amount (0 when none apply). */
  specialPricingDiscount: number;
  /** Grand total: fees applied, special pricing subtracted. */
  total: number;
  appliedFees: AppliedFee[];
  appliedDiscounts: AppliedDiscount[];
};

type Args = {
  event: EventRow | null;
  quantity: number;
  addonQty: Record<number, number>;
  /** Manual discount in dollars (already clamped ≥ 0). */
  discountNum: number;
  purchaseDate: string;
  purchaseTime: string;
};

/**
 * Computes onsite-purchase pricing exactly like the web
 * (`OnsitePurchaseEvent.tsx`): base = subtotal + add-ons − manual discount, then
 * server-side fees applied and special-pricing discounts subtracted, both
 * fetched (debounced) from the shared `/for-entity` endpoints. Keeps this
 * business logic out of the screen.
 */
export function useOnsitePricing({
  event,
  quantity,
  addonQty,
  discountNum,
  purchaseDate,
  purchaseTime,
}: Args): OnsitePricing {
  const entityType: PricingEntityType = "event";

  const subtotal = event ? event.price * quantity : 0;
  const addOnsTotal = useMemo(() => {
    if (!event) return 0;
    return event.addOns.reduce(
      (sum, a) => sum + a.price * (addonQty[a.id] ?? 0),
      0,
    );
  }, [event, addonQty]);
  const baseTotal = Math.max(0, subtotal + addOnsTotal - discountNum);

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

  // Reset when the selected event changes (or clears), like the web.
  useEffect(() => {
    setFeeBreakdown(null);
    setSpecialPricing(null);
  }, [event]);

  // Fees — recompute on any base-price change.
  useEffect(() => {
    if (!event) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const fb = await fetchFeeBreakdown({
          token,
          entityType,
          entityId: event.id,
          basePrice: baseTotal,
          locationId: event.locationId ?? undefined,
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
  }, [event, baseTotal]);

  // Special pricing — also depends on the chosen date/time.
  useEffect(() => {
    if (!event) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = await fetchSpecialPricing({
          token,
          entityType,
          entityId: event.id,
          basePrice: baseTotal,
          date: purchaseDate || todayISO(),
          time: purchaseTime || undefined,
          locationId: event.locationId ?? undefined,
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
  }, [event, baseTotal, purchaseDate, purchaseTime]);

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
    feeBreakdown,
    specialPricing,
    specialPricingDiscount,
    total,
    appliedFees,
    appliedDiscounts,
  };
}
