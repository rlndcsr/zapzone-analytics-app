import { apiRequest } from "../lib/api";

export type DashboardSettings = { hiddenQuickActions: string[] };

export async function fetchDashboardSettings(
  token: string,
  signal?: AbortSignal,
): Promise<DashboardSettings> {
  const res = await apiRequest<{ data?: { hidden_quick_actions?: string[] } }>(
    "/api/dashboard-settings",
    { token, signal },
  );
  return {
    hiddenQuickActions: Array.isArray(res?.data?.hidden_quick_actions)
      ? res.data.hidden_quick_actions
      : [],
  };
}
