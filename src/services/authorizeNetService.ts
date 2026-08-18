import { ApiError, apiRequest } from "../lib/api";

/* ------------------------------------------------------------------ types -- */

export type AuthorizeNetEnvironment = "sandbox" | "production";

export type AuthorizeNetAccountLocation = {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
};

export type AuthorizeNetAccount = {
  id: number;
  /** null for a centralized (company-wide) account — those carry a `label`. */
  locationId: number | null;
  label: string | null;
  environment: AuthorizeNetEnvironment;
  isActive: boolean;
  connectedAt: string | null;
  lastTestedAt: string | null;
  location: AuthorizeNetAccountLocation | null;
};

/** The caller's own location status, from GET /api/authorize-net/account. */
export type AuthorizeNetStatus = {
  connected: boolean;
  /**
   * False when the stored credentials can no longer be decrypted (the backend
   * reports this when APP_KEY has rotated since they were saved). The account
   * still exists, so this is distinct from `connected: false`.
   */
  credentialsValid: boolean;
  account: AuthorizeNetAccount | null;
  /** Set when the endpoint refused the caller (no location on the account). */
  unavailableReason: string | null;
};

type RawLocation = {
  id?: unknown;
  name?: unknown;
  city?: unknown;
  state?: unknown;
};

type RawAccount = {
  id?: unknown;
  location_id?: unknown;
  label?: unknown;
  environment?: unknown;
  is_active?: unknown;
  connected_at?: unknown;
  last_tested_at?: unknown;
  location?: RawLocation | null;
};

/* ---------------------------------------------------------------- mapping -- */

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function mapLocation(l: RawLocation | null | undefined): AuthorizeNetAccountLocation | null {
  if (!l || typeof l.id !== "number") return null;
  return {
    id: l.id,
    name: text(l.name) ?? `Location #${l.id}`,
    city: text(l.city),
    state: text(l.state),
  };
}

function mapAccount(a: RawAccount): AuthorizeNetAccount {
  return {
    id: typeof a.id === "number" ? a.id : 0,
    locationId: typeof a.location_id === "number" ? a.location_id : null,
    label: text(a.label),
    environment: a.environment === "production" ? "production" : "sandbox",
    // The API sends 1/0 as often as true/false.
    isActive: a.is_active === true || a.is_active === 1,
    connectedAt: text(a.connected_at),
    lastTestedAt: text(a.last_tested_at),
    location: mapLocation(a.location),
  };
}

/** Display name for a row: the location, or the label of a centralized account. */
export function authorizeNetAccountName(a: AuthorizeNetAccount): string {
  return a.location?.name ?? a.label ?? "Centralized Account";
}

/** "City, ST" for a row, or null when the account has no location. */
export function authorizeNetAccountPlace(a: AuthorizeNetAccount): string | null {
  const parts = [a.location?.city, a.location?.state].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/* --------------------------------------------------------------- requests -- */

/**
 * GET /api/authorize-net/accounts/all — every connected account with its
 * location, the list behind the web's "All Authorize.Net Connections" modal.
 */
export async function fetchAuthorizeNetAccounts(
  token: string,
  signal?: AbortSignal,
): Promise<AuthorizeNetAccount[]> {
  const res = await apiRequest<{ data?: RawAccount[] } | RawAccount[]>(
    "/api/authorize-net/accounts/all",
    { token, signal },
  );
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list
    .filter((a): a is RawAccount => !!a)
    .map(mapAccount)
    .sort((a, b) =>
      authorizeNetAccountName(a).localeCompare(authorizeNetAccountName(b)),
    );
}

/**
 * GET /api/authorize-net/account — the account for the *caller's own* location.
 *
 * The endpoint reads `user.location_id`, so it 403s for a company admin (who has
 * no single location). That is a scope answer, not a failure, so it resolves to
 * a disconnected status carrying the reason instead of throwing — the same thing
 * the web card shows as "Not connected".
 */
export async function fetchAuthorizeNetStatus(
  token: string,
  signal?: AbortSignal,
): Promise<AuthorizeNetStatus> {
  type RawStatus = {
    connected?: unknown;
    credentials_valid?: unknown;
    account?: RawAccount | null;
    message?: unknown;
  };

  try {
    const res = await apiRequest<RawStatus>("/api/authorize-net/account", {
      token,
      signal,
    });
    const connected = res.connected === true;
    return {
      connected,
      credentialsValid: res.credentials_valid !== false,
      account: connected && res.account ? mapAccount(res.account) : null,
      unavailableReason: null,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      return {
        connected: false,
        credentialsValid: true,
        account: null,
        unavailableReason: err.message,
      };
    }
    throw err;
  }
}

export type ConnectAuthorizeNetPayload = {
  apiLoginId: string;
  transactionKey: string;
  publicClientKey: string;
  environment: AuthorizeNetEnvironment;
  /** company_admin only; omit/null for a centralized company-wide account. */
  locationId?: number | null;
  /** Names a centralized account; ignored when a location is given. */
  label?: string;
};

/**
 * POST /api/authorize-net/account — the same payload the web connect form
 * sends. A company admin may target any location; other roles are pinned to
 * their own server-side. Throws ApiError on 409 (location already connected)
 * and 422 (validation).
 */
export async function connectAuthorizeNetAccount(
  token: string,
  payload: ConnectAuthorizeNetPayload,
): Promise<void> {
  await apiRequest("/api/authorize-net/account", {
    method: "POST",
    token,
    body: {
      api_login_id: payload.apiLoginId.trim(),
      transaction_key: payload.transactionKey.trim(),
      public_client_key: payload.publicClientKey.trim(),
      environment: payload.environment,
      ...(payload.locationId != null
        ? { location_id: payload.locationId }
        : payload.label
          ? { label: payload.label.trim() }
          : {}),
    },
  });
}

/**
 * DELETE /api/authorize-net/account — disconnects the account belonging to the
 * *caller's own* location. There is no per-location variant on the backend, so
 * this cannot target an arbitrary row; callers must only offer it for the row
 * that matches the signed-in user's location.
 */
export async function disconnectOwnAuthorizeNetAccount(
  token: string,
): Promise<void> {
  await apiRequest("/api/authorize-net/account", { method: "DELETE", token });
}
