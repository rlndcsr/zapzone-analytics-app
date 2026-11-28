/**
 * The refund request and what follows it (spec 002, plan Design §3).
 *
 * The request function is injected (the service passes `apiRequest`), so the
 * request count, path, body and timeout are testable under Node without
 * loading the native session module. Everything after the answer — closing the
 * sheet, the alert, the advisory warning and the list reload — goes through
 * callbacks, in a fixed order, exactly once.
 *
 * No retry happens here or anywhere downstream: one confirmed tap, one refund
 * request. The duplicate-confirmation guard and the session check protect the
 * client only; they are not server-side concurrency protection.
 */
import type { SingleFlight } from "../singleFlight.ts";
import {
  classifyRefundOutcome,
  refundAttemptFromError,
  type RefundOutcome,
} from "./refundOutcome.ts";

/**
 * A refund round-trips through Authorize.Net (sometimes a card lookup, the
 * refund, then a void), so it outruns the shared 15s default. Same budget as a
 * card charge; it reduces premature client timeouts but guarantees nothing
 * about when, or whether, the server finishes.
 */
export const REFUND_TIMEOUT_MS = 60_000;

/** The slice of `apiRequest` the flows need. */
export type RequestFn = (
  path: string,
  options: { method: "PATCH" | "POST"; body?: unknown; token?: string; timeoutMs?: number },
) => Promise<unknown>;

/**
 * PATCH /api/payments/{id}/refund — exactly one request, always a full refund,
 * then the answer classified. Never throws for an HTTP or transport failure;
 * a request the shared client never settles (401) leaves this pending too.
 */
export async function executeRefund(
  request: RequestFn,
  token: string,
  paymentId: number,
): Promise<RefundOutcome> {
  try {
    const body = await request(`/api/payments/${paymentId}/refund`, {
      method: "PATCH",
      body: {},
      token,
      timeoutMs: REFUND_TIMEOUT_MS,
    });
    return classifyRefundOutcome({ kind: "ok", body });
  } catch (err) {
    return classifyRefundOutcome(refundAttemptFromError(err));
  }
}

export type RefundFlowDeps = {
  /** The record being refunded (the single-flight key). */
  key: string;
  /** The session that started the attempt (the single-flight owner). */
  owner: unknown;
  guard: SingleFlight;
  refund: () => Promise<RefundOutcome>;
  /** Whether the session that started the attempt is still the current one. */
  isSessionCurrent: () => boolean;
  setBusy: (busy: boolean) => void;
  closeSheet: () => void;
  notify: (title: string, message: string) => void;
  noticeFor: (outcome: RefundOutcome) => { title: string; message: string };
  applyWarning: (outcome: RefundOutcome) => void;
  reload: () => Promise<unknown>;
};

/**
 * One refund attempt, start to finish. Resolves the outcome, or `null` when
 * the same session already has an attempt in flight for this record.
 *
 * Order: busy → refund → (session still current?) → for a confirmed failure
 * just the alert (the sheet stays open, nothing reloads); otherwise close the
 * sheet, the alert, the warning update, then the reload. A failed reload never
 * repeats or alters the alert. A late answer for a session that has since
 * ended shows nothing and reloads nothing, so it can't reach another account.
 */
export function runRefundFlow(deps: RefundFlowDeps): Promise<RefundOutcome | null> {
  return deps.guard.run(deps.key, deps.owner, async () => {
    deps.setBusy(true);
    try {
      const outcome = await deps.refund();
      if (!deps.isSessionCurrent()) return outcome;

      const { title, message } = deps.noticeFor(outcome);
      if (outcome.kind === "failed") {
        deps.notify(title, message);
        deps.applyWarning(outcome);
        return outcome;
      }

      deps.closeSheet();
      deps.notify(title, message);
      deps.applyWarning(outcome);
      try {
        await deps.reload();
      } catch {
        // The list shows its own load error; the outcome alert stands as shown.
      }
      return outcome;
    } finally {
      deps.setBusy(false);
    }
  });
}

/* ---------------------------------------------- advisory retry warning (D-1) */

export const REFUND_RETRY_WARNING =
  "The outcome of a previous refund attempt could not be confirmed. Verify the transaction before proceeding with another refund.";

/** One account + one payment; null when no account is known (nothing is recorded). */
export function retryWarningKey(userId: number | null, paymentId: number): string | null {
  return userId == null ? null : `${userId}:${paymentId}`;
}

/**
 * The warning set after an outcome: an unknown outcome records the key, a
 * confirmed refund or void clears it, a confirmed failure leaves it alone.
 * Returns a new set; the input is never mutated. Held in memory only.
 */
export function nextRetryWarnings(
  prev: ReadonlySet<string>,
  outcome: RefundOutcome,
  userId: number | null,
  paymentId: number,
): ReadonlySet<string> {
  const key = retryWarningKey(userId, paymentId);
  if (key == null) return prev;
  if (outcome.kind === "unknown") {
    if (prev.has(key)) return prev;
    const next = new Set(prev);
    next.add(key);
    return next;
  }
  if ((outcome.kind === "refunded" || outcome.kind === "voided") && prev.has(key)) {
    const next = new Set(prev);
    next.delete(key);
    return next;
  }
  return prev;
}

export function hasRetryWarning(
  set: ReadonlySet<string>,
  userId: number | null,
  paymentId: number,
): boolean {
  const key = retryWarningKey(userId, paymentId);
  return key != null && set.has(key);
}

/** Today's confirmation text, plus the advisory warning when it applies. */
export function refundConfirmMessage(base: string, showWarning: boolean): string {
  return showWarning ? `${base}\n\n${REFUND_RETRY_WARNING}` : base;
}
