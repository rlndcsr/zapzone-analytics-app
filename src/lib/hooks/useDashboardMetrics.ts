import { useEffect, useState } from "react";
import {
  fetchDashboardMetrics,
  type DashboardData,
  type TimeframeType,
} from "../../services/metricsService";
import { getCurrentUser, getToken } from "../session";

type UseDashboardMetricsParams = {
  timeframe: TimeframeType;
  /** number id, or "all" for All Locations (sent as no location_id param). */
  locationId?: number | "all";
  dateFrom?: string;
  dateTo?: string;
};

export function useDashboardMetrics({
  timeframe,
  locationId = "all",
  dateFrom = "",
  dateTo = "",
}: UseDashboardMetricsParams) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadMetrics = async () => {
      try {
        const token = getToken();
        const user = getCurrentUser();

        if (!token || !user) {
          if (alive) {
            setError("Not authenticated");
            setLoading(false);
          }
          return;
        }

        if (!user.id) {
          if (alive) {
            setError("User ID is missing");
            setLoading(false);
          }
          return;
        }

        setLoading(true);
        const result = await fetchDashboardMetrics({
          userId: user.id,
          token,
          timeframe,
          locationId: locationId === "all" ? undefined : locationId,
          dateFrom,
          dateTo,
        });
        if (alive) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        console.error("Metrics error:", err);
        if (alive) {
          setError(
            err instanceof Error ? err.message : "Failed to load metrics",
          );
          setData(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadMetrics();

    return () => {
      alive = false;
    };
  }, [timeframe, locationId, dateFrom, dateTo]);

  return { data, loading, error };
}
