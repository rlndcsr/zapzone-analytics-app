import { apiRequest } from "../lib/api";

// The dashboard metrics endpoint is the heaviest call in the app (full aggregation across bookings/purchases/events)
const METRICS_TIMEOUT_MS = 30000;

/** Timeframe enum the backend expects (exact strings — do not abbreviate). */
export type TimeframeType =
  | "today"
  | "last_24h"
  | "last_7d"
  | "last_30d"
  | "all_time"
  | "custom";

/** A single row in any of the dashboard breakdown lists. */
export type BreakdownItem = {
  label: string;
  count: number;
  percentage: number;
};

/** Keys of the `breakdowns` object returned by the dashboard endpoint. */
export type BreakdownKey =
  | "packageBreakdown"
  | "participantBreakdown"
  | "attractionBreakdown"
  | "eventBreakdown"
  | "membershipBreakdown"
  | "customerBreakdown"
  | "confirmedBreakdown";

export type DashboardBreakdowns = Record<BreakdownKey, BreakdownItem[]>;

export type DashboardTimeframe = {
  type: string;
  date_from: string | null;
  date_to: string | null;
  description: string;
};

/** Scalar totals. Named fields document the API; the index signature keeps it open. */
export type DashboardTotals = {
  totalBookings: number;
  totalRevenue: number;
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  confirmedBookings: number;
  pendingBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  checkedInBookings: number;
  totalParticipants: number;
  totalPurchases: number;
  totalEventPurchases: number;
  totalEventTickets: number;
  totalMemberships: number;
  activeMemberships: number;
  newMemberships: number;
  [key: string]: number;
};

/** Per-location rollup inside `locationStats` (company_admin responses only). */
export type LocationStat = {
  name: string;
  bookings: number;
  purchases: number;
  eventPurchases: number;
  eventTickets: number;
  revenue: number;
  participants: number;
  utilization: number;
  bookingRevenue: number;
  purchaseRevenue: number;
  eventPurchaseRevenue: number;
  [key: string]: unknown;
};

/** A recent attraction-ticket purchase row (metrics `recentPurchases`). */
export type RecentPurchase = {
  id: number;
  customer_name: string | null;
  attraction_name: string | null;
  location_name: string | null;
  quantity: number;
  total_amount: number | string;
  status: string;
  payment_method: string | null;
  purchase_date: string | null;
  created_at: string | null;
};

/** A recent event purchase row (metrics `recentEventPurchases`). */
export type RecentEventPurchase = {
  id: number;
  customer_name: string | null;
  event_name: string | null;
  quantity: number;
  total_amount: number | string;
  amount_paid: number | string;
  status: string;
  purchase_date: string | null;
  created_at: string | null;
};

/** Full payload of GET /api/metrics/dashboard/{userId}. */
export type DashboardData = {
  timeframe: DashboardTimeframe;
  metrics: DashboardTotals;
  breakdowns?: DashboardBreakdowns;
  locationStats?: Record<string, LocationStat>;
  /** Recent attraction-ticket purchases (drives the manager Activity screen). */
  recentPurchases?: RecentPurchase[];
  /** Recent event purchases (drives the manager Activity screen). */
  recentEventPurchases?: RecentEventPurchase[];
};

export type DashboardMetricsParams = {
  userId: number;
  token: string;
  timeframe: TimeframeType;
  locationId?: number;
  dateFrom?: string;
  dateTo?: string;
  timezone?: string;
};

/** Device IANA timezone with a Michigan default if Intl is unavailable. */
function getDeviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {}
  return "America/Detroit";
}

// GET /api/metrics/dashboard/{userId} — one call powers every dashboard card.
export async function fetchDashboardMetrics({
  userId,
  token,
  timeframe,
  locationId,
  dateFrom,
  dateTo,
  timezone,
}: DashboardMetricsParams): Promise<DashboardData> {
  const params = new URLSearchParams();
  params.append("timeframe", timeframe);

  if (timeframe === "custom" && dateFrom && dateTo) {
    params.append("date_from", dateFrom);
    params.append("date_to", dateTo);
  }

  if (locationId != null) {
    params.append("location_id", String(locationId));
  }

  if (timeframe === "today") {
    params.append("timezone", timezone ?? getDeviceTimeZone());
  }

  return apiRequest<DashboardData>(
    `/api/metrics/dashboard/${userId}?${params.toString()}`,
    { token, timeoutMs: METRICS_TIMEOUT_MS },
  );
}

export type AttendantMetricsParams = {
  token: string;
  timeframe: TimeframeType;
  /** The attendant's assigned location; omitted when unknown. */
  locationId?: number;
  dateFrom?: string;
  dateTo?: string;
};

export async function fetchAttendantMetrics({
  token,
  timeframe,
  locationId,
  dateFrom,
  dateTo,
}: AttendantMetricsParams): Promise<DashboardData> {
  const params = new URLSearchParams();
  params.append("timeframe", timeframe);

  if (locationId != null) {
    params.append("location_id", String(locationId));
  }

  if (timeframe === "custom" && dateFrom && dateTo) {
    params.append("date_from", dateFrom);
    params.append("date_to", dateTo);
  }

  return apiRequest<DashboardData>(
    `/api/metrics/attendant?${params.toString()}`,
    { token, timeoutMs: METRICS_TIMEOUT_MS },
  );
}
