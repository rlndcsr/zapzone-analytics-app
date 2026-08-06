import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import type { AuthUser, UserRole } from "../services/auth";
import { metricsCacheService } from "../services/metricsCacheService";
import {
  markAccountSignInRequired,
  upsertSavedAccount,
} from "./accounts/savedAccountsStore";
import { resetActiveLocation } from "./location/activeLocationStore";

const TOKEN_KEY = "zapzone_auth_token";
const USER_KEY = "zapzone_auth_user";
const EXPIRY_KEY = "zapzone_auth_expires_at";

// TEMP: 30-day session while debugging the login nav bug; was 60 * 60 * 1000 (1h).
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Limits how often the updated session expiry is saved to storage
const EXPIRY_PERSIST_THROTTLE_MS = 60 * 1000;

let authToken: string | null = null;
let authUser: AuthUser | null = null;
let expiresAt: number | null = null;
let lastExpiryPersistAt = 0;

// Why the last session ended, so the Login screen can show a subtle notice for
// an expired/invalidated session but stay silent on an intentional sign-out.
type SessionEndReason = "expired" | "unauthorized" | null;
let endReason: SessionEndReason = null;

// Single-logout latch: the first involuntary failure (401/timeout) flips it so
// one teardown runs for many parallel failures. Reset only on a fresh session.
let sessionInvalidated = false;

// Makes auth changes update the app immediately
const listeners = new Set<() => void>();
function notify(): void {
  if (__DEV__)
    console.log(
      "[SESSION] notify() -> " +
        listeners.size +
        " listeners; authed=" +
        isAuthenticated(),
    );
  listeners.forEach((l) => l());
}

/**
 * What gets written to SecureStore for the signed-in user. `profile_path` can
 * hold ~27 MB of base64 (UserController::update validates `max:27262976`), and
 * nothing reads it off the session — every avatar comes from a fresh profile
 * fetch — so it is dropped rather than pushed through a keychain write that
 * large payloads can fail outright. The in-memory user keeps every field.
 */
function persistableUser(user: AuthUser): AuthUser {
  const { profile_path: _dropped, ...rest } = user;
  return rest as AuthUser;
}

// Saves the session after login and starts the inactivity timer
export async function setSession(token: string, user: AuthUser): Promise<void> {
  if (__DEV__) console.log("[SESSION] setSession() begin");
  const now = Date.now();
  // Captured before the swap: any incoming user that isn't the one already in
  // memory means the *account* changed, not just the token.
  const accountChanged = authUser?.id !== user.id;
  authToken = token;
  authUser = user;
  expiresAt = now + SESSION_TTL_MS;
  endReason = null;
  // A brand-new session clears the involuntary-logout latch so authenticated
  // requests are allowed again (the previous 401, if any, is fully behind us).
  sessionInvalidated = false;

  // Per-account global state must not survive an account change. `clearSession`
  // covers the logout→login path, but adding or switching accounts never clears
  // — without this, the previous admin's workspace location would silently
  // scope the new account's data. A signed-out cold start counts as a change
  // too (the persisted location belongs to whoever last chose it).
  if (accountChanged) {
    resetActiveLocation();
    void metricsCacheService.clearAllCaches();
  }
  // Every route into a session — login, add-account, switch — records the
  // account here, so there is no path that forgets to save one.
  void upsertSavedAccount(token, user);

  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(persistableUser(user))),
      SecureStore.setItemAsync(EXPIRY_KEY, String(expiresAt)),
    ]);
    // Record the persist so the first post-login `touchSession` doesn't rewrite
    // the expiry inside the throttle window.
    lastExpiryPersistAt = now;
  } catch {
    // Secure storage unavailable — session remains in memory for this run only.
  }
  notify();
}

// Restores the saved session on launch. A window that "lapsed" only because the
// app was closed is NOT expired — reopening the app counts as activity.
export async function restoreSession(): Promise<boolean> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);

    if (token && userJson) {
      authUser = JSON.parse(userJson) as AuthUser;
      authToken = token;
      // Fresh window from now (ignore the closed-app deadline); reset the
      // persist throttle so the next activity writes it through.
      expiresAt = Date.now() + SESSION_TTL_MS;
      lastExpiryPersistAt = 0;
      // Start clean so an earlier latch (dev fast refresh) can't block requests.
      sessionInvalidated = false;
      // Self-heal installs that predate saved accounts: the session already on
      // the device becomes its first saved account on this launch.
      void upsertSavedAccount(token, authUser);
      return true;
    }

    // No stored credentials — clear any partial remnants. (No "expired" notice:
    // there was no in-app session that timed out, so the login screen stays quiet.)
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

