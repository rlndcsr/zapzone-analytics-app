import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../lib/debug/authDebug";
import { isPublicRoute } from "../lib/navigation/publicRoutes";
import {
  expireSession,
  isAuthenticated,
  isSessionExpired,
  registerAppResume,
  touchSession,
  useAuthStatus,
} from "../lib/session";

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;

// TEMP (investigation): numbers each render so a later effect run can be
// attributed to the exact render whose closure it carries. Remove with the
// rest of the [AUTH-DEBUG] instrumentation.
let authGuardRenderSeq = 0;

export function AuthGuard() {
  const authed = useAuthStatus();
  const pathname = usePathname();
  const router = useRouter();
  const navState = useRootNavigationState();

  const renderId = ++authGuardRenderSeq;

  // Redirect unauthed users off protected routes only. Depends on `pathname`
  // (stable) not `useSegments()`, and a ref fires it once — both avoid the
  // render-loop crash; the ref re-arms once authed or on a public route.
  const redirectedRef = useRef(false);
  // TEMP (investigation): which dependency actually changed on each effect run.
  const prevDepsRef = useRef<{
    authed: boolean;
    pathname: string;
    navKey: string;
  } | null>(null);

  // `closureAuthed` is the value the effect below will capture; `liveAuthed` is
  // `isAuthenticated()` read at log time. They are identical here (same
  // synchronous pass) — the point is to prove they can DIVERGE by effect time.
  authDebug("AuthGuard render", {
    renderId,
    closureAuthed: authed,
    liveAuthed: isAuthenticated(),
    path: pathname,
    isPublic: isPublicRoute(pathname),
    refCurrent: redirectedRef.current,
    navKey: String(navState?.key),
  });
  useEffect(() => {
    const navKey = String(navState?.key);
    const prev = prevDepsRef.current;
    const trigger = prev
      ? [
          prev.authed !== authed ? "authed" : null,
          prev.pathname !== pathname ? "pathname" : null,
          prev.navKey !== navKey ? "navKey" : null,
        ]
          .filter(Boolean)
          .join(",") || "none(identity-only)"
      : "mount";
    prevDepsRef.current = { authed, pathname, navKey };

    const isPublic = isPublicRoute(pathname);
    // The ref as this run ENTERS, before any branch mutates it.
    const refAtEntry = redirectedRef.current;
    // TEMP (investigation): `closure*` are the captured values this run BRANCHES
    // on; `liveAuthed` is the module state right now. A divergence proves the
    // effect is running against a session state that has already moved on.
    authDebug("AuthGuard redirect-effect", {
      fromRenderId: renderId,
      trigger,
      closureAuthed: authed,
      liveAuthed: isAuthenticated(),
      closurePathname: pathname,
      closureIsPublic: isPublic,
      refAtEntry,
      navKey,
    });

    if (!navState?.key) {
      authDebug("AuthGuard → skip: navigator not mounted", {
        fromRenderId: renderId,
      });
      return; // wait until the navigator is mounted
    }
    if (authed || isPublic) {
      if (redirectedRef.current) {
        authDebug("AuthGuard → RE-ARM redirectedRef", {
          fromRenderId: renderId,
          because: authed ? "authed" : "publicRoute",
          closureAuthed: authed,
          liveAuthed: isAuthenticated(),
          path: pathname,
          refAtEntry,
        });
      }
      redirectedRef.current = false;
      return;
    }
    if (!redirectedRef.current) {
      // `authed` above is captured at render. Navigation is irreversible — once
      // dispatched, no effect cleanup can take it back — so the premise is
      // revalidated against the source of truth at the moment of acting.
      //
      // The gap is real, not theoretical: `setSession` assigns the module-level
      // token synchronously but only calls `notify()` after three awaited
      // SecureStore writes, so a render committed inside that window carries an
      // `authed` that is already out of date by the time its passive effect
      // runs. Redirecting then would bounce a signed-in user back to Login.
      if (isAuthenticated()) {
        authDebug("AuthGuard → ABORT redirect: live session is valid", {
          fromRenderId: renderId,
          closureAuthed: authed,
          liveAuthed: true,
          closurePathname: pathname,
        });
        return;
      }
      redirectedRef.current = true;
      // Reset the stack, not just navigate: dismissAll() pops pushed module
      // screens so Back can't re-enter them, then replace() swaps in Login.
      // TEMP (investigation): hoisted only so the value can be logged — it was
      // already evaluated exactly once here.
      const canDismiss = router.canDismiss();
      authDebug("AuthGuard → REDIRECT to /", {
        fromRenderId: renderId,
        closureAuthed: authed,
        liveAuthed: isAuthenticated(),
        closurePathname: pathname,
        closureIsPublic: isPublic,
        refAtEntry,
        from: pathname,
        canDismiss,
      });
      if (canDismiss) {
        authDebug("AuthGuard router.dismissAll()");
        router.dismissAll();
      }
      authDebug('AuthGuard router.replace("/")');
      router.replace("/");
    } else {
      authDebug("AuthGuard → suppressed by redirectedRef", {
        fromRenderId: renderId,
        path: pathname,
      });
    }
    // NOTE: `renderId` is deliberately NOT a dependency. It changes every
    // render, so including it would make this effect run on every render and
    // change the behaviour under investigation. Capturing it from the closure
    // is the whole point — it identifies WHICH render this run belongs to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
