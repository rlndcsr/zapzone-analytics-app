import { apiRequest } from "../lib/api";

/* ================================================================== */
/* Shared                                                              */
/* ================================================================== */

type RangeParams = { token: string; from?: string; to?: string; locationId?: number };

function rangeQuery({ from, to, locationId }: Omit<RangeParams, "token">): string {
  const qs = new URLSearchParams();
  if (from) qs.append("from", from);
  if (to) qs.append("to", to);
  if (locationId != null) qs.append("location_id", String(locationId));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ================================================================== */
/* Page Analytics                                                      */
/* ================================================================== */

export type PageOverview = {
  pageViews: number;
  uniqueVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  sessions: number;
  conversions: number;
  conversionRate: number;
  conversionValue: number;
  bounceRate: number;
  avgDurationMs: number;
};

export async function fetchPageOverview({ token, from, to, locationId }: RangeParams): Promise<PageOverview> {
  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/page-analytics/overview${rangeQuery({ from, to, locationId })}`,
    { token },
  );
  const d = res.data ?? {};
  return {
    pageViews: num(d.page_views),
    uniqueVisitors: num(d.unique_visitors),
    newVisitors: num(d.new_visitors),
    returningVisitors: num(d.returning_visitors),
    sessions: num(d.sessions),
    conversions: num(d.conversions),
    conversionRate: num(d.conversion_rate),
    conversionValue: num(d.conversion_value),
    bounceRate: num(d.bounce_rate),
    avgDurationMs: num(d.avg_duration_ms),
  };
}

export type PageLive = { activeVisitors: number; activeSessions: number };

export async function fetchPageLive({ token, locationId }: { token: string; locationId?: number }): Promise<PageLive> {
  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/page-analytics/live${rangeQuery({ locationId })}`,
    { token },
  );
  const d = res.data ?? {};
  return { activeVisitors: num(d.active_visitors), activeSessions: num(d.active_sessions) };
}

export type TimeseriesPoint = { bucket: string; views: number; conversions: number; revenue: number };

export async function fetchPageTimeseries({
  token,
  from,
  to,
  locationId,
}: RangeParams): Promise<{ bucket: string; series: TimeseriesPoint[] }> {
  const res = await apiRequest<{ data?: { bucket?: string; series?: Record<string, unknown>[] } }>(
    `/api/page-analytics/timeseries${rangeQuery({ from, to, locationId })}`,
    { token },
  );
  const series = (res.data?.series ?? []).map((r) => ({
    bucket: String(r.bucket ?? ""),
    views: num(r.page_views),
    conversions: num(r.conversions),
    revenue: num(r.revenue),
  }));
  return { bucket: res.data?.bucket ?? "day", series };
}

export type TopPage = { path: string; views: number; conversions: number; revenue: number };

export async function fetchTopPages(p: RangeParams): Promise<TopPage[]> {
  const res = await apiRequest<{ data?: Record<string, unknown>[] }>(
    `/api/page-analytics/top-pages${rangeQuery(p)}`,
    { token: p.token },
  );
  return (res.data ?? []).map((r) => ({
    path: String(r.page_path ?? ""),
    views: num(r.views),
    conversions: num(r.conversions),
    revenue: num(r.revenue),
  }));
}

export type TopEntity = {
  name: string;
  views: number;
  formStarts: number;
  conversions: number;
  rate: number;
};

export async function fetchTopEntities(
  p: RangeParams & { entityType?: string },
): Promise<TopEntity[]> {
  const qs = rangeQuery(p);
  const sep = qs ? "&" : "?";
  const typeParam = p.entityType ? `${sep}entity_type=${p.entityType}` : "";
  const res = await apiRequest<{ data?: Record<string, unknown>[] }>(
    `/api/page-analytics/top-entities${qs}${typeParam}`,
    { token: p.token },
  );
  return (res.data ?? []).map((r) => ({
    name: String(r.name ?? r.entity_name ?? "—"),
    views: num(r.views),
    formStarts: num(r.form_starts),
    conversions: num(r.conversions),
    rate: num(r.rate ?? r.conversion_rate),
  }));
}

export type TrafficSources = {
  direct: { visits: number; conversions: number; revenue: number };
  referrers: { referrer: string; visits: number; conversions: number; revenue: number }[];
};

