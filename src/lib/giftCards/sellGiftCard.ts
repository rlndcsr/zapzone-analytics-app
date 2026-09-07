export const GIFT_CARD_SELL_PRESETS = [25, 50, 100, 150, 200];
export const GIFT_CARD_SELL_MIN = 10;
export const GIFT_CARD_SELL_MAX = 500;

export type SellAmountValidation =
  { ok: true; amount: number } | { ok: false; message: string };

export function validateSellAmount(raw: string): SellAmountValidation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Please enter a gift card amount." };
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) {
    return { ok: false, message: "Please enter a valid amount." };
  }
  if (amount < GIFT_CARD_SELL_MIN || amount > GIFT_CARD_SELL_MAX) {
    return {
      ok: false,
      message: `Amount must be between $${GIFT_CARD_SELL_MIN} and $${GIFT_CARD_SELL_MAX}.`,
    };
  }
  return { ok: true, amount };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidPurchaserEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export function describeSellResult<T>(result: {
  duplicate?: boolean;
  data: T;
}): { card: T; message: string } {
  return {
    card: result.data,
    message: result.duplicate
      ? "This sale was already recorded — showing the same card."
      : "Gift card sold successfully!",
  };
}
