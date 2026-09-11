type FeeBreakdownLike = { total: number } | null;
type SpecialPricingLike = {
  has_special_pricing: boolean;
  total_discount: number;
} | null;

export function combineFreshPricing(
  feeBreakdown: FeeBreakdownLike,
  specialPricing: SpecialPricingLike,
  basePrice: number,
): { specialPricingDiscount: number; total: number } {
  const specialPricingDiscount = specialPricing?.has_special_pricing
    ? specialPricing.total_discount
    : 0;
  const total = feeBreakdown
    ? Math.max(0, feeBreakdown.total - specialPricingDiscount)
    : Math.max(0, basePrice - specialPricingDiscount);
  return { specialPricingDiscount, total };
}
