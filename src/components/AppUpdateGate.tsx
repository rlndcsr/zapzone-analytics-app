import { usePathname } from "expo-router";
import { useState } from "react";
import { Alert, Linking } from "react-native";

import { AppUpdateDialog } from "./ui/AppUpdateDialog";
import { useAppUpdateCheck } from "../lib/hooks/useAppUpdateCheck";
import { isPublicRoute } from "../lib/navigation/publicRoutes";

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
 */
export function AppUpdateGate() {
  const status = useAppUpdateCheck();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  const openDownload = async () => {
    const url = status?.apkUrl;
    if (!url) return;
    try {
      await Linking.openURL(url);
      // An optional prompt has done its job once the download is handed off —
      // don't greet the user with it again when they come back to the app.
      if (!status?.requiresUpdate) setDismissed(true);
    } catch (error) {
      console.warn("[app-update] could not open the download link:", error);
      Alert.alert(
        "Couldn't open the download link",
        "Please try again, or download the latest version from your administrator.",
      );
    }
  };

  if (!status) return null;

  if (status.requiresUpdate) {
    // Never over the splash animation — it hands off to a real screen in ~1.5s.
    if (pathname.startsWith("/splash")) return null;
  } else {
    if (dismissed) return null;
    if (isPublicRoute(pathname)) return null;
    // Nothing to act on: don't nag with a prompt whose button can't do anything.
    if (!status.apkUrl) return null;
  }

  return (
    <AppUpdateDialog
      visible
      status={status}
      onUpdate={openDownload}
      onLater={() => setDismissed(true)}
    />
  );
}
