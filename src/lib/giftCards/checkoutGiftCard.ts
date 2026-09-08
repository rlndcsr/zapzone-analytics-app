export type AppliedGiftCard = {
  code: string;
  discountAmount: number;
};

export type GiftCardValidation = {
  valid: boolean;
  discountAmount: number;
  message: string | null;
};

export function nextAppliedGiftCard(
  code: string,
  result: GiftCardValidation,
): AppliedGiftCard | null {
  if (!result.valid) return null;
  return {
    code: code.trim().toUpperCase(),
    discountAmount: Math.max(0, result.discountAmount),
  };
}

export function giftCardDiscountFor(
  applied: AppliedGiftCard | null,
  subtotal: number,
): number {
  if (!applied) return 0;
  return Math.max(0, Math.min(applied.discountAmount, Math.max(0, subtotal)));
}

export function amountDueAfterGiftCard(
  total: number,
  applied: AppliedGiftCard | null,
): number {
  const discount = giftCardDiscountFor(applied, total);
  return Math.max(0, Math.round((total - discount) * 100) / 100);
}

export function describeGiftCardError(err: unknown): string {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  if (status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  const message = err instanceof Error ? err.message.trim() : "";
  return message || "Could not check that code. Please try again.";
}

export function giftCardCodeField(applied: AppliedGiftCard | null): {
  gift_card_code?: string;
} {
  return applied ? { gift_card_code: applied.code } : {};
}

export type GiftCardReconcileOutcome =
  | { action: "settled" }
  | {
      action: "retry";
      reasonCode: "price-changed" | "card-required";
      serverDue: number;
    }
  | { action: "charge"; amount: number };

export function reconcileGiftCardPurchase({
  totalAmount,
  amountPaid,
  status,
  cardDetailsComplete,
  confirmedStatuses = ["confirmed"],
}: {
  totalAmount: number;
  amountPaid: number;
  status: string;
  cardDetailsComplete: boolean;
  confirmedStatuses?: string[];
}): GiftCardReconcileOutcome {
  const serverDue = Math.max(
    0,
    Math.round((totalAmount - amountPaid) * 100) / 100,
  );
  if (serverDue <= 0) {
    return confirmedStatuses.includes(status)
      ? { action: "settled" }
      : { action: "retry", reasonCode: "price-changed", serverDue };
  }
  return cardDetailsComplete
    ? { action: "charge", amount: serverDue }
    : { action: "retry", reasonCode: "card-required", serverDue };
}
