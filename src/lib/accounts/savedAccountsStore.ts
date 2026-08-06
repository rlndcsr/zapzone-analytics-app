import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import type { AuthUser, UserRole } from "../../services/auth";
import { initialsFor } from "./accountAccent";

export type SavedAccountTokenState = "linked" | "signin_required";

export type SavedAccount = {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  initials: string;
  companyId: number | null;
  companyName?: string | null;
  locationName?: string | null;

  avatarPath?: string | null;
  tokenState: SavedAccountTokenState;
  savedAt: number;
  lastUsedAt: number;
};

type SavedAccountsIndex = { v: 1; accounts: SavedAccount[] };

const INDEX_KEY = "zapzone_saved_accounts";
const TOKEN_KEY_PREFIX = "zapzone_saved_token_";

export const MAX_SAVED_ACCOUNTS = 5;

const TOKEN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const tokenKey = (userId: number) => `${TOKEN_KEY_PREFIX}${userId}`;

let accounts: SavedAccount[] = [];

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function sortByRecency(list: SavedAccount[]): SavedAccount[] {
  return [...list].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

function commit(next: SavedAccount[]): void {
  accounts = sortByRecency(next);
  emit();
  const payload: SavedAccountsIndex = { v: 1, accounts };
  SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(payload)).catch(() => {
    // Secure storage unavailable — the list holds for this run only.
  });
}

function isValidAccount(value: unknown): value is SavedAccount {
  const a = value as Partial<SavedAccount> | null;
  return (
    !!a &&
    typeof a.userId === "number" &&
    typeof a.email === "string" &&
    typeof a.name === "string" &&
    (a.tokenState === "linked" || a.tokenState === "signin_required")
  );
}

function avatarPathFor(user: AuthUser): string | null {
  const raw = user.profile_path;
  if (typeof raw !== "string") return null;
  const path = raw.trim();
  if (!path || path.length > 200) return null;
  return path;
}

function companyNameFor(user: AuthUser): string | null {
  const company = user.company as { company_name?: unknown } | null | undefined;
  const name = company?.company_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function getSavedAccounts(): SavedAccount[] {
  return accounts;
}

export function getSavedAccount(userId: number): SavedAccount | undefined {
  return accounts.find((a) => a.userId === userId);
}

export function isSavedAccountsFull(): boolean {
  return accounts.length >= MAX_SAVED_ACCOUNTS;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSavedAccounts(): SavedAccount[] {
  return useSyncExternalStore(subscribe, getSavedAccounts, getSavedAccounts);
}

export async function restoreSavedAccounts(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SavedAccountsIndex;
    if (parsed?.v !== 1 || !Array.isArray(parsed.accounts)) return;
    accounts = sortByRecency(parsed.accounts.filter(isValidAccount));
    emit();
  } catch {
    accounts = [];
  }
}

export async function upsertSavedAccount(
  token: string,
  user: AuthUser,
): Promise<void> {
  const now = Date.now();
  const existing = getSavedAccount(user.id);

  const entry: SavedAccount = {
    userId: user.id,
    name: user.name || `${user.first_name} ${user.last_name}`.trim(),
    email: user.email,
    role: user.role,
    initials: initialsFor(user.name, user.email),
    companyId: user.company_id ?? null,
    companyName: companyNameFor(user) ?? existing?.companyName ?? null,
    locationName: user.location?.name ?? existing?.locationName ?? null,
    avatarPath: avatarPathFor(user) ?? existing?.avatarPath ?? null,
    tokenState: "linked",
    savedAt: existing?.savedAt ?? now,
    lastUsedAt: now,
  };

  let next = accounts.filter((a) => a.userId !== user.id);

  if (!existing && next.length >= MAX_SAVED_ACCOUNTS) {
    const evictable = [...next].sort((a, b) => {
      if (a.tokenState !== b.tokenState) {
        return a.tokenState === "signin_required" ? -1 : 1;
      }
      return a.lastUsedAt - b.lastUsedAt;
    })[0];
    if (evictable) {
      next = next.filter((a) => a.userId !== evictable.userId);
      await deleteToken(evictable.userId);
    }
  }

  commit([entry, ...next]);

  try {
    await SecureStore.setItemAsync(tokenKey(user.id), token, TOKEN_OPTIONS);
  } catch {
    // Token unstorable — the session still works; this account will simply ask
    // for a password next time (getSavedAccountToken self-heals the state).
  }
}

async function deleteToken(userId: number): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(tokenKey(userId), TOKEN_OPTIONS);
  } catch {}
}

export async function markAccountSignInRequired(userId: number): Promise<void> {
  await deleteToken(userId);
  if (!getSavedAccount(userId)) return;
  commit(
    accounts.map((a) =>
      a.userId === userId ? { ...a, tokenState: "signin_required" } : a,
    ),
  );
}

export async function removeSavedAccount(userId: number): Promise<void> {
  await deleteToken(userId);
  commit(accounts.filter((a) => a.userId !== userId));
}

export async function getSavedAccountToken(
  userId: number,
): Promise<string | null> {
  let token: string | null = null;
  try {
    token = await SecureStore.getItemAsync(tokenKey(userId), TOKEN_OPTIONS);
  } catch {
    token = null;
  }

  if (!token && getSavedAccount(userId)?.tokenState === "linked") {
    await markAccountSignInRequired(userId);
  }

  return token;
}
