import type { AuthUser } from "../../services/auth";
import { fetchUserWithToken, TokenCheckError } from "../../services/auth";
import { restoreTimeframeSelection } from "../dashboard/timeframeStore";
import { setSession } from "../session";
import {
  getSavedAccountToken,
  markAccountSignInRequired,
  type SavedAccount,
} from "./savedAccountsStore";

export const SWITCH_MIN_DWELL_MS = 550;

export type SwitchPreparation =
  | { status: "ready" }
  | { status: "needs_password"; message: string | null }
  | { status: "error"; message: string }
  | { status: "busy" };

type PendingSwitch = { token: string; user: AuthUser };

let pending: PendingSwitch | null = null;
let switching = false;

export function isSwitchInFlight(): boolean {
  return switching;
}

export async function prepareAccountSwitch(
  account: SavedAccount,
): Promise<SwitchPreparation> {
  if (switching) return { status: "busy" };
  switching = true;

  try {
    const token = await getSavedAccountToken(account.userId);
    if (!token) {
      switching = false;
      return { status: "needs_password", message: null };
    }

    const user = await fetchUserWithToken(account.userId, token);
    pending = { token, user };
    return { status: "ready" };
  } catch (error) {
    switching = false;

    if (error instanceof TokenCheckError) {
      if (error.kind === "unauthorized") {
        await markAccountSignInRequired(account.userId);
        return { status: "needs_password", message: error.message };
      }
      if (error.kind === "inactive") {
        await markAccountSignInRequired(account.userId);
        return { status: "error", message: error.message };
      }
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: "Couldn't switch accounts. Please try again.",
    };
  }
}

export function clearPendingSwitch(): void {
  pending = null;
  switching = false;
}

export async function commitPendingSwitch(): Promise<boolean> {
  const staged = pending;
  pending = null;

  if (!staged) {
    switching = false;
    return false;
  }

  try {
    await setSession(staged.token, staged.user);
    await restoreTimeframeSelection();
    return true;
  } finally {
    switching = false;
  }
}