export async function fetchTrafficSources(p: RangeParams): Promise<TrafficSources> {
  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/page-analytics/sources${rangeQuery(p)}`,
    { token: p.token },
  );
  const d = res.data ?? {};
  const direct = (d.direct ?? {}) as Record<string, unknown>;
  const referrers = (d.referrers ?? []) as Record<string, unknown>[];
  return {
    direct: {
      visits: num(direct.views ?? direct.visits ?? direct.events),
      conversions: num(direct.conversions),
      revenue: num(direct.revenue),
    },
    referrers: referrers.map((r) => ({
      referrer: String(r.referrer ?? ""),
      visits: num(r.views ?? r.visits ?? r.events),
      conversions: num(r.conversions),
      revenue: num(r.revenue),
    })),
  };
}

export type DeviceSlice = { label: string; views: number };

export async function fetchDevices(
  p: RangeParams,
): Promise<{ devices: DeviceSlice[]; browsers: DeviceSlice[]; oses: DeviceSlice[] }> {
  const res = await apiRequest<{ data?: Record<string, Record<string, unknown>[]> }>(
    `/api/page-analytics/devices${rangeQuery(p)}`,
    { token: p.token },
  );
  const d = res.data ?? {};
  const pick = (rows: Record<string, unknown>[] | undefined, key: string): DeviceSlice[] =>
    (rows ?? []).map((r) => ({
      label: String(r[key] ?? r.label ?? "Unknown") || "Unknown",
      views: num(r.views),
    }));
  return {
    devices: pick(d.devices, "device_type"),
    browsers: pick(d.browsers, "browser"),
    oses: pick(d.oses, "os"),
  };
}

export type FunnelStep = { label: string; visitors: number };

export async function fetchFunnel(p: RangeParams): Promise<FunnelStep[]> {
  const res = await apiRequest<{ data?: Record<string, unknown>[] }>(
    `/api/page-analytics/funnel${rangeQuery(p)}`,
    { token: p.token },
  );
  return (res.data ?? []).map((r) => ({
    label: String(r.label ?? ""),
    visitors: num(r.visitors),
  }));
}

export type LandingPage = { path: string; sessions: number; conversions: number; revenue: number };

export async function fetchLandingPages(p: RangeParams): Promise<LandingPage[]> {
  const res = await apiRequest<{ data?: Record<string, unknown>[] }>(
    `/api/page-analytics/landing-pages${rangeQuery(p)}`,
    { token: p.token },
  );
  return (res.data ?? []).map((r) => ({
    path: String(r.page_path ?? ""),
    sessions: num(r.sessions),
    conversions: num(r.conversions),
    revenue: num(r.revenue),
  }));
}

export type ConversionRow = {
  when: string | null;
  event: string;
  entity: string;
  value: number;
  utmSource: string;
  utmCampaign: string;
};

export async function fetchRecentConversions(p: RangeParams): Promise<ConversionRow[]> {
  const res = await apiRequest<{ data?: Record<string, unknown>[] }>(
    `/api/page-analytics/conversions${rangeQuery(p)}`,
    { token: p.token },
  );
  return (res.data ?? []).map((r) => ({
    when: (r.occurred_at ?? r.created_at ?? r.when ?? null) as string | null,
    event: String(r.event_type ?? r.event ?? "—"),
    entity: String(r.entity_name ?? r.entity ?? r.page_path ?? "—"),
    value: num(r.conversion_value ?? r.value),
    utmSource: String(r.utm_source ?? "—") || "—",
    utmCampaign: String(r.utm_campaign ?? "—") || "—",
  }));
}

/* ================================================================== */
/* Accounting Analytics                                                */
/* ================================================================== */

export type AccountingSummary = {
  qtySold: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  fees: number;
  tax: number;
  totalBilled: number;
  collected: number;
  authorizePayment: number;
  gatewayNet: number;
};

export type AccountingCategoryItem = {
  name: string;
  subCategory: string;
  quantity: number;
  grossSales: number;
  netSales: number;
  totalBilled: number;
  grandTotal: number;
};

export type AccountingCategory = {
  name: string;
  informational: boolean;
  itemCount: number;
  total: number;
  items: AccountingCategoryItem[];
};

export type AccountingReport = {
  locationName: string;
  summary: AccountingSummary;
  categories: AccountingCategory[];
};

type RawCatSummary = Record<string, unknown>;

function mapSummary(s: RawCatSummary): AccountingSummary {
  return {
    qtySold: num(s.quantity_sold),
    grossSales: num(s.gross_sales),
    discounts: num(s.discount_amount),
    netSales: num(s.net_sales),
    fees: num(s.fee_amount),
    tax: num(s.tax_amount),
    totalBilled: num(s.total_billed),
    collected: num(s.grand_total),
    authorizePayment: num(s.collected_via_gateway),
    gatewayNet: num(s.collected_via_gateway_net),
  };
}

export async function fetchAccountingReport({
  token,
  locationId,
  startDate,
  endDate,
  viewMode = "booked_on",
}: {
  token: string;
  locationId: number;
  startDate: string;
  endDate?: string;
  viewMode?: "booked_on" | "booked_for";
}): Promise<AccountingReport> {
  const qs = new URLSearchParams({
    location_id: String(locationId),
    start_date: startDate,
    view_mode: viewMode,
  });
  if (endDate) qs.append("end_date", endDate);

  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/accounting-analytics/report?${qs.toString()}`,
    { token },
  );
  const data = res.data ?? {};
  const location = (data.location ?? {}) as Record<string, unknown>;
  const primary = (data.primary ?? {}) as Record<string, unknown>;
  const summary = (primary.summary ?? {}) as RawCatSummary;
  const rawCategories = (primary.categories ?? []) as Record<string, unknown>[];

  const categories: AccountingCategory[] = rawCategories.map((c) => {
    const catSummary = (c.summary ?? {}) as RawCatSummary;
    const items = ((c.items ?? []) as Record<string, unknown>[]).map((it) => ({
      name: String(it.name ?? "—"),
      subCategory: String(it.sub_category ?? "") || "",
      quantity: num(it.quantity_sold),
      grossSales: num(it.gross_sales),
      netSales: num(it.net_sales),
      totalBilled: num(it.total_billed),
      grandTotal: num(it.grand_total),
    }));
    return {
      name: String(c.name ?? "—"),
      informational: !!c.informational || String(c.name ?? "").toLowerCase().includes("add-on"),
      itemCount: items.length,
      total: num(catSummary.gross_sales),
      items,
    };
  });

  return {
    locationName: String(location.name ?? ""),
    summary: mapSummary(summary),
    categories,
  };
}

