/**
 * What a booking restore did, read only from the server's answer or the lack
 * of one (spec 002, FR-010–FR-015, contracts/restore-response.md).
 *
 * zapzone-backend@2bbd0fa `BookingController::restore`:
 *
 *  • A restore whose space was taken while it was deleted still SUCCEEDS — the
 *    server allows the overlap and re-books the slots — and says so in
 *    `space_warning`. That warning is shown in full.
 *  • A rejection is CONFIRMED only for body shapes that code running before the
 *    restore produces: 403 `success:false` (staff-only), 422 `success:false`
 *    (gift card, capacity, blocked for a non-staff caller), 422
 *    `errors.change_reason`, and 409 `code:"BLOCKED_PERIOD"`. The last two reach
 *    here only after staff cancel or decline the shared client's prompt.
 *  • Everything else is UNKNOWN: no answer, a 5xx (one can follow a committed
 *    restore), a malformed success, other 4xx shapes — and any 404, which is
 *    pre-change for that request but usually means an earlier attempt already
 *    restored the booking.
 *
 * No message text decides an outcome; a 401 never reaches here.
 */
export type RestoreAttempt =
  | { kind: "ok"; body: unknown }
  | { kind: "error"; status: number; body: unknown; message: string }
  | { kind: "no_answer" };

export type RestoreOutcome =
  | { kind: "restored" }
  | { kind: "restored_with_warning"; warning: string }
  | { kind: "rejected"; message: string }
  | { kind: "unknown" };

export const RESTORE_UNKNOWN_MESSAGE =
  "The booking restoration could not be confirmed. Please check the booking status before attempting to restore it again.";

const REJECTION_FALLBACK = "The booking was not restored.";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A thrown request failure as an attempt: status above zero was answered; anything else wasn't. */
export function restoreAttemptFromError(err: unknown): RestoreAttempt {
  if (!isObject(err) || typeof err.status !== "number" || err.status <= 0) return { kind: "no_answer" };
  return {
    kind: "error",
    status: err.status,
    body: err.body,
    message: typeof err.message === "string" ? err.message : "",
  };
}

function isConfirmedRejection(status: number, body: unknown): boolean {
  if (!isObject(body)) return false;
  switch (status) {
    case 403:
      return body.success === false;
    case 422:
      return body.success === false || (isObject(body.errors) && body.errors.change_reason != null);
    case 409:
      return body.code === "BLOCKED_PERIOD";
    default:
      return false;
  }
}

export function classifyRestoreOutcome(attempt: RestoreAttempt): RestoreOutcome {
  if (attempt.kind === "no_answer") return { kind: "unknown" };

  if (attempt.kind === "ok") {
    const body = attempt.body;
    if (!isObject(body) || body.success !== true) return { kind: "unknown" };
    const warning = typeof body.space_warning === "string" ? body.space_warning.trim() : "";
    return warning ? { kind: "restored_with_warning", warning } : { kind: "restored" };
  }

  if (!isConfirmedRejection(attempt.status, attempt.body)) return { kind: "unknown" };
  const message = attempt.message.trim();
  return { kind: "rejected", message: message || REJECTION_FALLBACK };
}

/** The alert for a restore outcome; `ref` is the booking's reference (or "#id"). */
export function restoreOutcomeNotice(
  outcome: RestoreOutcome,
  ref: string,
): { title: string; message: string } {
  switch (outcome.kind) {
    case "restored":
      return { title: "Booking restored", message: `${ref} was restored.` };
    case "restored_with_warning":
      return { title: "Booking restored — time clash", message: outcome.warning };
    case "rejected":
      return { title: "Restore failed", message: outcome.message };
    case "unknown":
      return { title: "Restore result unknown", message: RESTORE_UNKNOWN_MESSAGE };
  }
}
