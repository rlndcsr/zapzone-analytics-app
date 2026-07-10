import { apiRequest } from "../lib/api";

/** A customer match from the search-as-you-type lookup. */
export type CustomerHit = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

type RawCustomer = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type SearchResponse = { success?: boolean; data?: RawCustomer[] } | RawCustomer[];

/** GET /api/customers/search?q= — used to link an existing customer. */
export async function searchCustomers(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<CustomerHit[]> {
  const res = await apiRequest<SearchResponse>(
    `/api/customers/search?q=${encodeURIComponent(query)}`,
    { token, signal },
  );
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list
    .filter((c): c is RawCustomer => !!c && typeof c.id === "number")
    .map((c) => ({
      id: c.id,
      firstName: c.first_name?.trim() || "",
      lastName: c.last_name?.trim() || "",
      email: c.email?.trim() || "",
      phone: c.phone?.trim() || null,
    }));
}

/* ================================================================== */
/* Customer Analytics (GET /api/customers/analytics)                   */
/* ================================================================== */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;

/** The date-range presets the endpoint accepts (mirrors the web). */
export type CustomerDateRange = "7d" | "30d" | "90d" | "1y" | "custom";

/** A KPI card — value/change arrive already formatted from the backend. */
export type CustomerKpi = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
};

export type MonthPoint = { month: string; customers: number; growth: number };
export type RevenueTrendPoint = { month: string; revenue: number; bookings: number };
export type LabelCount = { label: string; count: number };
export type NameValue = { name: string; value: number };
export type StatusSlice = { status: string; count: number };
export type SegmentSlice = { segment: string; value: number };
export type RepeatPoint = { month: string; repeatRate: number };

export type TopCustomerRow = { customer: string; item: string; count: number };
export type RecentCustomer = {
  id: string;
  name: string;
  email: string;
  joinDate: string | null;
  totalSpent: number;
  bookings: number;
  lastActivity: string | null;
  status: string;
};

/** The fully mapped analytics payload backing the Customers Analytics screen. */
export type CustomerAnalytics = {
  kpis: CustomerKpi[];
  customerGrowth: MonthPoint[];
  revenueTrend: RevenueTrendPoint[];
  bookingTimeDistribution: LabelCount[];
  bookingsPerCustomer: NameValue[];
  statusDistribution: StatusSlice[];
  activityHours: LabelCount[];
  lifetimeValue: SegmentSlice[];
  repeatCustomers: RepeatPoint[];
  topActivities: TopCustomerRow[];
  topPackages: TopCustomerRow[];
  topEvents: TopCustomerRow[];
  recentCustomers: RecentCustomer[];
};

type RawRow = Record<string, unknown>;
const rows = (v: unknown): RawRow[] => (Array.isArray(v) ? (v as RawRow[]) : []);

type FetchCustomerAnalyticsParams = {
  token: string;
  userId?: number;
  dateRange: CustomerDateRange;
  startDate?: string;
  endDate?: string;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/customers/analytics — the same endpoint the web `/customers/analytics`
 * page uses. Metrics, trends, growth %, segments and "vs previous period" changes
 * are all computed server-side (response is small pre-aggregated arrays, no heavy
 * data), and the backend scopes by role: company admins may pass `location_id`;
 * location managers/attendants are restricted to their own location automatically.
 */
export async function fetchCustomerAnalytics({
  token,
  userId,
  dateRange,
  startDate,
  endDate,
  locationId,
  signal,
}: FetchCustomerAnalyticsParams): Promise<CustomerAnalytics> {
  const params = new URLSearchParams({ date_range: dateRange });
  if (userId != null) params.append("user_id", String(userId));
  if (dateRange === "custom" && startDate && endDate) {
    params.append("start_date", startDate);
    params.append("end_date", endDate);
  }
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<{ data?: RawRow }>(
    `/api/customers/analytics?${params.toString()}`,
    { token, signal },
  );
  const d = (res.data ?? {}) as RawRow;
  const a = (d.analyticsData ?? {}) as RawRow;

  const topRows = (v: unknown, itemKey: string, countKey: string): TopCustomerRow[] =>
    rows(v).map((r) => ({
      customer: str(r.customer, "—"),
      item: str(r[itemKey], "—"),
      count: num(r[countKey]),
    }));

  return {
    kpis: rows(d.keyMetrics).map((m) => ({
      label: str(m.label, "—"),
      value: str(m.value, "0"),
      change: str(m.change),
      trend: m.trend === "down" ? "down" : "up",
    })),
    customerGrowth: rows(a.customerGrowth).map((r) => ({
      month: str(r.month),
      customers: num(r.customers),
      growth: num(r.growth),
    })),
    revenueTrend: rows(a.revenueTrend).map((r) => ({
      month: str(r.month),
      revenue: num(r.revenue),
      bookings: num(r.bookings),
    })),
    bookingTimeDistribution: rows(a.bookingTimeDistribution).map((r) => ({
      label: str(r.time),
      count: num(r.count),
    })),
    bookingsPerCustomer: rows(a.bookingsPerCustomer).map((r) => ({
      name: str(r.name, "—"),
      value: num(r.bookings),
    })),
    statusDistribution: rows(a.statusDistribution).map((r) => ({
      status: str(r.status, "—"),
      count: num(r.count),
    })),
    activityHours: rows(a.activityHours).map((r) => ({
      label: str(r.hour),
      count: num(r.activity),
    })),
    lifetimeValue: rows(a.customerLifetimeValue).map((r) => ({
      segment: str(r.segment, "—"),
      value: num(r.value),
    })),
    repeatCustomers: rows(a.repeatCustomers).map((r) => ({
      month: str(r.month),
      repeatRate: num(r.repeatRate),
    })),
    topActivities: topRows(d.topActivities, "activity", "purchases"),
    topPackages: topRows(d.topPackages, "package", "bookings"),
    topEvents: topRows(d.topEvents, "event", "purchases"),
    recentCustomers: rows(d.recentCustomers).map((r) => ({
      id: String(r.id ?? ""),
      name: str(r.name, "—"),
      email: str(r.email),
      joinDate: (r.joinDate as string) ?? null,
      totalSpent: num(r.totalSpent),
      bookings: num(r.bookings),
      lastActivity: (r.lastActivity as string) ?? null,
      status: str(r.status, "—"),
    })),
  };
}