/* ================================================================== */
/* Performance (company) Analytics                                     */
/* ================================================================== */

export type PerformanceReport = {
  /** Daily/monthly trend: revenue (left axis) + package bookings (right axis). */
  revenueTrend: { label: string; revenue: number; bookings: number }[];
  /** Per-location revenue + package count (bar chart + Top Locations table). */
  locationPerformance: { name: string; locationId: number | null; revenue: number; packages: number }[];
  packageDistribution: { name: string; value: number; count: number }[];
  peakHours: { hour: string; count: number }[];
  dailyPerformance: { day: string; revenue: number; participants: number }[];
  bookingStatus: { status: string; count: number }[];
  topAttractions: { name: string; ticketsSold: number; revenue: number }[];
};

export async function fetchCompanyAnalytics({
  token,
  companyId,
  dateRange = "30d",
  locationIds = [],
}: {
  token: string;
  companyId: number;
  dateRange?: string;
  locationIds?: number[];
}): Promise<PerformanceReport> {
  const qs = new URLSearchParams({
    company_id: String(companyId),
    date_range: dateRange,
  });
  locationIds.forEach((id) => qs.append("location_ids[]", String(id)));

  const res = await apiRequest<Record<string, unknown>>(
    `/api/analytics/company?${qs.toString()}`,
    { token },
  );
  const rows = (key: string): Record<string, unknown>[] =>
    ((res[key] ?? []) as Record<string, unknown>[]) ?? [];

  return {
    revenueTrend: rows("revenue_trend").map((r) => ({
      label: String(r.month ?? r.date ?? r.label ?? ""),
      revenue: num(r.revenue),
      bookings: num(r.bookings),
    })),
    locationPerformance: rows("location_performance").map((r) => ({
      name: String(r.location ?? r.name ?? "—"),
      locationId: (r.location_id as number) ?? null,
      revenue: num(r.revenue),
      packages: num(r.bookings ?? r.packages),
    })),
    packageDistribution: rows("package_distribution").map((r) => ({
      name: String(r.name ?? "—"),
      value: num(r.value),
      count: num(r.count),
    })),
    peakHours: rows("peak_hours").map((r) => ({
      hour: String(r.hour ?? ""),
      count: num(r.bookings) + num(r.event_purchases),
    })),
    dailyPerformance: rows("daily_performance").map((r) => ({
      day: String(r.day ?? r.date ?? ""),
      revenue: num(r.revenue),
      participants: num(r.participants),
    })),
    bookingStatus: rows("booking_status").map((r) => ({
      status: String(r.status ?? "—"),
      count: num(r.count),
    })),
    topAttractions: rows("top_attractions").map((r) => ({
      name: String(r.name ?? "—"),
      ticketsSold: num(r.tickets_sold),
      revenue: num(r.revenue),
    })),
  };
}
