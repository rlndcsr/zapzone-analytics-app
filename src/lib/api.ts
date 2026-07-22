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

  constructor(message: string, status: number, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
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
};

export async function apiRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    signal,
    token,
    timeoutMs = DEFAULT_TIMEOUT_MS,
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

  // Fail fast after `timeoutMs` instead of hanging indefinitely.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
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
  } catch {
    throw new ApiError(
      "Network error or request timed out. Please try again.",
      0,
    );
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // 401 → tear down once (idempotent) and swallow silently, so parallel 401s
    // cause no banners and one logout. 403 (role denial) still surfaces below.
    if (response.status === 401) {
      handleUnauthorized();
      return neverSettles<T>();
    }
    const message =
      typeof data?.message === "string"
        ? data.message
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, data?.errors);
  }

  // Successful requests extend the session (except before login).
  void touchSession();

  return data as T;
}
