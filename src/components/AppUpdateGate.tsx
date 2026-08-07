import { usePathname } from "expo-router";
import { useEffect, useState } from "react";

import { AppUpdateDialog } from "./ui/AppUpdateDialog";
import { useApkInstall } from "../lib/hooks/useApkInstall";
import { useAppUpdateCheck } from "../lib/hooks/useAppUpdateCheck";
import { isPublicRoute } from "../lib/navigation/publicRoutes";
import { sweepStaleApks } from "../services/appUpdateInstaller";

/**
 * The app's one version-update gate.
 *
 * Mounted once in the root shell (app/_layout.tsx) alongside AuthGuard and the
 * Quick Navigation FAB — which the shell renders only *after* session restore,
 * theme, and the stored workspace location have settled. That placement gives
 * the whole behaviour for free: the check fires exactly once per launch, after
 * the session is restored and before the user does anything, and navigating
 * between screens never re-runs it (this component never unmounts).
 *
 * What it renders:
 *  • Forced update — over every screen except the splash animation, login
 *    included: an unsupported build must not be usable at all.
 *  • Optional update — held back until the user is past the public screens, so
 *    it never lands on top of the login form, and only when there is actually
 *    something to download.
 *
 * The update itself is downloaded and installed in-app (services/
 * appUpdateInstaller.ts). Nothing here ever opens a browser.
 */
export function AppUpdateGate() {
  const status = useAppUpdateCheck();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const install = useApkInstall();

  // Clear APKs left behind by earlier launches. Once per launch, and never for
  // the build we are about to install.
  useEffect(() => {
    void sweepStaleApks(status?.latestVersion ?? null);
  }, [status?.latestVersion]);

  const startUpdate = () => {
    if (!status?.apkUrl) return;
    install.start(status.apkUrl, status.latestVersion ?? "latest");
  };

  if (!status) return null;

  if (status.requiresUpdate) {
    // Never over the splash animation — it hands off to a real screen in ~1.5s.
    if (pathname.startsWith("/splash")) return null;
  } else {
    // `install.busy` keeps an in-flight download on screen: without it, walking
    // onto a public route (or a stale dismiss) would unmount the dialog and
    // orphan the transfer it owns.
    if (dismissed && !install.busy) return null;
    if (isPublicRoute(pathname) && !install.busy) return null;
    // Nothing to act on: don't nag with a prompt whose button can't do anything.
    if (!status.apkUrl) return null;
  }

  return (
    <AppUpdateDialog
      visible
      status={status}
      install={install}
      onUpdate={startUpdate}
      onLater={() => setDismissed(true)}
    />
  );
}
