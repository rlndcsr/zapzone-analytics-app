/**
 * The create form's expiry rule. The API stores a new card only when its expiry
 * is `after:today` — stricter than editing — so today itself is refused, not
 * just the past. A blank expiry is a card that never expires. Only a
 * well-formed YYYY-MM-DD is judged here; anything else is left to the API,
 * whose own message the form then shows.
 */
export const GIFT_CARD_EXPIRY_AFTER_TODAY =
  "An expiry date has to be after today. Leave it blank for a card that never expires.";

export function giftCardExpiryError(
  expiry: string,
  todayKey: string | null | undefined,
): string | null {
  const value = expiry.trim();
  if (!value || !todayKey || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value <= todayKey ? GIFT_CARD_EXPIRY_AFTER_TODAY : null;
}
