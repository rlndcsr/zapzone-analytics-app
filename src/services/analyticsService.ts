import { ApiError, apiRequest, apiUrl } from "../lib/api";

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

/**
 * One `key_metrics` entry. The backend sends either a period-over-period
 * `change` string ("+12.5% vs last period") or a static `info` note, never
 * both — the web colors `change` green/red by its sign and leaves `info` gray.
 */
export type KeyMetric = {
  value: number;
  change: string | null;
  info: string | null;
  trend: "up" | "down" | null;
};

/** The web's `key_metrics` block; the last two are only sent when events exist. */
export type KeyMetrics = {
  totalRevenue: KeyMetric;
  totalLocations: KeyMetric;
  packageBookings: KeyMetric;
  ticketPurchases: KeyMetric;
  totalParticipants: KeyMetric;
  activePackages: KeyMetric;
  eventTicketPurchases: KeyMetric | null;
  activeEvents: KeyMetric | null;
};

/** The backend `waivers` block: KPI summary plus the three chart series. */
export type WaiverAnalytics = {
  summary: WaiverSummary;
  /** Waivers created per bucket; longer ranges are grouped by month. */
  perDay: { label: string; count: number }[];
  ageBrackets: { bracket: string; count: number }[];
  /**
   * The covered minors' ages as of each waiver's date. Empty when no signed
   * waiver in the period listed a minor with a date of birth.
   */
  minorAgeBrackets: { bracket: string; count: number }[];
  bySource: { source: string; count: number }[];
};

/** Backend `waivers.summary`; the whole block is absent when waivers are unused. */
export type WaiverSummary = {
  total: number;
  completed: number;
  pending: number;
  checkedIn: number;
  signedNotCheckedIn: number;
  adultSigners: number;
  minorsCovered: number;
  peopleCovered: number;
  withMinors: number;
  adultsOnly: number;
  marketingOptedIn: number;
  expired: number;
};

export type PerformanceReport = {
  /** Company header — drives the "All N locations" subtitle. */
  company: { id: number | null; name: string; totalLocations: number };
  /** The six-to-eight KPI cards above the charts. */
  keyMetrics: KeyMetrics;
  /** Every location the filter can pick from (backend `available_locations`). */
  availableLocations: { id: number; name: string }[];
  /** Daily/monthly trend: revenue (left axis) + package bookings (right axis). */
  revenueTrend: { label: string; revenue: number; bookings: number }[];
  /** Per-location revenue + package count (bar chart + Top Locations table). */
  locationPerformance: { name: string; locationId: number | null; revenue: number; packages: number }[];
  packageDistribution: { name: string; value: number; count: number }[];
  peakHours: { hour: string; count: number }[];
  dailyPerformance: { day: string; revenue: number; participants: number }[];
  bookingStatus: { status: string; count: number }[];
  topAttractions: { name: string; ticketsSold: number; revenue: number }[];
  /** Only present once the company has event sales. */
  topEvents: { name: string; ticketsSold: number; revenue: number }[];
  /** Null when the response omits the block — the waiver tiles/charts then hide. */
  waivers: WaiverAnalytics | null;
};

/** Read one `key_metrics` entry; absent blocks become null so cards can hide. */
function mapKeyMetric(raw: unknown): KeyMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const change = r.change != null ? String(r.change) : null;
  const trend = r.trend === "up" || r.trend === "down" ? r.trend : null;
  return {
    value: num(r.value),
    change,
    info: r.info != null ? String(r.info) : null,
    // The backend omits `trend` on some metrics; fall back to the sign of the
    // change string, which is how the web decides green vs red.
    trend: trend ?? (change ? (change.includes("+") ? "up" : "down") : null),
  };
}

const EMPTY_METRIC: KeyMetric = {
  value: 0,
  change: null,
  info: null,
  trend: null,
};

