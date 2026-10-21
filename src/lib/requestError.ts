/**
 * What to tell staff when a request fails — web utils/requestError (8198ae3).
 *
 * A refusal (4xx other than 404) carries the server's reason, e.g. "That
 * package belongs to a location you do not manage", so it is shown as sent.
 * A server failure (5xx) or a missing record shows the screen's own friendly
 * fallback instead of whatever the server said. A transport failure
 * (`ApiError.status === 0`) keeps the app's own "Network error…" / "Request
 * timed out…" text, which the web has no equivalent of.
 *
 * Reads the `ApiError` shape (status + message) rather than importing the
 * class, so the rule stays testable under `node --test`.
 */
export function requestErrorMessage(error: unknown, fallback: string): string {
  if (error === null || typeof error !== "object") return fallback;

  const { status, message } = error as { status?: unknown; message?: unknown };
  if (typeof status !== "number" || typeof message !== "string" || message.trim() === "") {
    return fallback;
  }

  const refusal = status >= 400 && status < 500 && status !== 404;
  return refusal || status === 0 ? message : fallback;
}
