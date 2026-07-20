import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  expireSession,
  isSessionExpired,
  registerAppResume,
  touchSession,
  useAuthStatus,
} from "../lib/session";

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;

export function AuthGuard() {
  const authed = useAuthStatus();
  const pathname = usePathname();
  const router = useRouter();
  const navState = useRootNavigationState();

  // Kick unauthenticated users off protected routes — and ONLY that direction.
  //
  // Loop-safety is the whole point of how this is written:
  //  • It depends on `pathname` (a stable string) instead of `useSegments()` (a
  //    fresh array every render), so the effect runs only when auth or the route
  //    actually changes — not on every commit / animation frame during a
  //    transition. Re-running every commit while dispatching `router.replace`
  //    is exactly what produced the "Maximum update depth exceeded" crash.
  //  • A ref makes the redirect fire at most once per episode; it re-arms only
  //    once we're somewhere legitimate (authed, or on a public route).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!navState?.key) return; // wait until the navigator is mounted
    const isPublic = pathname === "/" || pathname.startsWith("/splash");
    if (authed || isPublic) {
      redirectedRef.current = false;
      return;
    }
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.replace("/");
    }
  }, [authed, pathname, navState?.key, router]);

  useEffect(() => {
    if (!authed) return;
    void touchSession();
  }, [authed, pathname]);

  // Inactivity enforcement — counting only time the app is OPEN. Entering the
  // authed state and every foreground return is activity, so it slides the
  // window forward (reviving one that lapsed while backgrounded/closed). Only a
  // session left idle *while foregrounded* past the deadline is logged out, by
  // the check-only interval below. Nothing runs while signed out.
  useEffect(() => {
    if (!authed) return;

    // Entering the authed state (login, launch) is activity.
    void registerAppResume();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void registerAppResume();
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
