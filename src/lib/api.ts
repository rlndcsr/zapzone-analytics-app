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

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const p = String(path).trim();
  if (!p) return null;
  if (/^(https?:|data:)/i.test(p)) return p;
  if (p.startsWith("/")) return `${API_BASE_URL}${p}`;
  if (p.length > 200 && !p.includes("/") && !p.includes(" ")) {
    return `data:image/jpeg;base64,${p}`;
  }
  // Otherwise a storage-relative path/filename.
  return `${API_BASE_URL}/storage/${p.replace(/^storage\//, "")}`;
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
    // 401 → tear down once (idempotent) and swallow silently, so parallel 401s
    // cause no banners and one logout. 403 (role denial) still surfaces below.
    if (response.status === 401 && !publicEndpoint) {
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
