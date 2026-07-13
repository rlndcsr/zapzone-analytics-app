import * as SecureStore from "expo-secure-store";

import type { AuthUser } from "../services/auth";
import { resetActiveLocation } from "./location/activeLocationStore";

const TOKEN_KEY = "zapzone_auth_token";
const USER_KEY = "zapzone_auth_user";

let authToken: string | null = null;
let authUser: AuthUser | null = null;

/** Persist + cache the session after a successful login. */
export async function setSession(token: string, user: AuthUser): Promise<void> {
  authToken = token;
  authUser = user;
  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
  } catch {
    // Secure storage unavailable — session remains in memory for this run only.
  }
}

/**
 * Rehydrate the in-memory session from secure storage. Call once on launch.
 * Returns true when a stored session was restored.
 */
export async function restoreSession(): Promise<boolean> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);

    if (token && userJson) {
      const user = JSON.parse(userJson) as AuthUser;
      authToken = token;
      authUser = user;
      return true;
    }
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

export function isAuthenticated(): boolean {
  return authToken !== null;
}

/** Clear the session from memory and secure storage (sign-out). */
export async function clearSession(): Promise<void> {
  authToken = null;
  authUser = null;
  // Drop the active workspace location so it can't leak into the next account.
  resetActiveLocation();
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  } catch {
    // Best-effort clear; in-memory state is already reset.
  }
}
