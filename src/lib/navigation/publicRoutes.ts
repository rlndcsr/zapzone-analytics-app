// The unauthenticated / system routes, in one place. Both the auth redirect
// (components/AuthGuard.tsx) and the app-wide Quick Navigation FAB
// (components/navigation/QuickNavFab.tsx) read this, so "where a signed-out
// user may be" is defined once instead of drifting between them.
//
// Add Register / Forgot Password here when those screens land — that is the
// only change needed to keep the FAB off them.

/** Login lives at the root route; the splash screen plays before it. */
export function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/splash");
}
