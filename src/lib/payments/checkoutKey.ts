/**
 * One key per checkout attempt, sent as `checkout_key` (web `utils/checkoutKey`).
 *
 * The server remembers which booking/purchase each key created, so a retry of
 * the same attempt finds its own record instead of a different booking the
 * guest already has at that time — the Oct 3 Farmington double charge, where a
 * second rage room was handed the first, already-paid booking and charged again.
 *
 * Keep the key across retries of one attempt (including after an "already
 * booked" answer, so a second tap shows that answer again rather than booking a
 * duplicate); make a new one only once the attempt has finished.
 *
 * The backend accepts at most 64 characters of `[A-Za-z0-9-]`; both branches
 * stay inside that.
 */
export const newCheckoutKey = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** A screen's key plus the sale it was last sent for. */
export type CheckoutKeyState = { key: string; attempt: string | null };

/**
 * The key for this sale (web `checkoutKeyFor`): a retry of the same sale keeps it, so a
 * retry after "no answer" cannot charge twice; a changed sale gets a new one, so it is
 * not told the earlier sale already went through.
 */
export function checkoutKeyFor(state: CheckoutKeyState, attempt: unknown[]): string {
  const fingerprint = JSON.stringify(attempt);
  if (state.attempt !== null && state.attempt !== fingerprint) state.key = newCheckoutKey();
  state.attempt = fingerprint;
  return state.key;
}
