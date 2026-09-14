import { usePathname } from "expo-router";
import { useEffect } from "react";

import { AppUpdateDialog } from "./ui/AppUpdateDialog";
import { AppUpdateNotice } from "./ui/AppUpdateNotice";
import {
  deferUpdatePrompt,
  reopenUpdatePrompt,
  useUpdatePromptDeferred,
} from "../lib/appUpdatePrompt";
import { useApkInstall } from "../lib/hooks/useApkInstall";
import { useAppUpdateCheck } from "../lib/hooks/useAppUpdateCheck";
import { useAppUpdateNoticeVisible } from "../lib/hooks/useAppUpdateNotice";
import { isTabRoute } from "../lib/navigation/navConfig";
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
 *  • The reminder notice — from the moment an optional update is deferred with
 *    "Later" until it is installed. Because this component is mounted in the
 *    root shell and never unmounts, that notice rides above every screen in
 *    the app, which is the intent: declining the dialog should move the
 *    reminder aside, not end it. Tapping Update on it brings this same dialog
 *    back, which is why the deferral lives in a shared store
 *    (lib/appUpdatePrompt.ts) rather than in local state: Settings drives it
 *    from another tree too.
 *
 * The update itself is downloaded and installed in-app (services/
 * appUpdateInstaller.ts). Nothing here ever opens a browser.
 */
export function AppUpdateGate() {
  const status = useAppUpdateCheck();
  const pathname = usePathname();
  const deferred = useUpdatePromptDeferred();
  const noticeVisible = useAppUpdateNoticeVisible();
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
    // Nothing to act on: don't nag with a prompt whose button can't do anything.
    if (!status.apkUrl) return null;

    if (deferred && !install.busy) {
      // Deferred, so the dialog steps aside — but the update is still pending,
      // so the notice takes its place and stays there. Unlike the dialog it is
      // shown on the public routes too: it is a slim, non-blocking bar rather
      // than a modal over the login form, and a signed-out user staring at an
      // out-of-date build is exactly who the reminder is for.
      if (!noticeVisible) return null;
      return (
        <AppUpdateNotice
          status={status}
          overTabBar={isTabRoute(pathname)}
          onUpdate={reopenUpdatePrompt}
        />
      );
    }

    // `install.busy` keeps an in-flight download on screen: without it, walking
    // onto a public route would unmount the dialog and orphan the transfer it
    // owns. The dialog itself still stays off the login form.
    if (isPublicRoute(pathname) && !install.busy) return null;
  }

  return (
    <AppUpdateDialog
      visible
      status={status}
      install={install}
      onUpdate={startUpdate}
      onLater={deferUpdatePrompt}
    />
  );
}
