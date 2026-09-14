/**
 * The one place a booking's payment label, colour and balance are decided.
 *
 * A port of the web admin's `resolvePaymentState` (src/types/Bookings.types.ts)
 * — same inputs, same rules, same wording — so a booking cannot read "Partially
 * Paid" in amber on one client and "Unpaid" in grey on the other. Before this,
 * the app carried two hand-rolled derivations that already disagreed with each
 * other: BookingsTable called a $0 booking `pending`, manual-booking agreed by
 * accident through a different rule, and neither preserved a refund.
 *
 * Three things this gets right that a `paid >= total` check does not:
 *
 *  • A half-cent epsilon. Totals arrive as floats through JSON, so a fully
 *    settled booking routinely lands a hundredth of a cent short and a bare
 *    `>=` calls it partially paid forever.
 *  • Refunded and voided survive. They are states the money can't express —
 *    a refunded booking still has amounts on it — so a stored terminal status
 *    always wins over anything the arithmetic would say.
 *  • A payload with no amounts falls back to the stored status instead of
 *    treating "absent" as zero, which would paint every such row as unpaid.
 */

export type PaymentState = "paid" | "partial" | "pending" | "refunded" | "voided";

export type PaymentStateView = {
  state: PaymentState;
  /** "Paid in Full" / "Partially Paid" / "Unpaid" / "Refunded" / "Voided". */
  label: string;
  /** Refunded or voided: the arithmetic no longer describes this booking. */
  isTerminal: boolean;
  /** Nothing is owed — true for paid, and for the terminal states. */
  isSettled: boolean;
  total: number;
  amountPaid: number;
  /** total − amountPaid, rounded to the cent. Negative means overpaid. */
  balance: number;
  /** What to call the balance row: "Balance Due" / "Paid in Full" / … */
  balanceLabel: string;
  /** NativeWind classes for the status pill (background + text). */
  pillClass: string;
  /** NativeWind classes for a bare amount of money. */
  amountClass: string;
};

/**
 * Half a cent. Anything owing less than this is settled — see the float note
 * above. The backend uses the same figure (BookingRepricer::CENT).
 */
const PAYMENT_EPSILON = 0.005;

const TERMINAL_PAYMENT_STATES: PaymentState[] = ["refunded", "voided"];

const PAID_PILL =
  "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300";
const OWED_PILL = "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300";
const TERMINAL_PILL =
  "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300";

const PAID_AMOUNT = "text-green-600 dark:text-green-400";
const OWED_AMOUNT = "text-red-600 dark:text-red-400";
const TERMINAL_AMOUNT = "text-slate-600 dark:text-slate-400";

/** Money off the wire: strings, nulls and NaN all collapse to a clean number. */
function toCents(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export type PaymentStateInput = {
  payment_status?: string | null;
  amount_paid?: number | string | null;
  total_amount?: number | string | null;
};

export function resolvePaymentState(input: PaymentStateInput): PaymentStateView {
  const total = toCents(input.total_amount);
  const amountPaid = toCents(input.amount_paid);
  const balance = Math.round((total - amountPaid) * 100) / 100;
  const stored = (input.payment_status || "").toLowerCase() as PaymentState;

  // "Absent" is not "zero": a row that carries no amounts at all (a list
  // endpoint that omits them, a summary payload) must not be painted unpaid.
  const amountsKnown =
    input.total_amount !== undefined &&
    input.total_amount !== null &&
    input.amount_paid !== undefined &&
    input.amount_paid !== null;

  if (!amountsKnown && !TERMINAL_PAYMENT_STATES.includes(stored)) {
    const settled = stored === "paid";
    return {
      state: stored || "pending",
      label: settled
        ? "Paid in Full"
        : stored === "partial"
          ? "Partially Paid"
          : "Unpaid",
      isTerminal: false,
      isSettled: settled,
      total,
      amountPaid,
      balance,
      balanceLabel: settled ? "Paid in Full" : "Balance Due",
      pillClass: settled ? PAID_PILL : OWED_PILL,
      amountClass: settled ? PAID_AMOUNT : OWED_AMOUNT,
    };
  }

  if (TERMINAL_PAYMENT_STATES.includes(stored)) {
    return {
      state: stored,
      label: stored === "refunded" ? "Refunded" : "Voided",
      isTerminal: true,
      isSettled: true,
      total,
      amountPaid,
      balance,
      balanceLabel: stored === "refunded" ? "Refunded" : "Voided",
      pillClass: TERMINAL_PILL,
      amountClass: TERMINAL_AMOUNT,
    };
  }

  if (balance <= PAYMENT_EPSILON) {
    return {
      state: "paid",
      label: "Paid in Full",
      isTerminal: false,
      isSettled: true,
      total,
      amountPaid,
      balance,
      // Overpaid is not the same as settled, and the desk needs to see it.
      balanceLabel: balance < -PAYMENT_EPSILON ? "Credit Due" : "Paid in Full",
      pillClass: PAID_PILL,
      amountClass: PAID_AMOUNT,
    };
  }

  const state: PaymentState = amountPaid > 0 ? "partial" : "pending";

  return {
    state,
    label: state === "partial" ? "Partially Paid" : "Unpaid",
    isTerminal: false,
    isSettled: false,
    total,
    amountPaid,
    balance,
    balanceLabel: "Balance Due",
    pillClass: OWED_PILL,
    amountClass: OWED_AMOUNT,
  };
}

/**
 * Just the status word, for the places that persist one. Mirrors the web's
 * `derivePaymentStatus`, which is itself a thin wrapper over the above.
 *
 * Prefer sending `amount_paid` alone and letting the server derive this
 * (BookingRepricer::derive) — this exists for the screens that still have to
 * show a status before anything is saved.
 */
export function derivePaymentStatus(
  amountPaid: number,
  totalAmount: number,
): "paid" | "partial" | "pending" {
  return resolvePaymentState({
    amount_paid: amountPaid,
    total_amount: totalAmount,
  }).state as "paid" | "partial" | "pending";
}
