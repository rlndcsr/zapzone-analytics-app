import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDashboardBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import {
  fetchDashboardMetrics,
  type RecentEventPurchase,
  type RecentPurchase,
  type TimeframeType,
} from "../../services/metricsService";
import { filterNewBookings, getNewBookingsCutoff } from "../dashboard/dashboardConfig";
import { getCurrentUser, getToken } from "../session";

// The web New Bookings table caps at 10 rows (`newBookings.slice(0, 10)`).
const NEW_BOOKINGS_LIMIT = 10;

type ManagerActivityParams = {
  timeframe: TimeframeType;
  dateFrom?: string;
  dateTo?: string;
};

type ManagerActivity = {
  /** First {@link NEW_BOOKINGS_LIMIT} new bookings (the displayed rows). */
  newBookings: CalendarBooking[];
  /** Full new-bookings count for the badge (web shows the total, not the 10). */
  newBookingsCount: number;
  recentPurchases: RecentPurchase[];
  recentEventPurchases: RecentEventPurchase[];
  /** Backend timeframe label (e.g. "All Time") for the section headers. */
  timeframeLabel: string;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * Powers the Location Manager's Activity screen, reproducing the three
 * operational lists on the web ManagerDashboard:
 *  - New Bookings          — the location's bookings created within the
 *                            timeframe (same source + cutoff as the KPI count).
 *  - Recent Ticket Purchases — `recentPurchases` from the metrics endpoint.
 *  - Recent Event Purchases  — `recentEventPurchases` from the metrics endpoint.
 *
 * One metrics call + one bookings call, run in parallel, sharing a single
 * loading/error cycle so the screen loads and refreshes as a unit.
 */
export function useManagerActivity({
  timeframe,
  dateFrom = "",
  dateTo = "",
}: ManagerActivityParams): ManagerActivity {
  const [newBookings, setNewBookings] = useState<CalendarBooking[]>([]);
  const [newBookingsCount, setNewBookingsCount] = useState(0);
  const [recentPurchases, setRecentPurchases] = useState<RecentPurchase[]>([]);
  const [recentEventPurchases, setRecentEventPurchases] = useState<
    RecentEventPurchase[]
  >([]);
  const [timeframeLabel, setTimeframeLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only the latest load may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    try {
      const token = getToken();
      const user = getCurrentUser();
      if (!token || !user?.id) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      // Metrics (recent lists, backend-scoped to the manager by user id) and the
      // bookings list (for New Bookings rows) in parallel.
      const [metrics, bookings] = await Promise.all([
        fetchDashboardMetrics({ userId: user.id, token, timeframe, dateFrom, dateTo }),
        fetchDashboardBookings({
          token,
          locationId: user.location_id ?? undefined,
        }),
      ]);

      const cutoff = getNewBookingsCutoff(timeframe, dateFrom);
      const filtered = filterNewBookings(bookings, cutoff);

      if (isCurrent()) {
        setNewBookings(filtered.slice(0, NEW_BOOKINGS_LIMIT));
        setNewBookingsCount(filtered.length);
        setRecentPurchases(metrics.recentPurchases ?? []);
        setRecentEventPurchases(metrics.recentEventPurchases ?? []);
        setTimeframeLabel(metrics.timeframe?.description ?? "");
        setError(null);
      }
    } catch (err) {
      console.error("Manager activity error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load activity");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [timeframe, dateFrom, dateTo]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current++;
    };
  }, [load]);

  const refetch = useCallback(() => load(), [load]);

  return {
    newBookings,
    newBookingsCount,
    recentPurchases,
    recentEventPurchases,
    timeframeLabel,
    loading,
    error,
    refetch,
  };
}