export async function fetchCompanyAnalytics({
  token,
  companyId,
  dateRange = "30d",
  locationIds = [],
  startDate,
  endDate,
}: {
  token: string;
  companyId: number;
  dateRange?: string;
  locationIds?: number[];
  /** Only sent for dateRange "custom", matching the web request. */
  startDate?: string;
  endDate?: string;
}): Promise<PerformanceReport> {
  const qs = new URLSearchParams({
    company_id: String(companyId),
    date_range: dateRange,
  });
  locationIds.forEach((id) => qs.append("location_ids[]", String(id)));
  if (dateRange === "custom" && startDate) qs.append("start_date", startDate);
  if (dateRange === "custom" && endDate) qs.append("end_date", endDate);

  const res = await apiRequest<Record<string, unknown>>(
    `/api/analytics/company?${qs.toString()}`,
    { token },
  );
  const rows = (key: string): Record<string, unknown>[] =>
    ((res[key] ?? []) as Record<string, unknown>[]) ?? [];

  const company = (res.company ?? {}) as Record<string, unknown>;
  const km = (res.key_metrics ?? {}) as Record<string, unknown>;

  return {
    company: {
      id: company.id != null ? Number(company.id) : null,
      name: String(company.name ?? ""),
      totalLocations: num(company.total_locations),
    },
    keyMetrics: {
      totalRevenue: mapKeyMetric(km.total_revenue) ?? EMPTY_METRIC,
      totalLocations: mapKeyMetric(km.total_locations) ?? EMPTY_METRIC,
      packageBookings: mapKeyMetric(km.package_bookings) ?? EMPTY_METRIC,
      ticketPurchases: mapKeyMetric(km.ticket_purchases) ?? EMPTY_METRIC,
      totalParticipants: mapKeyMetric(km.total_participants) ?? EMPTY_METRIC,
      activePackages: mapKeyMetric(km.active_packages) ?? EMPTY_METRIC,
      // Optional on the response — the web hides these two cards when absent.
      eventTicketPurchases: mapKeyMetric(km.event_ticket_purchases),
      activeEvents: mapKeyMetric(km.active_events),
    },
    availableLocations: rows("available_locations").map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? "—"),
    })),
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
    topEvents: rows("top_events").map((r) => ({
      name: String(r.name ?? "—"),
      ticketsSold: num(r.tickets_sold),
      revenue: num(r.revenue),
    })),
    waivers: mapWaivers(res.waivers),
  };
}

/* ================================================================== */
/* Performance (location) Analytics                                    */
/* ================================================================== */

/**
 * The web's `/manager/analytics` payload (`GET /api/analytics/location`) — a
 * different report from the company one above: it is scoped to the manager's
 * own location and carries hourly/weekly series the company report has no
 * equivalent for.
 */
export type LocationReport = {
  location: { id: number | null; name: string; fullAddress: string };
  keyMetrics: {
    locationRevenue: KeyMetric;
    packageBookings: KeyMetric;
    ticketSales: KeyMetric;
    totalVisitors: KeyMetric;
    activePackages: KeyMetric;
    activeAttractions: KeyMetric;
    /** Both only sent once the location has events, as on the web. */
    eventTicketSales: KeyMetric | null;
    activeEvents: KeyMetric | null;
  };
  hourlyRevenue: {
    label: string;
    revenue: number;
    bookings: number;
    attractionPurchases: number;
    eventPurchases: number;
  }[];
  dailyRevenue: {
    /** Short axis label ("Mon"); the full "Mon, Jan 5" is `fullLabel`. */
    label: string;
    fullLabel: string;
    revenue: number;
    bookings: number;
    attractionPurchases: number;
    participants: number;
    eventPurchases: number;
  }[];
  weeklyTrend: {
    week: string;
    revenue: number;
    bookings: number;
    tickets: number;
    eventTickets: number;
  }[];
  packagePerformance: {
    name: string;
    bookings: number;
    revenue: number;
    participants: number;
    avgPartySize: number;
  }[];
  attractionPerformance: {
    name: string;
    ticketsSold: number;
    revenue: number;
  }[];
  timeSlotPerformance: {
    label: string;
    totalRevenue: number;
    bookings: number;
    ticketsSold: number;
    totalTransactions: number;
  }[];
  /** Absent/empty hides the Event Performance table, as the web card does. */
  eventPerformance: {
    name: string;
    dateType: string;
    purchases: number;
    ticketsSold: number;
    revenue: number;
    price: number;
  }[];
};

