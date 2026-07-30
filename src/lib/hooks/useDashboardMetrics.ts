import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDashboardBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import {
  type DashboardType,
  metricsCacheService,
} from "../../services/metricsCacheService";
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

/** The web has one dashboard component — and one cache namespace — per role. */
function getDashboardType(role?: string | null): DashboardType {
  if (role === "company_admin") return "company";
  if (role === "location_manager") return "manager";
  return "attendant";
}

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
  // Mirrors `data` so the catch block can tell "nothing on screen" from "a
  // cached or last-good response is showing" without re-running the effect.
  const dataRef = useRef<DashboardData | null>(null);
  const applyData = useCallback((next: DashboardData | null) => {
    dataRef.current = next;
    setData(next);
  }, []);

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

        // Cache-then-network, exactly as CompanyDashboard's metrics effect does:
        // paint the cached snapshot and drop the skeleton first, then overwrite
        // with the fresh response. Pull-to-refresh (`force`) skips the read, the
        // way a hard reload bypasses the browser's cached entry.
        const cacheScope = {
          dashboardType: getDashboardType(user.role),
          userId: user.id,
          locationId,
          timeframe,
        };
        if (!force) {
          const cached = await metricsCacheService.getCachedMetrics(cacheScope);
          if (cached && isCurrent()) {
            applyData(cached.data);
            setError(null);
            setLoading(false);
          }
        }

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
          applyData(result);
          setError(null);
        }

        // Write-through after a successful fetch, like the web's cacheMetrics
        // call at the end of its effect.
        await metricsCacheService.cacheMetrics(cacheScope, result);
      } catch (err) {
        console.error("Metrics error:", err);
        if (isCurrent()) {
          // The web only logs a failed fetch and leaves whatever is on screen
          // (its cache seed, or the last good response) in place. Match that, and
          // surface the error only when there is nothing to show.
          if (!dataRef.current) {
            setError(
              err instanceof Error ? err.message : "Failed to load metrics",
            );
            applyData(null);
          }
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [timeframe, locationId, dateFrom, dateTo, applyData],
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
