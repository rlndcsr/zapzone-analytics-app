import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";

import {
  expireSession,
  getSessionExpiresAt,
  isSessionExpired,
  useAuthStatus,
} from "../lib/session";

/**
 * Centralized authentication guard. Mounted once in the root layout so it runs
 * across every route. Responsibilities:
 *  - Redirect to Login (`/`) whenever the user is unauthenticated on a protected
 *    route (covers launch, deep links, expiry, and 401-triggered logout). Also
 *    makes Android back self-correcting — returning to a protected route while
 *    signed out re-triggers the redirect.
 *  - Enforce the 1-hour client session expiry via a timer, even if the app stays
 *    open, and re-validate on foreground/resume.
 *
 * Renders nothing.
 */
export function AuthGuard() {
  const authed = useAuthStatus();
  const segments = useSegments();
  const router = useRouter();
  const navState = useRootNavigationState();
  const expiry = getSessionExpiresAt();

  // Redirect unauthenticated users off protected routes. Public routes are the
  // Login screen (`/`, empty segments) and the splash screen.
  useEffect(() => {
    if (!navState?.key) return; // wait until the navigator is mounted
    const seg = segments as string[];
    // Public routes: the Login screen (`/`, no segments) and the splash screen.
    const isPublic = seg.length === 0 || seg[0] === "splash";
    if (!authed && !isPublic) {
      router.replace("/");
    }
  }, [authed, segments, navState?.key, router]);

  // 1-hour expiry timer — fires while the app is open so the user isn't left on
  // a stale screen. Re-armed whenever a new session sets a new expiry.
  useEffect(() => {
    if (!authed || expiry == null) return;
    const ms = Math.max(0, expiry - Date.now());
    const timer = setTimeout(() => expireSession(), ms);
    return () => clearTimeout(timer);
  }, [authed, expiry]);

  // Re-validate on resume: timers can be throttled/paused while backgrounded, so
  // an app returning to the foreground past its expiry must clear immediately.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active" && isSessionExpired()) {
        expireSession();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  return null;
}