/**
 * A period-over-period metric. The web appends "vs last period" to every
 * `change` string on this page, so do it here rather than in the screen.
 */
function mapChangeMetric(raw: unknown): KeyMetric | null {
  const m = mapKeyMetric(raw);
  if (!m) return null;
  return { ...m, change: m.change ? `${m.change} vs last period` : null };
}

/**
 * An "N of M active" metric (active packages / attractions / events). The web
 * shows that sentence in the change slot and always colors it green.
 */
function mapActiveMetric(raw: unknown): KeyMetric | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const value = num(r.value);
  return {
    value,
    change: `${count(value)} of ${count(num(r.total))} active`,
    info: r.info != null ? String(r.info) : null,
    trend: "up",
  };
}

/** Thousands-separated, matching the screens' own formatting. */
const count = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "Mon, Jan 5" — the web's `displayDate` for the Daily Performance axis. */
function dailyLabel(day: string, date: string): string {
  const [y, m, d] = String(date).split("-").map(Number);
  if (!y || !m || !d) return day;
  const shown = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${day}, ${shown}`;
}

export async function fetchLocationAnalytics({
  token,
  locationId,
  dateRange = "30d",
  startDate,
  endDate,
}: {
  token: string;
  locationId: number;
  dateRange?: string;
  /** Only sent for dateRange "custom", matching the web request. */
  startDate?: string;
  endDate?: string;
}): Promise<LocationReport> {
  const qs = new URLSearchParams({
    location_id: String(locationId),
    date_range: dateRange,
  });
  if (dateRange === "custom" && startDate) qs.append("start_date", startDate);
  if (dateRange === "custom" && endDate) qs.append("end_date", endDate);

  const res = await apiRequest<Record<string, unknown>>(
    `/api/analytics/location?${qs.toString()}`,
    { token },
  );
  const rows = (key: string): Record<string, unknown>[] =>
    ((res[key] ?? []) as Record<string, unknown>[]) ?? [];

  const location = (res.location ?? {}) as Record<string, unknown>;
  const km = (res.key_metrics ?? {}) as Record<string, unknown>;

  return {
    location: {
      id: location.id != null ? Number(location.id) : null,
      name: String(location.name ?? ""),
      fullAddress: String(location.full_address ?? location.address ?? ""),
    },
    keyMetrics: {
      locationRevenue: mapChangeMetric(km.location_revenue) ?? EMPTY_METRIC,
      packageBookings: mapChangeMetric(km.package_bookings) ?? EMPTY_METRIC,
      ticketSales: mapChangeMetric(km.ticket_sales) ?? EMPTY_METRIC,
      totalVisitors: mapChangeMetric(km.total_visitors) ?? EMPTY_METRIC,
      activePackages: mapActiveMetric(km.active_packages) ?? EMPTY_METRIC,
      activeAttractions: mapActiveMetric(km.active_attractions) ?? EMPTY_METRIC,
      eventTicketSales: mapChangeMetric(km.event_ticket_sales),
      activeEvents: mapActiveMetric(km.active_events),
    },
    hourlyRevenue: rows("hourly_revenue").map((r) => ({
      label: String(r.label ?? ""),
      revenue: num(r.revenue),
      bookings: num(r.bookings),
      attractionPurchases: num(r.attraction_purchases),
      eventPurchases: num(r.event_purchases),
    })),
    dailyRevenue: rows("daily_revenue").map((r) => {
      const day = String(r.day ?? "");
      return {
        label: day.slice(0, 3),
        fullLabel: dailyLabel(day, String(r.date ?? "")),
        revenue: num(r.revenue),
        bookings: num(r.bookings),
        attractionPurchases: num(r.attraction_purchases),
        participants: num(r.participants),
        eventPurchases: num(r.event_purchases),
      };
    }),
    weeklyTrend: rows("weekly_trend").map((r) => ({
      week: String(r.week ?? ""),
      revenue: num(r.revenue),
      bookings: num(r.bookings),
      tickets: num(r.tickets),
      eventTickets: num(r.event_tickets),
    })),
    packagePerformance: rows("package_performance").map((r) => ({
      name: String(r.name ?? "—"),
      bookings: num(r.bookings),
      revenue: num(r.revenue),
      participants: num(r.participants),
      avgPartySize: num(r.avg_party_size),
    })),
    attractionPerformance: rows("attraction_performance").map((r) => ({
      name: String(r.name ?? "—"),
      ticketsSold: num(r.tickets_sold),
      revenue: num(r.revenue),
    })),
    timeSlotPerformance: rows("time_slot_performance").map((r) => ({
      label: String(r.label ?? ""),
      totalRevenue: num(r.total_revenue),
      bookings: num(r.bookings),
      ticketsSold: num(r.tickets_sold),
      totalTransactions: num(r.total_transactions),
    })),
    eventPerformance: rows("event_performance").map((r) => ({
      name: String(r.name ?? "—"),
      dateType: String(r.date_type ?? ""),
      purchases: num(r.purchases),
      ticketsSold: num(r.tickets_sold),
      revenue: num(r.revenue),
      price: num(r.price),
    })),
  };
}

/** The web's export modal sections, same ids and order. */
export type LocationExportSection =
  | "metrics"
  | "revenue"
  | "packages"
  | "attractions"
  | "timeslots"
  | "events";

/**
 * POST /api/analytics/location/export — returns the raw file body. Bypasses
 * {@link apiRequest} because a CSV export is not JSON, and the caller writes
 * the text straight to a file to share.
 */
export async function exportLocationAnalytics({
  token,
  locationId,
  dateRange,
  format,
  sections,
  startDate,
  endDate,
}: {
  token: string;
  locationId: number;
  dateRange: string;
  format: "json" | "csv";
  sections: LocationExportSection[];
  startDate?: string;
  endDate?: string;
}): Promise<string> {
  const res = await fetch(apiUrl("/api/analytics/location/export"), {
    method: "POST",
    headers: {
      Accept: format === "csv" ? "text/csv" : "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      location_id: locationId,
      date_range: dateRange,
      format,
      sections,
      ...(dateRange === "custom" && startDate ? { start_date: startDate } : {}),
      ...(dateRange === "custom" && endDate ? { end_date: endDate } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let message = "Failed to export analytics. Please try again.";
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(message, res.status);
  }

  // Pretty-print JSON so the shared file is readable; CSV passes through.
  if (format === "json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

/** Read the `waivers` block; absent → null so the tiles/charts hide (web `waivers &&`). */
function mapWaivers(raw: unknown): WaiverAnalytics | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (!w.summary || typeof w.summary !== "object") return null;
  const s = w.summary as Record<string, unknown>;
  const list = (key: string): Record<string, unknown>[] =>
    ((w[key] ?? []) as Record<string, unknown>[]) ?? [];
  return {
    summary: {
      total: num(s.total),
      completed: num(s.completed),
      pending: num(s.pending),
      checkedIn: num(s.checked_in),
      signedNotCheckedIn: num(s.signed_not_checked_in),
      adultSigners: num(s.adult_signers),
      minorsCovered: num(s.minors_covered),
      peopleCovered: num(s.people_covered),
      withMinors: num(s.with_minors),
      adultsOnly: num(s.adults_only),
      marketingOptedIn: num(s.marketing_opted_in),
      expired: num(s.expired),
    },
    perDay: list("per_day").map((r) => ({
      label: String(r.label ?? r.date ?? ""),
      count: num(r.count),
    })),
    ageBrackets: list("age_brackets").map((r) => ({
      bracket: String(r.bracket ?? "—"),
      count: num(r.count),
    })),
    minorAgeBrackets: list("minor_age_brackets").map((r) => ({
      bracket: String(r.bracket ?? "—"),
      count: num(r.count),
    })),
    bySource: list("by_source").map((r) => ({
      source: String(r.source ?? "—"),
      count: num(r.count),
    })),
  };
}
