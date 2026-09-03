/**
 * Pulling the access token out of a kiosk URL.
 *
 * `POST /waivers/kiosk-session` answers with a page URL
 * (`…/waiver/kiosk-session/{token}`), but the public waiver endpoints are keyed
 * by the token itself. The in-app kiosk needs the token, not the page, so it is
 * lifted from the last path segment.
 *
 * Lives apart from the service so the parsing is unit-testable: a wrong guess
 * here is a 404 at the till, with a customer waiting.
 */
/** Path segments that appear in waiver URLs and are never tokens. */
const ROUTE_WORDS = new Set([
  "waiver",
  "waivers",
  "kiosk",
  "kiosk-session",
  "access",
  "submit",
  "status",
  "bulk",
]);

export function kioskAccessTokenFrom(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  // Query and fragment first — a token is never in either.
  const withoutQuery = String(url).split(/[?#]/)[0];
  const last = withoutQuery.replace(/\/+$/, "").split("/").pop() ?? "";

  // Length alone is not enough: "kiosk-session" is itself 13 url-safe
  // characters, so a URL that stops at the route would hand back the route
  // name and 404. Known path words are rejected outright.
  if (ROUTE_WORDS.has(last.toLowerCase())) return null;

  return /^[A-Za-z0-9_-]{8,}$/.test(last) ? last : null;
}
