import { markAccountSignInRequired } from "../lib/accounts/savedAccountsStore";
import { apiRequest, apiUrl } from "../lib/api";
import { unregisterCurrentPushDevice } from "../lib/notifications/pushDevice";
import {
  clearSession,
  getCurrentUser,
  getToken,
  handleUnauthorized,
} from "../lib/session";

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

/** Why a saved account's stored token could not be used. */
export type TokenCheckFailureKind =
  /** Revoked or invalid — this account needs a password again. */
  | "unauthorized"
  /** The staff account itself is no longer active. */
  | "inactive"
  /** Offline or timed out — nothing is wrong with the token. */
  | "network"
  /** 5xx or an unreadable body — worth retrying. */
  | "server";

export class TokenCheckError extends Error {
  readonly kind: TokenCheckFailureKind;
  readonly status: number;

  constructor(kind: TokenCheckFailureKind, message: string, status = 0) {
    super(message);
    this.name = "TokenCheckError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Prove a saved account's token still works and return that account fresh, in
 * one round trip: `GET /api/users/{id}` (UserController::show) is auth-only and
 * eager-loads `company` + `location`, so the result is a complete AuthUser —
 * including the `location` relation that a bare `GET /api/user` omits.
 *
 * Raw fetch on purpose. Routing this through {@link apiRequest} would hand a
 * 401 to `handleUnauthorized()`, tearing down the account the user is *still
 * signed in as*, and its 401 path returns a promise that never settles, so the
 * switch would hang forever.
 */
export async function fetchUserWithToken(
  userId: number,
  token: string,
): Promise<AuthUser> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/users/${userId}`), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch {
    throw new TokenCheckError(
      "network",
      "Couldn't reach the server. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401) {
    throw new TokenCheckError(
      "unauthorized",
      "That session has expired. Please sign in again.",
      401,
    );
  }

  if (!response.ok) {
    throw new TokenCheckError(
      "server",
      response.status >= 500
        ? "The server is unavailable right now. Please try again."
        : "Couldn't verify that account. Please try again.",
      response.status,
    );
  }

  const body = (await response.json().catch(() => null)) as {
    data?: AuthUser;
  } | null;
  const user = body?.data;

  if (!user || typeof user.id !== "number") {
    throw new TokenCheckError(
      "server",
      "Couldn't read that account. Please try again.",
      response.status,
    );
  }

  if (typeof user.status === "string" && user.status !== "active") {
    throw new TokenCheckError("inactive", "This account is no longer active.");
  }

  return user;
}

/**
 * Revoke one specific token (`POST /api/logout` deletes only the bearer it is
 * called with, and writes the User Logout activity row). Raw fetch for the same
 * reason as above: revoking an *already dead* token of some other saved account
 * would otherwise 401 through `apiRequest` and sign the current user out.
 *
 * Best-effort by design — offline, the local copy still goes away.
 */
export async function revokeToken(token: string): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
  } catch {
    // Offline or timed out: the server-side token outlives our copy of it.
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sign out of the active account. Revokes its token and ends the session, but
 * *keeps* the saved account — it simply asks for a password next time. Only
 * "Remove account" erases one.
 *
 * Push deregistration runs first and only because of ordering: the endpoint is
 * authenticated, so it has to spend the bearer before `revokeToken` kills it.
 * It cannot fail the sign-out — it swallows its own errors and is capped by its
 * own timeout, so nothing here can strand the user in the logged-in state.
 */
export async function signOut(): Promise<void> {
  const token = getToken();
  const userId = getCurrentUser()?.id ?? null;

  if (token) {
    await unregisterCurrentPushDevice(token);
    await revokeToken(token);
  }
  if (userId != null) await markAccountSignInRequired(userId);

  await clearSession();
}
