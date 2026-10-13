export const TOTAL_CHANGED_MESSAGE =
  "The total changed, so press Apply again to use the promo code.";
export const APPLY_CODES_FIRST =
  "Press Apply next to the promo code or gift card, or clear it, before creating the booking.";

export const toCents = (amount: number): number =>
  Math.round(amount * 100) / 100;

// The booking must be sent with the total its promo was checked on (web OnsiteBooking).
export const promoTotalChanged = (
  promoApplied: boolean,
  promoAppliedOn: number | null,
  total: number,
): boolean => promoApplied && toCents(total) !== promoAppliedOn;

export const giftCardTakes = (
  balance: number,
  base: number,
  promoDiscount: number,
): number => Math.min(Math.max(0, balance), Math.max(0, base - promoDiscount));

export const afterCodes = (
  base: number,
  promoDiscount: number,
  giftDiscount: number,
): number => Math.max(0, base - promoDiscount - giftDiscount);

export function unappliedCodeError(
  typedPromo: string,
  promoApplied: boolean,
  typedGift: string,
  giftApplied: boolean,
): string | null {
  if (typedPromo.trim() && !promoApplied) return APPLY_CODES_FIRST;
  if (typedGift.trim() && !giftApplied) return APPLY_CODES_FIRST;
  return null;
}

export function depositFor(
  pkg: {
    partialPaymentPercentage?: number | null;
    partialPaymentFixed?: number | null;
  },
  payable: number,
): number {
  if (pkg.partialPaymentPercentage && pkg.partialPaymentPercentage > 0) {
    return Math.min(
      toCents(payable * (pkg.partialPaymentPercentage / 100)),
      payable,
    );
  }
  if (pkg.partialPaymentFixed && pkg.partialPaymentFixed > 0) {
    return Math.min(pkg.partialPaymentFixed, payable);
  }
  return 0;
}
