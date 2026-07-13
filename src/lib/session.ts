import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

import type { AuthUser } from "../services/auth";
import { resetActiveLocation } from "./location/activeLocationStore";

const TOKEN_KEY = "zapzone_auth_token";
const USER_KEY = "zapzone_auth_user";
const EXPIRY_KEY = "zapzone_auth_expires_at";

/** Client-side session lifetime: 1 hour from a successful login. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

let authToken: string | null = null;
let authUser: AuthUser | null = null;
let expiresAt: number | null = null;

// Why the last session ended, so the Login screen can show a subtle notice for
// an expired/invalidated session but stay silent on an intentional sign-out.
type SessionEndReason = "expired" | "unauthorized" | null;
let endReason: SessionEndReason = null;

// Reactive layer (mirrors location/activeLocationStore.ts) so a global guard can
// re-render/redirect the moment auth state changes — the plain getters below are
// not reactive on their own.
const listeners = new Set<() => void>();
function notify(): void {
  listeners.forEach((l) => l());
}

/** Persist + cache the session after a successful login. Starts the 1h timer. */
export async function setSession(token: string, user: AuthUser): Promise<void> {
  authToken = token;
  authUser = user;
  expiresAt = Date.now() + SESSION_TTL_MS;
  endReason = null;
  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
      SecureStore.setItemAsync(EXPIRY_KEY, String(expiresAt)),
    ]);
  } catch {
    // Secure storage unavailable — session remains in memory for this run only.
  }
  notify();
}

/**
 * Rehydrate the in-memory session from secure storage. Call once on launch.
 * Returns true when a stored, still-valid session was restored; a missing or
 * expired session is cleared and returns false.
 */
export async function restoreSession(): Promise<boolean> {
  try {
    const [token, userJson, expiryRaw] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
      SecureStore.getItemAsync(EXPIRY_KEY),
    ]);

    const storedExpiry = expiryRaw ? Number(expiryRaw) : null;
    const valid =
      !!token &&
      !!userJson &&
      storedExpiry != null &&
      !Number.isNaN(storedExpiry) &&
      Date.now() < storedExpiry;

    if (valid) {
      authUser = JSON.parse(userJson) as AuthUser;
      authToken = token;
      expiresAt = storedExpiry;
      return true;
    }

    // A stored-but-past-TTL session should surface the "expired" notice on
    // Login; a simply-absent session (never signed in) should not.
    const hadExpiredSession =
      !!token &&
      !!userJson &&
      storedExpiry != null &&
      !Number.isNaN(storedExpiry);
    if (hadExpiredSession) {
      endReason = "expired";
    }
    await clearSession();
  } catch {
    await clearSession();
  }
  return false;
}

export function getToken(): string | null {
  return authToken;
}

export function getCurrentUser(): AuthUser | null {
  return authUser;
}

/** Epoch-ms the current session expires at (null when signed out). */
export function getSessionExpiresAt(): number | null {
  return expiresAt;
}

/** True once the 1h window has elapsed while a token is still cached. */
export function isSessionExpired(): boolean {
  return expiresAt != null && Date.now() >= expiresAt;
}

export function isAuthenticated(): boolean {
  return authToken !== null && expiresAt != null && Date.now() < expiresAt;
}

/** Clear the session from memory and secure storage (shared cleanup). */
export async function clearSession(): Promise<void> {
  authToken = null;
  authUser = null;
  expiresAt = null;
  // Drop the active workspace location so it can't leak into the next account.
  resetActiveLocation();
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(EXPIRY_KEY),
    ]);
  } catch {
    // Best-effort clear; in-memory state is already reset.
  }
  notify();
}

/** End the session because the 1h window elapsed (timer / resume check). */
export function expireSession(): void {
  endReason = "expired";
  void clearSession();
}

/** End the session because the backend returned 401 (called from the API layer). */
export function handleUnauthorized(): void {
  endReason = "unauthorized";
  void clearSession();
}

/**
 * Returns true once if the session ended because it expired or was rejected
 * (not an intentional sign-out), then clears the flag. Drives the Login notice.
 */
export function consumeSessionExpiredNotice(): boolean {
  const notice = endReason === "expired" || endReason === "unauthorized";
  endReason = null;
  return notice;
}

function subscribeAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Snapshot identity flips whenever the session changes (login/logout/expiry), so
// useSyncExternalStore re-runs subscribers. Token value is a fine snapshot.
function getAuthSnapshot(): string | null {
  return authToken;
}

/** Reactive authentication status for the global guard. */
export function useAuthStatus(): boolean {
  useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
  return isAuthenticated();
}
