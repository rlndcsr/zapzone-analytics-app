import { useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  expireSession,
  isSessionExpired,
  touchSession,
  useAuthStatus,
} from "../lib/session";

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;

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

  const routeKey = (segments as string[]).join("/");
  useEffect(() => {
    if (!authed) return;
    void touchSession();
  }, [authed, routeKey]);

  // Inactivity enforcement. Returning to the foreground is activity: extend the
  // window if it's still open, log out if it lapsed while we were away. A
  // check-only interval (which never extends) makes an idle *foregrounded* app
  // expire at the deadline too. Nothing runs while signed out.
  useEffect(() => {
    if (!authed) return;

    // Foreground return / entering the authed state (login, launch) is activity.
    const onForeground = () => {
      if (isSessionExpired()) expireSession();
      else void touchSession();
    };

    onForeground();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") onForeground();
    });
    // Sweep the clock while foregrounded so an untouched session still lapses on
    // time. Check-only: it logs out when expired but never slides the window.
    const expiryCheck = setInterval(() => {
      if (AppState.currentState === "active" && isSessionExpired()) {
        expireSession();
      }
    }, EXPIRY_CHECK_INTERVAL_MS);

    return () => {
      sub.remove();
      clearInterval(expiryCheck);
    };
  }, [authed]);

  return null;
}
