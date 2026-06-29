import { useCallback, useEffect, useRef, useState } from "react";
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

  // Monotonic request token. Every load (filter change, mount, or manual
  // refetch) claims a new id; only the latest may write state, so a slow
  // earlier response can never clobber a newer one. Bumped on cleanup too, so
  // an in-flight request is ignored once the effect/component is torn down.
  const requestIdRef = useRef(0);

  const loadMetrics = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    try {
      const token = getToken();
      const user = getCurrentUser();

      if (!token || !user) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      if (!user.id) {
        if (isCurrent()) {
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
      if (isCurrent()) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      console.error("Metrics error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load metrics");
        setData(null);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [timeframe, locationId, dateFrom, dateTo]);

  useEffect(() => {
    loadMetrics();
    // Invalidate the in-flight request so its response can't update state after
    // the deps change or the component unmounts.
    return () => {
      requestIdRef.current++;
    };
  }, [loadMetrics]);

  return { data, loading, error, refetch: loadMetrics };
}
