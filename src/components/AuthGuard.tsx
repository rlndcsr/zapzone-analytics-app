import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";

import {
  expireSession,
  isSessionExpired,
  touchSession,
  useAuthStatus,
} from "../lib/session";

// How often to slide the inactivity window forward while the app is actively
// foregrounded. Must be well under SESSION_TTL_MS so an in-use session never
// lapses; the exact cadence only affects how promptly we persist the new expiry.
const ACTIVITY_HEARTBEAT_MS = 5 * 60 * 1000;

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

  // Sliding inactivity timeout. While the app is actively foregrounded we keep
  // extending the session (on resume + on a heartbeat) so a session in active
  // use never drops. When the app is backgrounded or closed the window stops
  // advancing, so returning to the foreground — or reopening the app — after the
  // inactivity period logs the user out. Nothing runs while signed out.
  useEffect(() => {
    if (!authed) return;

    const bump = () => {
      if (isSessionExpired()) expireSession();
      else void touchSession();
    };

    // Extend right away: the app is foregrounded and in use.
    bump();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") bump();
    });
    // Heartbeat keeps the window sliding during long, uninterrupted use (no
    // foreground transition to trigger it). Gated to the foreground so a
    // backgrounded app never extends its own session.
    const heartbeat = setInterval(() => {
      if (AppState.currentState === "active") bump();
    }, ACTIVITY_HEARTBEAT_MS);

    return () => {
      sub.remove();
      clearInterval(heartbeat);
    };
  }, [authed]);

  return null;
}
