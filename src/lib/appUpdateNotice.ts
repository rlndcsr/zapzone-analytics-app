/**
 * Just enough of the launch version check for the notice to decide by. Kept
 * structural rather than importing `AppUpdateStatus` so this module stays free
 * of native imports and can be unit tested.
 */
export type UpdateNoticeStatus = {
  /** The installed build is behind the published one. */
  hasUpdate: boolean;
  /** The installed build is unsupported — blocked, not reminded. */
  requiresUpdate: boolean;
  /** `null` when the backend has published no download. */
  apkUrl: string | null;
};

/**
 * Should the standing update notice be on screen?
 *
 * Pulled out of the hook so the rule is one testable expression rather than
 * something only observable by driving the whole app. Two callers depend on
 * the same answer — the gate, which renders the notice, and every screen with
 * a bottom action bar, which reserves room for it — and the failure mode of
 * those two disagreeing is a Save button nobody can reach.
 *
 * The first clause is the one that ends the reminder: once the update is
 * installed the app relaunches as the new build, the launch check reports
 * `hasUpdate: false`, and the notice cannot be shown again no matter what the
 * user tapped beforehand. Nothing has to remember to clear the deferral — an
 * up-to-date build simply has no pending update to remind anyone about.
 */
export function shouldShowUpdateNotice({
  status,
  deferred,
  pathname,
}: {
  /** `null` while the check is still in flight, or when it couldn't complete. */
  status: UpdateNoticeStatus | null;
  /** The user has declined the dialog with "Later". */
  deferred: boolean;
  pathname: string;
}): boolean {
  // Unknown, or already current: nothing pending, so nothing to say.
  if (!status || !status.hasUpdate) return false;
  // A forced update blocks the app outright; the dialog owns that case.
  if (status.requiresUpdate) return false;
  // Don't nag with a bar whose only button can't do anything.
  if (!status.apkUrl) return false;
  // The splash animation hands off to a real screen in ~1.5s; a reminder that
  // flashes up and vanishes is just noise.
  if (pathname.startsWith("/splash")) return false;

  // Shown from the moment the user declines the dialog until they install —
  // on every screen, with no way to close it. That persistence is the point.
  return deferred;
}
