import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import type { AuthUser } from "../services/auth";
import { resetActiveLocation } from "./location/activeLocationStore";

const TOKEN_KEY = "zapzone_auth_token";
const USER_KEY = "zapzone_auth_user";
const EXPIRY_KEY = "zapzone_auth_expires_at";

// Extends the session after user activity. Logs out after 1 hour of inactivity
export const SESSION_TTL_MS = 60 * 60 * 1000;

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

// Makes auth changes update the app immediately
const listeners = new Set<() => void>();
function notify(): void {
  listeners.forEach((l) => l());
}

// Saves the session after login and starts the inactivity timer
export async function setSession(token: string, user: AuthUser): Promise<void> {
  const now = Date.now();
  authToken = token;
  authUser = user;
  expiresAt = now + SESSION_TTL_MS;
  endReason = null;
  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
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

// Restores the saved session on launch. The inactivity window counts only time
// the app is actually open, so a session that "lapsed" purely because the app
// was closed is NOT treated as expired — reopening the app is itself activity.
export async function restoreSession(): Promise<boolean> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);

    if (token && userJson) {
      authUser = JSON.parse(userJson) as AuthUser;
      authToken = token;
      // Start a fresh inactivity window from now instead of honoring a deadline
      // that elapsed while the app was closed. Reset the persist throttle so the
      // next activity writes this refreshed deadline through to storage.
      expiresAt = Date.now() + SESSION_TTL_MS;
      lastExpiryPersistAt = 0;
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

/** Reopening / returning the app to the foreground counts as activity: start a
 *  fresh inactivity window even if the previous one lapsed while the app was
 *  backgrounded or closed. Unlike {@link touchSession}, this revives a lapsed
 *  window on purpose — only idle time with the app OPEN should ever log you out.
 *  No-op when signed out. */
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

/** Clear the session from memory and secure storage (shared cleanup). */
export async function clearSession(): Promise<void> {
  authToken = null;
  authUser = null;
  expiresAt = null;
  lastExpiryPersistAt = 0;
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

// Returns true if the session expired, then clears the flag
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
  return isAuthenticated();
}
