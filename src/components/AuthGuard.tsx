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

  // Redirect unauthed users off protected routes only. Depends on `pathname`
  // (stable) not `useSegments()`, and a ref fires it once — both avoid the
  // render-loop crash; the ref re-arms once authed or on a public route.
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
      // Reset the stack, not just navigate: dismissAll() pops pushed module
      // screens so Back can't re-enter them, then replace() swaps in Login.
      if (router.canDismiss()) router.dismissAll();
      router.replace("/");
    }
  }, [authed, pathname, navState?.key, router]);

  useEffect(() => {
    if (!authed) return;
    void touchSession();
  }, [authed, pathname]);

  // Inactivity enforcement, counting only time the app is OPEN: entering authed
  // and each foreground return slide the window; the interval below logs out a
  // session left idle-while-foregrounded past the deadline.
  useEffect(() => {
    if (!authed) return;

    // Entering the authed state (login, launch) is activity.
    void registerAppResume();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void registerAppResume();
    });
    // Check-only sweep: logs out an expired foregrounded session, never extends.
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
