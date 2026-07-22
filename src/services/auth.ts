import { apiRequest, apiUrl } from "../lib/api";
import { clearSession, getToken, handleUnauthorized } from "../lib/session";

/** Staff roles returned by the backend (kept open-ended for forward-compat). */
export type UserRole =
  | "company_admin"
  | "location_manager"
  | "attendant"
  | (string & {});

/** Location summary embedded in the authenticated user payload. */
export interface AuthLocation {
  id: number;
  name: string;
  city?: string | null;
  state?: string | null;
  timezone?: string | null;
}

export interface AuthUser {
  id: number;
  company_id: number | null;
  location_id: number | null;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  location?: AuthLocation | null;
  [key: string]: unknown;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  role: UserRole;
  token: string;
}

/** POST /api/login — exchanges credentials for a user + bearer token. */
export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/login", {
    method: "POST",
    body: credentials,
  });
}

// Startup must never hang on a slow network; a timeout means "offline, assume valid".
const VALIDATE_TIMEOUT_MS = 8000;

/** Launch token check (GET /api/user): 401 → tear down (route to Login, no flash),
 *  network error → keep session. Raw fetch: apiRequest's never-settle would hang. */
export async function validateStoredSession(): Promise<void> {
  const token = getToken();
  if (!token) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl("/api/user"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (res.status === 401) {
      handleUnauthorized();
    }
  } catch {
    // Offline / timeout — keep the session; it re-validates on the next request.
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function signOut(): Promise<void> {
  const token = getToken();
  try {
    if (token) {
      await apiRequest("/api/logout", { method: "POST", token });
    }
  } catch {
    // Ignore network/server errors — the local session is cleared regardless.
  } finally {
    await clearSession();
  }
}
