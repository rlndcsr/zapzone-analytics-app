import { useEffect, useState } from "react";

import {
  checkForAppUpdate,
  type AppUpdateStatus,
} from "../../services/appUpdateService";

/**
 * Runs the launch version check once and exposes the verdict.
 *
 * Returns `null` until the check resolves, and stays `null` when the app is up
 * to date or the check couldn't complete — so a consumer can render an update
 * prompt with a plain truthiness test and never has to handle a failure state.
 *
 * The request itself is deduped inside the service, so mounting this hook more
 * than once (or a dev double-effect) still results in a single call.
 */
export function useAppUpdateCheck(): AppUpdateStatus | null {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);

  useEffect(() => {
    let active = true;

    checkForAppUpdate()
      .then((result) => {
        if (!active || !result?.hasUpdate) return;
        setStatus(result);
      })
      // The service already swallows its own failures; this is belt-and-braces
      // so an unexpected throw can never surface as an unhandled rejection.
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return status;
}
