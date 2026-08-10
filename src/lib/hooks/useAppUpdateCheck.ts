import { useEffect, useState } from "react";

import {
  checkForAppUpdate,
  type AppUpdateStatus,
} from "../../services/appUpdateService";

/**
 * The launch version check's raw verdict — up to date included.
 *
 * Returns `null` until the check resolves and when it couldn't complete
 * (offline, unsupported platform, server error), so a consumer that only wants
 * to *display* what the backend published still never has to handle a failure
 * state. Use {@link useAppUpdateCheck} instead to render an update prompt.
 *
 * The request itself is deduped inside the service, so mounting either hook
 * more than once (or a dev double-effect) still results in a single call.
 */
export function useAppUpdateStatus(): AppUpdateStatus | null {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);

  useEffect(() => {
    let active = true;

    checkForAppUpdate()
      .then((result) => {
        if (!active || !result) return;
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

/**
 * The same check, narrowed to "there is something to update to" — it stays
 * `null` while the app is current, so an update prompt can be rendered with a
 * plain truthiness test.
 */
export function useAppUpdateCheck(): AppUpdateStatus | null {
  const status = useAppUpdateStatus();
  return status?.hasUpdate ? status : null;
}
