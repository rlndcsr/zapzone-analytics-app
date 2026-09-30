import { useCallback, useEffect, useRef, useState } from "react";
import { fullBookingList } from "../bookings/bookingListCache";
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
  dashboardNeedsAvgBooking,
  dashboardNeedsBookings,
  type DerivedMetrics,
  getDashboardConfig,
  newBookingBreakdowns,
  withDerivedMetrics,
} from "../dashboard/dashboardConfig";
import { filterNewBookings } from "../dashboard/dashboardTimeframe";
import { getCurrentUser, getToken } from "../session";

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

  // Visible loads (first paint, timeframe change, pull-to-refresh) in flight —
  // counted, since a superseded one can still be finishing.
  // A silent refresh never starts over one: it would become the current request
  // and the visible load would then never clear its own skeleton.
  const visibleLoadsRef = useRef(0);
  const silentLoadRef = useRef(false);

  /**
   * `force` skips the device cache (pull-to-refresh). `silent` is a background
   * refresh for live data: straight to the network, no skeleton, and whatever
   * is on screen stays if it fails.
   */
  const loadMetrics = useCallback(
    async ({
      force = false,
      silent = false,
    }: { force?: boolean; silent?: boolean } = {}) => {
      if (silent && (visibleLoadsRef.current > 0 || silentLoadRef.current))
        return;
      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestId === requestIdRef.current;
      if (silent) silentLoadRef.current = true;
      else visibleLoadsRef.current += 1;

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

        if (!silent) setLoading(true);

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
        if (!force && !silent) {
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

        const derived: DerivedMetrics = {};

        if (dashboardNeedsAvgBooking(config)) {
          derived.avgBooking = computeAvgBooking(result.metrics);
        }

        if (dashboardNeedsBookings(config)) {
          try {
            // Every booking, not the newest page — a busy week outgrew one page of 100.
            const bookings = await fullBookingList({
              token,
              locationId: user.location_id ?? undefined,
              force,
            });
            const created = filterNewBookings(
              bookings,
              timeframe,
              dateFrom,
              dateTo,
            );
            derived.newBookings = created.length;
            derived.newBookingBreakdowns = newBookingBreakdowns(created);
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
        if (silent) silentLoadRef.current = false;
        else visibleLoadsRef.current -= 1;
        if (isCurrent() && !silent) setLoading(false);
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
  const refetch = useCallback(
    () => loadMetrics({ force: true }),
    [loadMetrics],
  );

  // Live refresh: the backend drops its dashboard cache whenever a purchase or
  // booking is written, so this returns the newest rows (Recent Purchases) and
  // costs a cache hit when nothing changed. The bookings list keeps its own
  // five-minute cache rather than being re-pulled on every tick.
  const refreshSilently = useCallback(
    () => loadMetrics({ silent: true }),
    [loadMetrics],
  );

  return { data, loading, error, refetch, refreshSilently };
}
