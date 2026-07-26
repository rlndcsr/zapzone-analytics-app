/**
 * Card helpers ported 1:1 from the web `services/PaymentService.ts` so the
 * mobile checkout validates, formats and labels cards exactly like the web
 * admin. Pure functions — no gateway calls, no side effects.
 */

const TEST_CARD_NUMBERS = new Set([
  "4242424242424242",
  "4000056655665556",
  "5555555555554444",
  "2223003122003222",
  "5200828282828210",
  "5105105105105100",
  "378282246310005",
  "371449635398431",
  "6011111111111117",
  "6011000990139424",
  "6011981111111113",
  "3056930009020004",
  "36227206271667",
  "6555900060004105",
  "3566002020360505",
  "6200000000000005",
  "6200000000000047",
  "6205500000000000004",
  "4111111111111111",
  "4007000000027",
  "370000000000002",
  "6011000000000012",
  "3088000000000017",
  "38000000000006",
  "5424000000000015",
]);

export const isTestCardNumber = (cardNumber: string): boolean =>
  TEST_CARD_NUMBERS.has(cardNumber.replace(/\s+/g, ""));

/** Luhn check (web `validateCardNumber`). */
export const validateCardNumber = (cardNumber: string): boolean => {
  const cleaned = cardNumber.replace(/\s+/g, "");
  if (!/^\d+$/.test(cleaned)) return false;

  let sum = 0;
  let isEven = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

/** Groups digits in 4s ("4111 1111 1111 1111"). */
export const formatCardNumber = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\s+/g, "");
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join(" ") : cleaned;
};

export const getCardType = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\s+/g, "");
  if (/^4/.test(cleaned)) return "Visa";
  if (/^5[1-5]/.test(cleaned)) return "Mastercard";
  if (/^3[47]/.test(cleaned)) return "American Express";
  if (/^6(?:011|5)/.test(cleaned)) return "Discover";
  return "Unknown";
};

/** Expiration month options ("01".."12"), as the web's Exp Month select. */
export const CARD_MONTHS: string[] = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

/** Expiration year options — current year + 9, as the web's Exp Year select. */
export const cardYears = (): string[] => {
  const start = new Date().getFullYear();
  return Array.from({ length: 10 }, (_, i) => String(start + i));
};

/** Gateway/network error → customer-facing copy (web `getPaymentErrorMessage`). */
export function getPaymentErrorMessage(error: unknown): string {
  const err = error as { message?: string } | null;
  const combined = (err?.message ?? "").toLowerCase();

  if (combined.includes("declined") || combined.includes("decline"))
    return "Your card was declined. Please check your card details or try a different payment method.";
  if (combined.includes("insufficient") || combined.includes("nsf"))
    return "Insufficient funds. Please try a different card or payment method.";
  if (combined.includes("invalid card") || combined.includes("card number"))
    return "Invalid card number. Please check and re-enter your card details.";
  if (combined.includes("expired") || combined.includes("expiration"))
    return "Your card has expired. Please use a different card.";
  if (
    combined.includes("cvv") ||
    combined.includes("security code") ||
    combined.includes("cvc")
  )
    return "Invalid security code (CVV). Please check the 3 or 4 digit code on your card.";
  if (combined.includes("authentication") || combined.includes("3d secure"))
    return "Card authentication failed. Please try again or use a different card.";
  if (
    combined.includes("network") ||
    combined.includes("connection") ||
    combined.includes("timeout")
  )
    return "Connection error. Please check your internet and try again.";
  if (combined.includes("fraud") || combined.includes("suspicious"))
    return "Transaction blocked for security reasons. Please contact your bank or try a different card.";
  if (combined.includes("too many") || combined.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";

  return (
    err?.message ||
    "Payment could not be processed. Please check your card details and try again."
  );
}
