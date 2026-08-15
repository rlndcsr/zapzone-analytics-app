import { useEffect } from "react";

import {
  isPushEligibleRole,
  resetPushDeviceRegistration,
  syncPushDeviceRegistration,
} from "../lib/notifications/pushDevice";
import {
  useAuthStatus,
  useCurrentUserId,
  useCurrentUserRole,
} from "../lib/session";

export function PushDeviceRegistrar() {
  const authed = useAuthStatus();
  const userId = useCurrentUserId();
  const role = useCurrentUserRole();

  useEffect(() => {
    if (!authed) {
      resetPushDeviceRegistration();
      return;
    }
    if (userId == null || !isPushEligibleRole(role)) return;
    void syncPushDeviceRegistration();
  }, [authed, userId, role]);

  return null;
}
