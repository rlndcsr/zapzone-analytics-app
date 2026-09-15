export type CardBearingPayment = {
  status?: string | null;
  card_type?: string | null;
  card_last_four?: string | null;
  card_label?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  id?: number | string | null;
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

function normalizeBrand(type?: string | null): string | null {
  const raw = (type ?? "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  return BRANDS[key] ?? raw;
}

function normalizeLastFour(lastFour?: string | null): string | null {
  const digits = String(lastFour ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function formatCardLabel(
  type?: string | null,
  lastFour?: string | null,
  serverLabel?: string | null,
): string | null {
  if (serverLabel?.trim()) return serverLabel.trim();
  const four = normalizeLastFour(lastFour);
  if (!four) return null;
  return `${normalizeBrand(type) ?? "Card"} ending in ${four}`;
}

export function cardLabelFromPayments(
  payments?: CardBearingPayment[] | null,
): string | null {
  if (!Array.isArray(payments) || payments.length === 0) return null;

  const withCard = payments.filter(
    (p) => !!normalizeLastFour(p?.card_last_four) || !!p?.card_label?.trim(),
  );
  if (withCard.length === 0) return null;

  const rank = (p: CardBearingPayment) => (p?.status === "completed" ? 0 : 1);
  const when = (p: CardBearingPayment) => {
    const stamp = p?.paid_at ?? p?.created_at;
    const time = stamp ? Date.parse(stamp) : NaN;
    return Number.isNaN(time) ? Number(p?.id ?? 0) : time;
  };

  const best = [...withCard].sort(
    (a, b) => rank(a) - rank(b) || when(b) - when(a),
  )[0];

  return formatCardLabel(best.card_type, best.card_last_four, best.card_label);
}
