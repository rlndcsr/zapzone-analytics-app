import { handleUnauthorized } from "./session";

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

// Public web (Zappoint) origin where customers open purchase pages. The web app
// uses `window.location.origin`; the mobile app has no equivalent, so it reads
// the frontend host from EXPO_PUBLIC_WEB_URL. Falls back to the API origin when
// unset — links stay structurally correct but point at the wrong host until the
// var is configured.
const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_WEB_URL?.trim() || API_BASE_URL
).replace(/\/+$/, "");

/** Absolute URL on the public web frontend (e.g. a customer purchase page). */
export function webUrl(path: string): string {
  return `${WEB_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Resolve a stored image reference to something `<Image>` can load. Passes
 * through absolute URLs and base64 data URIs; prefixes the API host for
 * server-relative paths and the storage disk for bare filenames/paths.
 */
export function mediaUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const p = String(path).trim();
  if (!p) return null;
  // Already usable: absolute URL or data URI.
  if (/^(https?:|data:)/i.test(p)) return p;
  // Server-relative path.
  if (p.startsWith("/")) return `${API_BASE_URL}${p}`;
  // Raw base64 image data stored without the data-URI prefix (long token, no
  // path separators) — wrap it so <Image> can decode it.
  if (p.length > 200 && !p.includes("/") && !p.includes(" ")) {
    return `data:image/jpeg;base64,${p}`;
  }
  // Otherwise a storage-relative path/filename.
  return `${API_BASE_URL}/storage/${p.replace(/^storage\//, "")}`;
}

/** Field-keyed validation messages as returned by the Laravel backend. */
export type FieldErrors = Record<string, string[]>;

/** Error thrown for any non-2xx response or network failure. */
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

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Bearer token for protected endpoints. */
  token?: string;
};

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, signal, token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Fail fast after 15s instead of hanging indefinitely.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 15000);
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
    // A 401 means the session is no longer valid — clear it globally so the
    // auth guard redirects to Login (401 only; 403 is a role-permission denial).
    if (response.status === 401) {
      handleUnauthorized();
    }
    const message =
      typeof data?.message === "string"
        ? data.message
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, data?.errors);
  }

  return data as T;
}
