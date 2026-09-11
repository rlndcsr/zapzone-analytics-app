import { useEffect, useState } from "react";

import { fetchDashboardSettings } from "../../services/dashboardSettingsService";
import { getToken } from "../session";

export function useHiddenQuickActions(): string[] {
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetchDashboardSettings(token, controller.signal)
      .then((settings) => {
        if (!controller.signal.aborted) setHidden(settings.hiddenQuickActions);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return hidden;
}
