import { useRouter } from "expo-router";
import { useState } from "react";

import { signOut } from "../../services/auth";
// TEMP: investigation instrumentation — see docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md
import { authDebug } from "../debug/authDebug";

/**
 * Signing out, for the screens that offer it. One copy so the teardown order —
 * revoke, clear, then back to the login screen — can't drift between them.
 *
 * `loggingOut` stays true through the hand-off: the screen unmounts on the
 * replace, so there is nothing to reset it back for.
 */
export function useLogout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    authDebug("logout START");
    try {
      await signOut();
      authDebug("logout signOut() resolved");
    } catch (error) {
      // TEMP (investigation): a rejection here means clearSession() never ran,
      // so the session survives the "logout". Rethrown — same outcome as before.
      authDebug("logout signOut() REJECTED — session may still be live", {
        error: String(error),
      });
      throw error;
    } finally {
      authDebug('logout router.replace("/")');
      router.replace("/");
    }
  };

  return { loggingOut, logout };
}
