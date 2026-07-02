import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDashboardBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import {
  fetchAttendantMetrics,
  fetchDashboardMetrics,
  type DashboardData,
  type TimeframeType,
} from "../../services/metricsService";
import {
  computeAvgBooking,
  countNewBookings,
  dashboardNeedsAvgBooking,
  dashboardNeedsBookings,
  getDashboardConfig,
  getNewBookingsCutoff,
  withDerivedMetrics,
} from "../dashboard/dashboardConfig";
import { getCurrentUser, getToken } from "../session";

type BookingsCache = {
  key: string;
  fetchedAt: number;
  data: CalendarBooking[];
};
let bookingsCache: BookingsCache | null = null;
const BOOKINGS_TTL_MS = 5 * 60 * 1000;

async function loadLocationBookings(
  token: string,
  locationId: number | undefined,
  force: boolean,
): Promise<CalendarBooking[]> {
  const key = String(locationId ?? "all");
  const fresh =
    !!bookingsCache &&
    bookingsCache.key === key &&
    Date.now() - bookingsCache.fetchedAt < BOOKINGS_TTL_MS;
  if (fresh && !force) return bookingsCache!.data;

  const data = await fetchDashboardBookings({ token, locationId });
  bookingsCache = { key, fetchedAt: Date.now(), data };
  return data;
}

type UseDashboardMetricsParams = {
  timeframe: TimeframeType;
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

  const requestIdRef = useRef(0);

  const loadMetrics = useCallback(
    async (force = false) => {
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

        const config = getDashboardConfig(user.role);

        let result: DashboardData;
        if (config.metricsSource === "attendant") {
          result = await fetchAttendantMetrics({
            token,
            timeframe,
            locationId: user.location_id ?? undefined,
            dateFrom,
            dateTo,
          });
        } else {
          const effectiveLocation =
            config.showLocationSelector && locationId !== "all"
              ? locationId
              : undefined;
          result = await fetchDashboardMetrics({
            userId: user.id,
            token,
            timeframe,
            locationId: effectiveLocation,
            dateFrom,
            dateTo,
          });
        }

        const derived: { newBookings?: number; avgBooking?: number } = {};

        if (dashboardNeedsAvgBooking(config)) {
          derived.avgBooking = computeAvgBooking(result.metrics);
        }

        if (dashboardNeedsBookings(config)) {
          try {
            const bookings = await loadLocationBookings(
              token,
              user.location_id ?? undefined,
              force,
            );
            const cutoff = getNewBookingsCutoff(timeframe, dateFrom);
            derived.newBookings = countNewBookings(bookings, cutoff);
          } catch (bookingsErr) {
            console.warn("New bookings derivation failed:", bookingsErr);
          }
        }

        result = withDerivedMetrics(result, derived);

        if (isCurrent()) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        console.error("Metrics error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load metrics",
          );
          setData(null);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [timeframe, locationId, dateFrom, dateTo],
  );

  useEffect(() => {
    loadMetrics();
    return () => {
      requestIdRef.current++;
    };
  }, [loadMetrics]);

  // Pull-to-refresh forces a fresh bookings fetch alongside the metrics reload.
  const refetch = useCallback(() => loadMetrics(true), [loadMetrics]);

  return { data, loading, error, refetch };
}