/** Slide the inactivity window forward on activity (no-op when signed out; never
 *  notifies, so no re-render). Won't revive a lapsed session; persistence throttled. */
export async function touchSession(): Promise<void> {
  if (authToken == null) return;
  // Once the window has elapsed, activity must not extend it — logout wins.
  if (isSessionExpired()) return;
  const now = Date.now();
  expiresAt = now + SESSION_TTL_MS;
  // Throttle persistence: skip the SecureStore write if we persisted recently.
  if (now - lastExpiryPersistAt < EXPIRY_PERSIST_THROTTLE_MS) return;
  lastExpiryPersistAt = now;
  try {
    await SecureStore.setItemAsync(EXPIRY_KEY, String(expiresAt));
  } catch {
    // Secure storage unavailable — the in-memory extension still applies.
  }
}

/** Foregrounding is activity: start a fresh window, reviving a lapsed one on
 *  purpose (only idle time while OPEN logs you out). No-op when signed out. */
export async function registerAppResume(): Promise<void> {
  if (authToken == null) return;
  const now = Date.now();
  expiresAt = now + SESSION_TTL_MS;
  lastExpiryPersistAt = now;
  try {
    await SecureStore.setItemAsync(EXPIRY_KEY, String(expiresAt));
  } catch {
    // Secure storage unavailable — the in-memory extension still applies.
  }
}

/** True once the 1h window has elapsed while a token is still cached. */
export function isSessionExpired(): boolean {
  return expiresAt != null && Date.now() >= expiresAt;
}

export function isAuthenticated(): boolean {
  return authToken !== null && expiresAt != null && Date.now() < expiresAt;
}

/**
 * Tear down the active session. Deliberately neutral about saved accounts: it
 * never adds, downgrades or removes an entry. Each caller layers its own effect
 * on top (see the teardown matrix in `invalidateSession` and `signOut`), so one
 * behaviour belongs to one call site instead of a flag threaded through here.
 */
export async function clearSession(): Promise<void> {
  authToken = null;
  authUser = null;
  expiresAt = null;
  lastExpiryPersistAt = 0;
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

function invalidateSession(reason: Exclude<SessionEndReason, null>): void {
  if (sessionInvalidated) return; // one logout flow, regardless of the count
  sessionInvalidated = true;
  endReason = reason;
  // Read before clearSession() nulls it.
  const userId = authUser?.id ?? null;
  // "unauthorized" means the token is dead server-side, so drop the credential
  // — but keep the account, because only an explicit Remove erases one. An
  // "expired" window is different: the app locked itself while the token stayed
  // valid, so that account remains one tap away.
  if (reason === "unauthorized" && userId != null) {
    void markAccountSignInRequired(userId);
  }
  void clearSession();
}

/** End the session because the 1h window elapsed (timer / resume check). */
export function expireSession(): void {
  invalidateSession("expired");
}

export function handleUnauthorized(): void {
  invalidateSession("unauthorized");
}

export function isSessionInvalidated(): boolean {
  return sessionInvalidated;
}

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

// Triggers updates on login, logout, or session expiry.
function getAuthSnapshot(): string | null {
  return authToken;
}

/** Reactive authentication status for the global guard. */
export function useAuthStatus(): boolean {
  useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
  if (__DEV__) console.count("[render] useAuthStatus consumer tick");
  return isAuthenticated();
}

function getUserIdSnapshot(): number | null {
  return authUser?.id ?? null;
}

/** Reactive id of the signed-in user — which saved account is the live one. */
export function useCurrentUserId(): number | null {
  return useSyncExternalStore(subscribeAuth, getUserIdSnapshot, getUserIdSnapshot);
}

function getRoleSnapshot(): UserRole | null {
  return authUser?.role ?? null;
}

/** Reactive role of the signed-in user (null when signed out). Role-aware UI
 *  that outlives a single sign-in — the app-wide Quick Navigation FAB — reads
 *  this instead of a getCurrentUser() snapshot taken at mount. */
export function useCurrentUserRole(): UserRole | null {
  return useSyncExternalStore(subscribeAuth, getRoleSnapshot, getRoleSnapshot);
}
