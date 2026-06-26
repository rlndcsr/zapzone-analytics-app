const API_BASE_URL = (() => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and restart the dev server.",
    );
  }
  return url.replace(/\/+$/, "");
})();

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

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(
      "Network error. Please check your connection and try again.",
      0,
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, data?.errors);
  }

  return data as T;
}
