// The unauthenticated / system routes, in one place. Both the auth redirect
// (components/AuthGuard.tsx) and the launch update gate
// (components/AppUpdateGate.tsx) read this, so "where a signed-out user may be"
// is defined once instead of drifting between them.
//
// Add Register / Forgot Password here when those screens land.
//
// The Quick Navigation FAB is deliberately NOT a consumer: it lives inside the
// (tabs) screen, which is never mounted on any of these routes, so it needs no
// route rule at all.

/**
 * Login lives at the root route; the splash screen plays before it.
 *
 * `/switch-account` is listed as a system route rather than an authenticated
 * one: the outgoing session is still live while it commits the swap, so without
 * this the update dialog would draw straight over a full-screen transition that
 * owns the whole viewport.
 */
export function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/splash") ||
    pathname.startsWith("/switch-account")
  );
}
