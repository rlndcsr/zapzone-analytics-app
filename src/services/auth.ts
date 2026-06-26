import { apiRequest } from "../lib/api";
import { clearSession, getToken } from "../lib/session";

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
