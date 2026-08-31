// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "./debug/authDebug";
import {
  resolveFirstMediaPath,
  resolveMediaPath,
  resolveMediaPathList,
} from "./mediaPath";
import {
  handleUnauthorized,
  isSessionInvalidated,
  touchSession,
} from "./session";

const API_BASE_URL = (() => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and restart the dev server.",
    );
  }
  return url.replace(/\/+$/, "");
})();

// EXPO_PUBLIC_* values are inlined at bundle time, so surface the one actually
// baked into this bundle — it can lag a .env edit until the cache is cleared.
if (__DEV__) console.log(`[api] base URL = ${API_BASE_URL}`);

/** Absolute URL for an API path — for native flows (file download / multipart
 *  upload) that bypass {@link apiRequest}'s JSON handling. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

// var is configured.
const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_WEB_URL?.trim() || API_BASE_URL
).replace(/\/+$/, "");

/** Absolute URL on the public web frontend (e.g. a customer purchase page). */
export function webUrl(path: string): string {
  return `${WEB_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A stored image reference as an absolute URL — a file path, a base64 data URI
 * or an already-absolute URL. The rules live in `lib/mediaPath` so they can be
 * unit-tested; this only supplies the app's base URL.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  return resolveMediaPath(path, API_BASE_URL);
}

/**
 * Every image in a column that may hold one value, an array, or a JSON-encoded
 * array in a string column — several image columns are cast to arrays
 * server-side while others are plain strings, so both shapes reach the client
 * for the same kind of field.
 */
export function mediaUrlList(image: unknown): string[] {
  return resolveMediaPathList(image, API_BASE_URL);
}

/**
 * First usable image URL from any of those shapes, else null.
 *
 * Prefer this over {@link mediaUrl} for any column the API casts to an array:
 * passing an array to `mediaUrl` stringifies it, and a two-image column becomes
 * "a.jpg,b.jpg" — a URL that resolves to nothing.
 */
export function firstMediaUrl(image: unknown): string | null {
  return resolveFirstMediaPath(image, API_BASE_URL);
}

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: FieldErrors;
  /**
   * The parsed error body, for endpoints that return structured detail beyond
   * `message` / `errors` (e.g. the `conflicts` array a 409 location-change
   * approval answers with). On a transport failure (`status === 0`) this holds
   * the original exception instead, since there is no response to parse.
   */
  readonly body?: unknown;

  constructor(
    message: string,
    status: number,
    fieldErrors?: FieldErrors,
    body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.body = body;
  }
}

/**
 * First field-level message from a 422, when the API returned one. Lets a screen
 * show "The interval minutes must be at least 15." instead of the generic
 * validation message Laravel wraps it in.
 */
export function firstFieldError(err: unknown): string | undefined {
  if (!(err instanceof ApiError) || !err.fieldErrors) return undefined;
  for (const messages of Object.values(err.fieldErrors)) {
    const first = messages?.[0];
    if (typeof first === "string" && first.trim()) return first;
  }
  return undefined;
}

/** Default request timeout — fail fast instead of hanging indefinitely. */
export const DEFAULT_TIMEOUT_MS = 15000;

/** A promise that never settles: a 401'd request resolves to this so no caller's
 *  `catch` runs (no error banner/toast) — the AuthGuard handles the redirect. */
function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Bearer token for protected endpoints. */
  token?: string;
  /**
   * Per-request timeout in ms. Defaults to {@link DEFAULT_TIMEOUT_MS} (15s);
   * raise it only for known-heavy endpoints (e.g. the dashboard metrics call).
   */
  timeoutMs?: number;
  /**
   * Marks a route that needs no authentication (e.g. the mobile version check),
   * so its response can never touch session state: a 401 from such a route is a
   * server/proxy misconfiguration, not an expired session, and must not log the
   * user out — it throws an ApiError like any other failure. Success likewise
   * doesn't extend the inactivity window, since no user action caused it.
   */
  publicEndpoint?: boolean;
};

export async function apiRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    signal,
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    publicEndpoint = false,
  }: RequestOptions = {},
): Promise<T> {
  // After a 401 teardown, silently drop pending/new authenticated requests.
  // Login (no token) is never blocked, so re-authentication still works.
  if (token && isSessionInvalidated()) {
    return neverSettles<T>();
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // An already-aborted caller signal never fires "abort", so bail out before
  // starting a request that nothing could then cancel.
  if (signal?.aborted) {
    return neverSettles<T>();
  }

  // TEMP (investigation): every AUTHENTICATED request, so a teardown can be
  // traced back to the call that caused it. Unauthenticated calls are skipped
  // to keep the trace readable.
  if (token) authDebug("api.request", { method, path });

  // Fail fast after `timeoutMs` instead of hanging indefinitely.
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  const onCallerAbort = () => timeoutController.abort();
  signal?.addEventListener("abort", onCallerAbort);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeoutController.signal,
    });
  } catch (err) {
    // Caller aborted (unmount / superseded request): settle never, like a 401,
    // so cancelling a request never surfaces as a failure to the consumer.
    if (signal?.aborted && !timedOut) {
      return neverSettles<T>();
    }
    // Keep the original exception: it is the only thing that distinguishes a
    // dead radio from a DNS or TLS failure, and it has no other witness.
    if (__DEV__) {
      // Log the RESOLVED url — a stale inlined EXPO_PUBLIC_API_URL looks
      // identical to a dead connection unless the host is visible.
      console.warn(`[api] ${method} ${API_BASE_URL}${path} failed:`, err);
    }
    // Say WHICH failure happened — a slow server and a dead connection need
    // different fixes, so don't collapse them into one message.
    throw new ApiError(
      timedOut
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`
        : "Network error. Please check your connection and try again.",
      0,
      undefined,
      err,
    );
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // TEMP (investigation): every non-2xx, so a teardown is never the first
    // sign that something failed.
    authDebug("api.response NOT OK", {
      method,
      path,
      status: response.status,
      authenticated: !!token,
    });
    // 401 → tear down once (idempotent) and swallow silently, so parallel 401s
    // cause no banners and one logout. 403 (role denial) still surfaces below.
    if (response.status === 401 && !publicEndpoint) {
      // TEMP (investigation): names the exact request that tore the session down.
      authDebug("api.401 → handleUnauthorized", { method, path });
      handleUnauthorized();
      return neverSettles<T>();
    }
    const message =
      typeof data?.message === "string"
        ? data.message
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, data?.errors, data);
  }

  // Successful requests extend the session (except before login, and except
  // unauthenticated background calls, which aren't user activity).
  if (!publicEndpoint) void touchSession();

  return data as T;
}
