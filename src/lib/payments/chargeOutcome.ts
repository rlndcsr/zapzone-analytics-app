/**
 * When a failed card charge leaves it unknown whether the card was charged.
 *
 * Mirrors the web's `PaymentOutcomeUnknownError` (PaymentService.chargePayment):
 *
 *  • status 0 — a timeout or a dropped connection; the request may have been
 *    processed and only the answer lost.
 *  • 502 / 504 — a proxy gave up waiting on the server, which may still have
 *    reached Authorize.Net.
 *  • 409 CHARGE_IN_PROGRESS — another charge for the same booking or purchase
 *    is still running on the server; its result is not known yet.
 *
 * In every one of these the record must be kept, never rolled back: deleting a
 * booking the card was actually charged for leaves the money with no booking.
 */
export function isChargeOutcomeUnknown(status: number, body?: unknown): boolean {
  if (status === 0 || status === 502 || status === 504) return true;
  return (
    status === 409 &&
    (body as { error_code?: unknown } | null | undefined)?.error_code ===
      "CHARGE_IN_PROGRESS"
  );
}

/**
 * The alert for a charge that failed with a known outcome, after the record was
 * rolled back.
 *
 * When the app put the failure in its own words (a decline it recognised, a
 * card that never tokenized), it adds that the record was cancelled and nothing
 * was charged. When it is showing the server's own words, it adds nothing: the
 * server already says what happened to the money ("we can't tell whether your
 * card was charged", "our team will refund it"), and "no charges were made"
 * would contradict it.
 *
 * @param friendly       The message the screen shows (`getPaymentErrorMessage`).
 * @param serverMessage  The server's message when the server answered, else null.
 */
export function chargeFailureNotice(
  friendly: string,
  serverMessage: string | null,
  subject: "booking" | "purchase" | "order",
): string {
  if (serverMessage !== null && friendly === serverMessage) return friendly;
  return `${friendly}\n\nThe ${subject} has been cancelled and no charges were made.`;
}

/**
 * What staff are told when the outcome is unknown — the web staff pages' wording.
 *
 * @param subject  What was kept: "booking", "purchase" or "order".
 * @param where    Where to check it: "Bookings", "the purchase list", "Orders".
 */
export function chargeUnknownMessage(
  subject: "booking" | "purchase" | "order",
  where: string,
): string {
  return (
    "No answer from the payment service, so the card may or may not have been charged. " +
    `The ${subject} was kept: check it in ${where} or in Authorize.Net before charging again.`
  );
}
