import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clampAmount } from "../orderAmounts";
import { specialCheckState, specialVisit } from "../pricing/specialPricing";
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
  /**
   * The special for the current visit/quantity is still being looked up.
   * Payment must wait: the figure on screen may be for different inputs.
   */
  specialChecking: boolean;
  /**
   * The special lookup for the current inputs failed. Payment must be held
   * (web "Try again") rather than charge full price for a visit that may
   * have a special.
   */
  specialCheckFailed: boolean;
  /** Re-run the special lookup, for the Try again link. */
  retrySpecial: () => void;
  /** The visit date/time the special is priced for (null when none is priced yet). */
  specialDate: string | null;
  specialTime: string | undefined;
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
  /** The picked VISIT date (Y-m-d) — what decides the special, not the sale day. */
  purchaseDate: string;
  purchaseTime: string;
  /**
   * No special is looked up until a visit date is picked (web
   * OnsitePurchaseEvent / PurchaseAttraction). Without it, an unpicked date
   * prices the venue's today at its current time (web CreatePurchase).
   */
  requireDate?: boolean;
};

type SpecialState = {
  /** The inputs this answer is for — an answer for other inputs is stale. */
  key: string;
  entityId: number;
  breakdown: SpecialPricingBreakdown | null;
  failed: boolean;
};

/**
 * Computes purchase pricing exactly like the web (`OnsitePurchaseEvent.tsx`,
 * `PurchaseAttraction.tsx`, `CreatePurchase.tsx`): base = subtotal + add-ons −
 * manual discount, then server-side fees applied and the special subtracted.
 *
 * The special follows the VISIT (web ae48a92 / backend 44e1a85): it is priced
 * from one ticket's price × the ticket count for the picked visit date and
 * time, so a fixed special comes off every ticket and a percentage never
 * touches the add-ons. Keeps this business logic out of the screen.
 */
export function useOnsitePricing({
  entity,
  entityType,
  quantity,
  addonQty,
  discountNum: rawDiscount,
  purchaseDate,
  purchaseTime,
  requireDate = false,
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
  const [special, setSpecial] = useState<SpecialState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retrySpecial = useCallback(() => setAttempt((n) => n + 1), []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset when the selected entity changes (or clears), like the web. The
  // special is NOT cleared here: its answers are keyed by the inputs (entity
  // id included), so a stale one is already ignored, and clearing it without
  // a new key would leave the check pending with nothing to re-run it.
  useEffect(() => {
    setFeeBreakdown(null);
  }, [entity]);

  // What the special is priced for. No date + requireDate → nothing to price.
  const needsSpecial = !!entity && (!requireDate || !!purchaseDate);
  const visit = needsSpecial ? specialVisit(purchaseDate, purchaseTime) : null;
  // Without a picked date the visit is "now at the venue", whose minute moves;
  // it is keyed by the date alone so the clock ticking over never re-checks.
  const specialKey = visit
    ? [
        entity?.id,
        entity?.price,
        Math.max(1, quantity),
        visit.date,
        purchaseDate ? (visit.time ?? "") : "now",
        attempt,
      ].join("|")
    : "";

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

  // Special pricing — one ticket's price × tickets, for the visit. Add-ons and
  // the manual discount don't move it, so they don't re-check it either.
  useEffect(() => {
    if (!entity || !specialKey) return;
    const token = getToken();
    if (!token) {
      setSpecial({ key: specialKey, entityId: entity.id, breakdown: null, failed: true });
      return;
    }
    // Read the visit at fire time: for an undated sale that is "now".
    const at = specialVisit(purchaseDate, purchaseTime);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const sp = await fetchSpecialPricing({
          token,
          entityType,
          entityId: entity.id,
          basePrice: entity.price,
          quantity: Math.max(1, quantity),
          date: at.date,
          time: at.time,
          locationId: entity.locationId ?? undefined,
          signal: controller.signal,
        });
        if (mountedRef.current && !controller.signal.aborted) {
          setSpecial({ key: specialKey, entityId: entity.id, breakdown: sp, failed: false });
        }
      } catch {
        if (!controller.signal.aborted && mountedRef.current) {
          setSpecial({ key: specialKey, entityId: entity.id, breakdown: null, failed: true });
        }
      }
    }, PRICING_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // specialKey captures entity id/price, quantity, visit and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialKey, entityType]);

  const checkState = specialCheckState(needsSpecial, specialKey, special);
  const current = checkState === "ready" || checkState === "failed" ? special : null;
  // Until the answer for these inputs lands, keep showing the last one for the
  // same item (web); payment is held on `specialChecking` meanwhile, so that
  // figure is never what gets charged.
  const previous = special && special.entityId === entity?.id ? special.breakdown : null;
  const specialPricing = needsSpecial
    ? (current ? current.breakdown : previous)
    : null;
  const specialChecking = checkState === "checking";
  const specialCheckFailed = checkState === "failed";

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
    specialChecking,
    specialCheckFailed,
    retrySpecial,
    specialDate: visit?.date ?? null,
    specialTime: visit?.time,
  };
}
