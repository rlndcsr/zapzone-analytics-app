/**
 * What a gateway refund actually did, read only from the server's answer — or
 * from the lack of one (spec 002, contracts/refund-response.md).
 *
 * Shapes are those of zapzone-backend@2bbd0fa `PaymentController::refund`:
 *
 *  • A refund that Authorize.Net rejects as "not settled" on a full, first
 *    refund is voided instead and still answers 200 with
 *    `was_void_fallback: true` — Mobile always sends full refunds, so any
 *    refund may come back as a void.
 *  • Not every error proves no money moved. A generic 500 can follow an approved
 *    refund (the writes after approval aren't transactional), 400 "Unknown
 *    error" with `error_code: null` means the gateway never answered, and
 *    400 `is_unsettled: true` hides whether the void fallback was answered.
 *    Those, anything unrecognised, and no answer at all are UNKNOWN.
 *  • A failure is CONFIRMED only for the shapes the server writes before any
 *    gateway call, or when the gateway answered with a refusal.
 *
 * Nothing here reads message text to decide an outcome, handles authentication
 * (a 401 never reaches the caller — the shared client signs out), or invents an
 * amount: only a valid amount the server sent is ever shown.
 */
import { money } from "./paymentDisplay.ts";

export type RefundAttempt =
  | { kind: "ok"; body: unknown }
  | { kind: "error"; status: number; body: unknown }
  | { kind: "no_answer" };

export type RefundOutcome =
  | { kind: "refunded"; row: "S3"; amount: number | null; refundPaymentId: number | null }
  | { kind: "voided"; row: "S1" | "S2"; amount: number | null; cancelled: boolean }
  | { kind: "failed"; row: "F1" | "F2" | "F3" | "F4" | "F5"; message: string }
  | { kind: "unknown"; row: "U1" | "U2" | "U3" | "U4" | "U5" | "U6" };

export const REFUND_UNKNOWN_MESSAGE =
  "The refund result could not be confirmed. The transaction may still have been processed. Please verify the payment status before attempting another refund.";

const FAILURE_FALLBACK = "The refund was not processed.";

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A server amount, or null. Valid only as a finite number above zero, or the
 * backend's `decimal:2` string form ("50.00") above zero — never anything the
 * client could have substituted.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * A thrown request failure as an attempt. An `ApiError`-like value with a
 * status above zero was answered; status 0 (timeout, dropped connection) or
 * anything else unexpected counts as no answer.
 */
export function refundAttemptFromError(err: unknown): RefundAttempt {
  const status = isObject(err) ? err.status : undefined;
  if (typeof status === "number" && status > 0) {
    return { kind: "error", status, body: (err as JsonObject).body };
  }
  return { kind: "no_answer" };
}

const failed = (
  row: "F1" | "F2" | "F3" | "F4" | "F5",
  body: JsonObject,
): RefundOutcome => ({
  kind: "failed",
  row,
  message: typeof body.message === "string" && body.message.trim() ? body.message : FAILURE_FALLBACK,
});

const unknown = (row: "U1" | "U2" | "U3" | "U4" | "U5" | "U6"): RefundOutcome => ({ kind: "unknown", row });

function classifySuccess(body: unknown): RefundOutcome {
  if (!isObject(body) || body.success !== true) return unknown("U6");

  if (!("was_void_fallback" in body)) {
    const refundPayment = isObject(body.data) ? body.data.refund_payment : undefined;
    const id = isObject(refundPayment) ? refundPayment.id : undefined;
    return {
      kind: "refunded",
      row: "S3",
      amount: parseAmount(body.refund_amount),
      refundPaymentId: typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null,
    };
  }

  if (body.was_void_fallback !== true) return unknown("U6");
  const cancelled = body.payable_cancelled === true;
  return {
    kind: "voided",
    row: cancelled ? "S1" : "S2",
    amount: parseAmount(body.void_amount),
    cancelled,
  };
}

function classifyError(status: number, body: unknown): RefundOutcome {
  if (status === 502 || status === 504) return unknown("U2");
  if (!isObject(body)) return status === 503 ? unknown("U2") : unknown("U6");

  switch (status) {
    case 503:
      return body.success === false ? failed("F4", body) : unknown("U2");
    case 500:
      return body.error_code === "DECRYPTION_FAILED" ? failed("F5", body) : unknown("U3");
    case 400: {
      if ("is_unsettled" in body) {
        if (body.is_unsettled === true) return unknown("U5");
        if (body.is_unsettled !== false) return unknown("U6");
        if (body.error_code === null || body.error_code === undefined) return unknown("U4");
        return typeof body.error_code === "string" && body.error_code !== ""
          ? failed("F2", body)
          : unknown("U6");
      }
      return body.success === false ? failed("F1", body) : unknown("U6");
    }
    // Every 403/404/422 producer runs before the handler's try block (and so
    // before any gateway call); inside it, any exception becomes a 500.
    case 403:
      return body.success === false ? failed("F3", body) : unknown("U6");
    case 404:
      return typeof body.message === "string" && !("success" in body) ? failed("F3", body) : unknown("U6");
    case 422:
      return body.success === false || isObject(body.errors) ? failed("F3", body) : unknown("U6");
    default:
      return unknown("U6");
  }
}

/** The spec's outcome table (S1–S3, F1–F5, U1–U6), in contract order. */
export function classifyRefundOutcome(attempt: RefundAttempt): RefundOutcome {
  if (attempt.kind === "no_answer") return unknown("U1");
  if (attempt.kind === "ok") return classifySuccess(attempt.body);
  return classifyError(attempt.status, attempt.body);
}

/**
 * The alert for an outcome. With a valid server amount the void wording matches
 * the web's RefundModal; without one it stays neutral and names no amount.
 * Cancellation is mentioned only when the server confirmed it, and nothing
 * promises when funds reach the card.
 */
export function refundOutcomeNotice(
  outcome: RefundOutcome,
  ctx: { payableType: string | null },
): { title: string; message: string } {
  const entity = ctx.payableType === "booking" ? "booking" : "purchase";

  switch (outcome.kind) {
    case "refunded": {
      const record = outcome.refundPaymentId != null ? ` Refund Payment #${outcome.refundPaymentId}` : "";
      const lead =
        outcome.amount != null
          ? `Refund of ${money(outcome.amount)} processed successfully.`
          : "Payment refunded successfully.";
      return { title: "Refund processed", message: lead + record };
    }
    case "voided": {
      if (outcome.amount != null) {
        const cancelled = outcome.cancelled ? ` and the ${entity} was cancelled` : "";
        return {
          title: "Payment voided",
          message: `This payment had not settled yet, so it was voided instead of refunded. The full ${money(outcome.amount)} goes back to the card${cancelled}.`,
        };
      }
      return {
        title: "Payment voided",
        message: outcome.cancelled
          ? `Payment voided instead of refunded, and the associated ${entity} was cancelled.`
          : "Payment voided instead of refunded.",
      };
    }
    case "failed":
      return { title: "Refund failed", message: outcome.message };
    case "unknown":
      return { title: "Refund result unknown", message: REFUND_UNKNOWN_MESSAGE };
  }
}
