import { venueNow } from "../date/venueTime.ts";

export type SpecialEntryLike = {
  source?: string | null;
  special_pricing_id?: number | null;
  discount_amount: number | string;
  discount_name?: string | null;
};

export function isSpecialPricingDiscount(d: {
  source?: string | null;
  special_pricing_id?: number | null;
}): boolean {
  return d.source === "special_pricing" || !!d.special_pricing_id;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function specialPricingTotal(
  list: readonly SpecialEntryLike[] | null | undefined,
): number {
  return cents(
    (list ?? [])
      .filter(isSpecialPricingDiscount)
      .reduce((sum, d) => sum + (Number(d.discount_amount) || 0), 0),
  );
}

const idsOf = (list: readonly SpecialEntryLike[]) =>
  list.map((d) => d.special_pricing_id ?? d.discount_name ?? "").join("|");

type LabelLike = {
  discount_label?: string | null;
  discount_type?: string | null;
  quantity?: number | null;
};

export function perTicketLabel(d: LabelLike): string {
  if (!d.discount_label) return "";
  return d.discount_type === "fixed" && (d.quantity ?? 1) > 1
    ? `${d.discount_label} each`
    : d.discount_label;
}

export function perTicketOffLabel(d: LabelLike): string {
  if (!d.discount_label) return "";
  return d.discount_type === "fixed" && (d.quantity ?? 1) > 1
    ? `${d.discount_label} off each`
    : `${d.discount_label} off`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function venueTodayKey(now: Date = new Date()): string {
  const { year, month, day } = venueNow(now);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function venueClock(now: Date = new Date()): string {
  const { hour, minute } = venueNow(now);
  return `${pad(hour)}:${pad(minute)}`;
}

export function hhmm(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  return m ? `${pad(Number(m[1]))}:${m[2]}` : "";
}

export function specialVisit(
  scheduledDate: string | null | undefined,
  scheduledTime: string | null | undefined,
  now: Date = new Date(),
): { date: string; time: string | undefined } {
  if (scheduledDate) {
    return { date: scheduledDate, time: hhmm(scheduledTime) || undefined };
  }
  return { date: venueTodayKey(now), time: venueClock(now) };
}

export function packageSpecialQuantity(
  pricingType: string | null | undefined,
  participants: number | string | null | undefined,
): number {
  if (pricingType !== "per_person") return 1;
  return Math.max(1, Math.floor(Number(participants) || 0) || 1);
}

export type RawSpecialDiscount = Record<string, unknown>;
export type RawSpecialBreakdownLike = {
  original_price?: unknown;
  discounted_price?: unknown;
  total_discount?: unknown;
  discounts_applied?: RawSpecialDiscount[] | null;
  has_special_pricing?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  unit_discount?: unknown;
};

export function normalizeSpecialBreakdown(
  raw: RawSpecialBreakdownLike,
  requestedQuantity: number,
): RawSpecialBreakdownLike {
  const qty = Math.max(1, Math.floor(requestedQuantity) || 1);
  if (raw.quantity !== undefined && raw.quantity !== null) return raw;
  const unitPrice = Number(raw.original_price ?? 0) || 0;
  const unitDiscount = Number(raw.total_discount ?? 0) || 0;
  const lines = (raw.discounts_applied ?? []).map((d) => {
    const unit = Number(d.discount_amount ?? 0) || 0;
    return {
      ...d,
      discount_amount: cents(unit * qty),
      unit_discount_amount: unit,
      quantity: qty,
    };
  });
  const original = cents(unitPrice * qty);
  // Summed from the scaled lines, exactly as the current server totals them
  // (round(Σ round(unit × qty, 2), 2)), never from the one-unit total × qty.
  const total =
    lines.length > 0
      ? cents(lines.reduce((sum, d) => sum + d.discount_amount, 0))
      : cents(unitDiscount * qty);
  return {
    ...raw,
    original_price: original,
    total_discount: total,
    discounted_price: cents(Math.max(0, original - total)),
    discounts_applied: lines,
    quantity: qty,
    unit_price: unitPrice,
    unit_discount: unitDiscount,
  };
}

export type SpecialDeal = {
  special_pricing_id: number;
  name: string;
  description: string | null;
  discount_type: "fixed" | "percentage";
  discount_amount: number;
  discount_label: string;
  recurrence_type: string;
  recurrence_value: number | null;
  recurrence_display: string;
  specific_date: string | null;
  start_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  next_dates: string[];
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ordinal = (n: number) => {
  if ([11, 12, 13].includes(n % 100)) return `${n}th`;
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[
    n % 10
  ];
  return `${n}${suffix ?? "th"}`;
};

const clock = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m || 0)} ${h >= 12 ? "PM" : "AM"}`;
};

/** "2026-11-10" → "Nov 10" — read as a calendar date, never through a time zone. */
const shortDate = (date: string) => {
  const [, m, d] = date.split("T")[0].split("-").map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]} ${d || 1}`;
};

const longDate = (date: string) => {
  const [y, m, d] = date.split("T")[0].split("-").map(Number);
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS_SHORT[m - 1]} ${d}`;
};

const dealHours = (deal: Pick<SpecialDeal, "time_start" | "time_end">) => {
  if (deal.time_start && deal.time_end) {
    return `, ${clock(deal.time_start)}–${clock(deal.time_end)}`;
  }
  if (deal.time_start) return ` from ${clock(deal.time_start)}`;
  if (deal.time_end) return ` until ${clock(deal.time_end)}`;
  return "";
};

const dealWindow = (
  deal: Pick<SpecialDeal, "recurrence_type" | "start_date" | "end_date">,
  todayKey: string,
) => {
  if (deal.recurrence_type === "one_time") return "";
  const start = deal.start_date?.split("T")[0];
  const from = start && start > todayKey ? ` from ${shortDate(start)}` : "";
  const through = deal.end_date ? ` through ${shortDate(deal.end_date)}` : "";
  return `${from}${through}`;
};

/** "on Tuesdays, 5:00 PM–9:00 PM through Dec 31" (web specialDealWhen). */
export function specialDealWhen(
  deal: SpecialDeal,
  todayKey: string = venueTodayKey(),
): string {
  let when = deal.recurrence_display;
  if (deal.recurrence_type === "weekly" && deal.recurrence_value != null) {
    when = `on ${WEEKDAY_NAMES[deal.recurrence_value]}s`;
  } else if (
    deal.recurrence_type === "monthly" &&
    deal.recurrence_value != null
  ) {
    when = `on the ${ordinal(deal.recurrence_value)} of each month`;
  } else if (deal.recurrence_type === "one_time" && deal.specific_date) {
    when = `on ${longDate(deal.specific_date)}`;
  }
  return `${when}${dealHours(deal)}${dealWindow(deal, todayKey)}`;
}

export type DealUnit = "ticket" | "person" | "booking";

/** "$5.00 off each ticket for visits on Tuesdays" (web specialDealHeadline). */
export function specialDealHeadline(
  deal: SpecialDeal,
  unit: DealUnit = "ticket",
  todayKey: string = venueTodayKey(),
): string {
  const amount =
    deal.discount_type === "fixed"
      ? `${deal.discount_label} off ${unit === "booking" ? "the booking" : `each ${unit}`}`
      : `${deal.discount_label} off`;
  return `${amount} ${deal.discount_type === "fixed" ? "for visits" : "visits"} ${specialDealWhen(deal, todayKey)}`;
}

/** Calendar days that get a special → "$5.00 off, 10% off" (web dealDatesFor). */
export function dealDatesFor(
  dates: Record<string, { discount_label: string }[]> | null | undefined,
): Record<string, string> | undefined {
  if (!dates) return undefined;
  const entries = Object.entries(dates).filter(([, list]) => list.length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([date, list]) => [
      date,
      list.map((d) => `${d.discount_label} off`).join(", "),
    ]),
  );
}

/** The line under the deals, saying the special follows the visit day (web SpecialDealNote). */
export function specialDealHint(
  applied: boolean,
  selectedDate: string | null | undefined,
): string {
  if (applied) return "Your visit date gets the special price.";
  return selectedDate
    ? "The special is based on the day you visit, not the day you buy. Pick a special day to save."
    : "The special is based on the day you visit, not the day you buy — pick a special day to save.";
}

export const SPECIAL_CHECK_FAILED =
  "We couldn't check the special price for this visit, so payment is paused.";

export type SpecialCheckState = "idle" | "checking" | "failed" | "ready";

export function specialCheckState(
  needed: boolean,
  wantedKey: string,
  answer: { key: string; failed: boolean } | null,
): SpecialCheckState {
  if (!needed) return "idle";
  if (!answer || answer.key !== wantedKey) return "checking";
  return answer.failed ? "failed" : "ready";
}

export function specialPaymentBlocker(state: SpecialCheckState): string | null {
  if (state === "checking") return "Checking the special price for this visit…";
  if (state === "failed") return "The special price could not be checked.";
  return null;
}

export type Visit = {
  entityId: number | null;
  date: string;
  time: string;
  quantity: number;
};

export function sameVisit(a: Visit, b: Visit): boolean {
  return (
    a.date === b.date &&
    hhmm(a.time) === hhmm(b.time) &&
    a.quantity === b.quantity &&
    a.entityId === b.entityId
  );
}

export function visitChangeWhere(
  original: Visit,
  current: Visit,
  dateWord: string,
): string {
  if (current.date !== original.date) return `on the new ${dateWord}`;
  if (hhmm(current.time) !== hhmm(original.time)) return "at the new time";
  if (current.entityId !== original.entityId) return "for the new attraction";
  return `for ${current.quantity} ticket${current.quantity === 1 ? "" : "s"}`;
}

export type PurchaseSpecialQuote<
  T extends SpecialEntryLike = SpecialEntryLike,
> = {
  changed: boolean;
  specialDiscounts: T[];
  specialPricingDiscount: number;
  givenSpecial: number;
  proposedSpecial: number;
  delta: number;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const namesOf = (list: readonly SpecialEntryLike[]) =>
  list
    .map((d) => d.discount_name ?? "")
    .filter(Boolean)
    .join(", ");

export function repricingNotice(args: {
  quote: PurchaseSpecialQuote;
  isOrderLine: boolean;
  where: string;
  originalSpecial: readonly SpecialEntryLike[];
}): string | null {
  const { quote, isOrderLine, where, originalSpecial } = args;
  if (!quote.changed) return null;
  if (isOrderLine) {
    return `The special price ${where} would be ${money(quote.proposedSpecial)} off (these tickets got ${money(quote.givenSpecial)} off). Bulk-order tickets keep the price that was paid.`;
  }
  if (quote.specialDiscounts.length === 0) {
    return `${namesOf(originalSpecial) || "The special price"} does not apply ${where} — the ${money(quote.givenSpecial)} special discount is removed.`;
  }
  return `${namesOf(quote.specialDiscounts)} applies ${where}: ${money(quote.specialPricingDiscount)} off (was ${money(quote.givenSpecial)} off).`;
}

export const REPRICING_FAILED =
  "Could not check the special price for this change. Try again before saving.";

export type SwapMemo = { raw: number | null; lastSet: number | null };

export function applySpecialTarget<T extends SpecialEntryLike>(
  applied: readonly T[],
  discountAmount: number,
  target: readonly T[],
  memo: SwapMemo,
): { applied: T[]; discountAmount: number; memo: SwapMemo } | null {
  const current = applied.filter(isSpecialPricingDiscount);
  const delta = cents(
    specialPricingTotal(target) - specialPricingTotal(current),
  );
  if (Math.abs(delta) < 0.005 && idsOf(target) === idsOf(current)) return null;

  const base =
    memo.raw !== null && memo.lastSet === discountAmount
      ? memo.raw
      : discountAmount;
  const raw = cents(base + delta);
  const next = Math.max(0, raw);
  return {
    applied: [
      ...target,
      ...applied.filter((d) => !isSpecialPricingDiscount(d)),
    ],
    discountAmount: next,
    memo: { raw, lastSet: next },
  };
}

export function soldTicketPrice(p: {
  unitPrice: number | null | undefined;
  totalAmount: number;
  discountAmount: number;
  quantity: number;
  addOns: readonly { priceAtPurchase: number; quantity: number }[];
  fees: readonly {
    fee_amount: number | string;
    fee_application_type?: string | null;
  }[];
}): number | null {
  if (p.unitPrice != null && Number.isFinite(Number(p.unitPrice))) {
    return Number(p.unitPrice);
  }
  const addOns = p.addOns.reduce(
    (s, a) => s + a.priceAtPurchase * a.quantity,
    0,
  );
  const fees = p.fees
    .filter((f) => f.fee_application_type === "additive")
    .reduce((s, f) => s + (Number(f.fee_amount) || 0), 0);
  const unit =
    (p.totalAmount + p.discountAmount - addOns - fees) /
    Math.max(1, p.quantity);
  return unit > 0 ? unit : null;
}
