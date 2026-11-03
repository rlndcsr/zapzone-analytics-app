/**
 * Bounds for the money fields staff type on an order.
 *
 * The web clamps these inline on every keystroke; the app clamps on blur and
 * again at submit instead, so a value can still be retyped from empty without
 * the field fighting the typing.
 */

/**
 * Clamp a typed money value into [0, max].
 *
 * A blank or unparseable field reads as 0 rather than NaN, so a half-typed
 * amount never reaches the payload. `max` of null leaves the value uncapped.
 */
export function clampAmount(
  value: string | number | null | undefined,
  max?: number | null,
): number {
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
  let next = Number.isFinite(parsed) ? parsed : 0;
  if (next < 0) next = 0;
  if (max != null && Number.isFinite(max) && next > max) next = Math.max(0, max);
  return next;
}

/**
 * The same clamp, rendered back into a text field. Whole amounts lose their
 * trailing ".00" so a field staff never touched still reads "0", not "0.00".
 */
export function clampAmountText(
  value: string | number | null | undefined,
  max?: number | null,
): string {
  const n = clampAmount(value, max);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * The most "Amount Paid" may read on an edit: the new total, or what was
 * already recorded as paid if that is more. When a reschedule or a change of
 * special lowers the total below what the guest handed over, the payment on
 * record is never cut down to match — it shows as a credit due instead (web
 * EditPurchase "Overpaid by … — refund or credit due").
 */
export function editPaidCeiling(total: number, recordedPaid: number): number {
  return Math.max(0, total, Number(recordedPaid) || 0);
}

export type EditBalance =
  | { kind: "due"; amount: number }
  | { kind: "paid"; amount: 0 }
  | { kind: "credit"; amount: number };

/** What is left after paying: owed, settled, or owed back to the guest. */
export function editBalance(total: number, paid: number): EditBalance {
  const balance = Math.round((total - paid) * 100) / 100;
  if (balance > 0.005) return { kind: "due", amount: balance };
  if (balance < -0.005) return { kind: "credit", amount: -balance };
  return { kind: "paid", amount: 0 };
}
