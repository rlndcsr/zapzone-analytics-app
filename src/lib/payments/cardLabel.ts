/**
 * Naming the card a guest paid with — a mirror of the web admin's
 * `utils/cardLabel.ts`, so "Card Used" reads identically in both admins.
 *
 * The backend stores the brand as whatever the gateway sent ("VISA", "amex",
 * "American Express"), so the brand is normalised through a lookup before it is
 * shown; an unrecognised brand is kept verbatim rather than dropped.
 */

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  mc: "Mastercard",
  americanexpress: "American Express",
  amex: "American Express",
  discover: "Discover",
  disc: "Discover",
  jcb: "JCB",
  dinersclub: "Diners Club",
  diners: "Diners Club",
  enroute: "enRoute",
  unionpay: "UnionPay",
  maestro: "Maestro",
};

/** A payment row, narrowed to just what identifying the card needs. */
export type CardBearingPayment = {
  id?: number | null;
  status?: string | null;
  cardType?: string | null;
  cardLastFour?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

export type CardIdentity = {
  brand: string | null;
  lastFour: string;
  label: string;
};

export function normalizeCardBrand(type?: string | null): string | null {
  const raw = (type ?? "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return BRANDS[key] ?? raw;
}

/** The last four digits, or null when fewer than four are stored. */
export function normalizeLastFour(lastFour?: string | null): string | null {
  const digits = String(lastFour ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** "Visa ending in 4242", or null when there is no usable card number. */
export function formatCardLabel(
  type?: string | null,
  lastFour?: string | null,
): string | null {
  const four = normalizeLastFour(lastFour);
  if (!four) return null;
  return `${normalizeCardBrand(type) ?? "Card"} ending in ${four}`;
}

export function cardIdentity(
  type?: string | null,
  lastFour?: string | null,
): CardIdentity | null {
  const four = normalizeLastFour(lastFour);
  if (!four) return null;
  return {
    brand: normalizeCardBrand(type),
    lastFour: four,
    label: `${normalizeCardBrand(type) ?? "Card"} ending in ${four}`,
  };
}

/**
 * The one card to show for a booking: a completed payment outranks any other,
 * and among equals the most recent wins. A payment with no timestamp falls back
 * to its id, so insertion order still breaks the tie.
 */
export function cardFromPayments(
  payments?: CardBearingPayment[] | null,
): CardIdentity | null {
  if (!Array.isArray(payments) || payments.length === 0) return null;

  const withCard = payments.filter((p) => normalizeLastFour(p?.cardLastFour));
  if (withCard.length === 0) return null;

  const rank = (p: CardBearingPayment) => (p?.status === "completed" ? 0 : 1);
  const when = (p: CardBearingPayment) => {
    const stamp = p?.paidAt ?? p?.createdAt;
    const time = stamp ? Date.parse(stamp) : NaN;
    return Number.isNaN(time) ? Number(p?.id ?? 0) : time;
  };

  const best = [...withCard].sort(
    (a, b) => rank(a) - rank(b) || when(b) - when(a),
  )[0];

  return cardIdentity(best.cardType, best.cardLastFour);
}
