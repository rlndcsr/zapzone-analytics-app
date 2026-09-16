/**
 * Naming the card a guest paid with — a mirror of the web admin's
 * `utils/cardLabel.ts`, so "Card Used" reads identically in both admins.
 *
 * The backend stores the brand as whatever the gateway sent ("VISA", "amex",
 * "American Express"), so the brand is normalised through a lookup before it is
 * shown; an unrecognised brand is kept verbatim rather than dropped.
 */

export type CardBearingPayment = {
  status?: string | null;
  card_type?: string | null;
  card_last_four?: string | null;
  card_label?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  id?: number | string | null;
};

export type CardIdentity = {
  brand: string | null;
  lastFour: string;
  label: string;
};

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

/** Brand + last four as one object, for a caller that wants them separately. */
export function cardIdentity(
  type?: string | null,
  lastFour?: string | null,
): CardIdentity | null {
  const four = normalizeLastFour(lastFour);
  if (!four) return null;
  const brand = normalizeCardBrand(type);
  return { brand, lastFour: four, label: `${brand ?? "Card"} ending in ${four}` };
}

export function formatCardLabel(
  type?: string | null,
  lastFour?: string | null,
  serverLabel?: string | null,
): string | null {
  if (serverLabel?.trim()) return serverLabel.trim();
  return cardIdentity(type, lastFour)?.label ?? null;
}

/**
 * Picks the one payment to show a card for: a completed payment outranks any
 * other status, and among equals the most recent wins. A payment with no
 * timestamp falls back to its id, so insertion order still breaks the tie.
 * Shared by both payment shapes below so the ranking logic exists once.
 */
function bestPayment<P extends { status?: string | null }>(
  payments: P[] | null | undefined,
  hasCard: (p: P) => boolean,
  timestampOf: (p: P) => string | null | undefined,
  idOf: (p: P) => number | string | null | undefined,
): P | null {
  if (!Array.isArray(payments) || payments.length === 0) return null;

  const withCard = payments.filter(hasCard);
  if (withCard.length === 0) return null;

  const rank = (p: P) => (p.status === "completed" ? 0 : 1);
  const when = (p: P) => {
    const stamp = timestampOf(p);
    const time = stamp ? Date.parse(stamp) : NaN;
    return Number.isNaN(time) ? Number(idOf(p) ?? 0) : time;
  };

  return [...withCard].sort((a, b) => rank(a) - rank(b) || when(b) - when(a))[0];
}

/** The one card to show, from a raw (snake_case) payment history. */
export function cardLabelFromPayments(
  payments?: CardBearingPayment[] | null,
): string | null {
  const best = bestPayment(
    payments,
    (p) => !!normalizeLastFour(p?.card_last_four) || !!p?.card_label?.trim(),
    (p) => p?.paid_at ?? p?.created_at,
    (p) => p?.id,
  );
  if (!best) return null;
  return formatCardLabel(best.card_type, best.card_last_four, best.card_label);
}

/** A mapped (camelCase) payment history row — e.g. `BookingDetail.payments`. */
export type MappedCardPayment = {
  id?: number | string | null;
  status?: string | null;
  cardType?: string | null;
  cardLastFour?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

/** The one card to show, from an already-mapped (camelCase) payment history. */
export function cardFromPayments(
  payments?: MappedCardPayment[] | null,
): CardIdentity | null {
  const best = bestPayment(
    payments,
    (p) => !!normalizeLastFour(p?.cardLastFour),
    (p) => p?.paidAt ?? p?.createdAt,
    (p) => p?.id,
  );
  return best ? cardIdentity(best.cardType, best.cardLastFour) : null;
}
