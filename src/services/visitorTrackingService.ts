import { apiRequest } from "../lib/api";

/**
 * Visitor Tracking — every customer visit as its own session (one visitor, one
 * day, Michigan time). Same `/api/visitor-sessions` endpoints the web admin's
 * Visitor Tracking page reads: the grouped session list, the counter statistics,
 * a server-side export, and one session's timeline.
 */
export type VisitorDeviceType = "desktop" | "mobile" | "tablet";

export type VisitorIdentityFilter = "known" | "anonymous";

export type VisitorActivityFilter =
  | "purchased"
  | "clicked"
  | "multi_page"
  | "reached_checkout";

export type VisitorSessionRow = {
  visitorId: string;
  /** YYYY-MM-DD in Michigan time — the backend groups on this. */
  sessionDate: string;
  /** "Thu, Aug 27, 2026", formatted by the backend. */
  dateLabel: string;
  firstSeenLabel: string;
  lastSeenLabel: string;
  /** Raw last-seen timestamp, used for sorting. */
  lastSeen: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  pageViews: number;
  clicks: number;
  conversions: number;
  durationMs: number;
  entryPage: string;
  entryTitle: string;
  exitPage: string;
  exitTitle: string;
  deviceType: string;
  browser: string;
  reachedCheckout: boolean;
  /** Only the export endpoint fills this in ("9:41 AM Clicked …; …"). */
  actions: string;
};

type RawSession = {
  visitor_id?: string | null;
  session_date?: string | null;
  date_label?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  first_seen_label?: string | null;
  last_seen_label?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  page_views?: number | string | null;
  clicks?: number | string | null;
  conversions?: number | string | null;
  duration_ms?: number | string | null;
  entry_page?: string | null;
  entry_title?: string | null;
  exit_page?: string | null;
  exit_title?: string | null;
  device_type?: string | null;
  browser?: string | null;
  reached_checkout?: boolean | number | null;
  actions?: string | null;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const str = (v: string | null | undefined) => v?.trim() || "";

function mapSession(raw: RawSession): VisitorSessionRow {
  return {
    visitorId: str(raw.visitor_id),
    sessionDate: str(raw.session_date).substring(0, 10),
    dateLabel: str(raw.date_label),
    firstSeenLabel: str(raw.first_seen_label),
    lastSeenLabel: str(raw.last_seen_label),
    lastSeen: str(raw.last_seen),
    guestName: str(raw.guest_name),
    guestPhone: str(raw.guest_phone),
    guestEmail: str(raw.guest_email),
    pageViews: num(raw.page_views),
    clicks: num(raw.clicks),
    conversions: num(raw.conversions),
    durationMs: num(raw.duration_ms),
    entryPage: str(raw.entry_page),
    entryTitle: str(raw.entry_title),
    exitPage: str(raw.exit_page),
    exitTitle: str(raw.exit_title),
    deviceType: str(raw.device_type),
    browser: str(raw.browser),
    reachedCheckout: raw.reached_checkout === true || raw.reached_checkout === 1,
    actions: str(raw.actions),
  };
}

/** A session is "known" once the guest gave a name or number. */
export const isKnownVisitor = (session: VisitorSessionRow): boolean =>
  !!(session.guestName || session.guestPhone);

export type VisitorSessionFilters = {
  locationId?: number;
  identified?: VisitorIdentityFilter;
  deviceType?: VisitorDeviceType;
  activity?: VisitorActivityFilter;
  /** YYYY-MM-DD bounds, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

function filterParams(filters: VisitorSessionFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.locationId != null)
    params.append("location_id", String(filters.locationId));
  if (filters.identified) params.append("identified", filters.identified);
  if (filters.deviceType) params.append("device_type", filters.deviceType);
  if (filters.activity) params.append("activity", filters.activity);
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  if (filters.search?.trim()) params.append("search", filters.search.trim());
  return params;
}

type SessionsResponse = {
  success?: boolean;
  data?: {
    sessions?: RawSession[] | null;
    pagination?: {
      current_page?: number;
      last_page?: number;
      per_page?: number;
      total?: number;
    } | null;
  } | null;
};

export type VisitorSessionPage = {
  rows: VisitorSessionRow[];
  lastPage: number;
  total: number;
};

/** GET /api/visitor-sessions — one page, newest session first. */
export async function fetchVisitorSessions({
  token,
  page = 1,
  perPage = 100,
  signal,
  ...filters
}: VisitorSessionFilters & {
  token: string;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
}): Promise<VisitorSessionPage> {
  const params = filterParams(filters);
  params.append("page", String(page));
  params.append("per_page", String(perPage));

  const res = await apiRequest<SessionsResponse>(
    `/api/visitor-sessions?${params.toString()}`,
    { token, signal },
  );
  const pg = res?.data?.pagination;
  return {
    rows: (res?.data?.sessions ?? []).map(mapSession),
    lastPage: pg?.last_page ?? page,
    total: pg?.total ?? 0,
  };
}

/**
 * Safety cap on the load-everything loop — the same 3000 the web page uses, so
 * both screens filter and count over the same set. The backend caps `per_page`
 * at 100, so this is up to 30 sequential requests; narrowing the time frame is
 * what keeps a load quick, not a smaller cap.
 */
export const MAX_LOADED_SESSIONS = 3000;

export type AllVisitorSessions = {
  rows: VisitorSessionRow[];
  /** Everything the server has for this scope, even if we stopped early. */
  total: number;
  /** True when rows were left behind, so the screen can say so. */
  capped: boolean;
};

/**
 * Page through the list so the screen's timeframe / type / device / activity /
 * search filters run over the whole loaded set, like the web page's do.
 */
export async function fetchAllVisitorSessions({
  token,
  locationId,
  signal,
}: {
  token: string;
  locationId?: number;
  signal?: AbortSignal;
}): Promise<AllVisitorSessions> {
  const rows: VisitorSessionRow[] = [];
  let page = 1;
  let lastPage = 1;
  let total = 0;

  do {
    const res = await fetchVisitorSessions({
      token,
      locationId,
      page,
      perPage: 100,
      signal,
    });
    rows.push(...res.rows);
    lastPage = res.lastPage;
    total = res.total;
    page += 1;
  } while (page <= lastPage && rows.length < MAX_LOADED_SESSIONS);

  return {
    rows: rows.slice(0, MAX_LOADED_SESSIONS),
    total,
    capped: rows.length >= MAX_LOADED_SESSIONS && page <= lastPage,
  };
}

export type VisitorStats = {
  sessionsToday: number;
  sessionsWeek: number;
  identifiedToday: number;
  identifiedTotal: number;
};

type StatsResponse = {
  success?: boolean;
  data?: {
    sessions_today?: number | string | null;
    sessions_week?: number | string | null;
    identified_today?: number | string | null;
    identified_total?: number | string | null;
  } | null;
};

/** GET /api/visitor-sessions/statistics — the four counter tiles. */
export async function fetchVisitorStats(
  token: string,
  locationId?: number,
  signal?: AbortSignal,
): Promise<VisitorStats> {
  const params = new URLSearchParams();
  if (locationId != null) params.append("location_id", String(locationId));
  const query = params.toString();

  const res = await apiRequest<StatsResponse>(
    `/api/visitor-sessions/statistics${query ? `?${query}` : ""}`,
    { token, signal },
  );
  const data = res?.data;
  return {
    sessionsToday: num(data?.sessions_today),
    sessionsWeek: num(data?.sessions_week),
    identifiedToday: num(data?.identified_today),
    identifiedTotal: num(data?.identified_total),
  };
}

export type VisitorExport = {
  rows: VisitorSessionRow[];
  /** True when the server hit its own export ceiling. */
  truncated: boolean;
  maxSessions: number;
};

type ExportResponse = {
  success?: boolean;
  data?: {
    sessions?: RawSession[] | null;
    truncated?: boolean | null;
    max_sessions?: number | string | null;
  } | null;
};

/**
 * GET /api/visitor-sessions/export — the filtered set for a CSV, built
 * server-side (so an export isn't limited to what the screen loaded) with a
 * per-session action summary the list rows don't carry.
 */
export async function exportVisitorSessions(
  token: string,
  filters: VisitorSessionFilters,
): Promise<VisitorExport> {
  const query = filterParams(filters).toString();
  const res = await apiRequest<ExportResponse>(
    `/api/visitor-sessions/export${query ? `?${query}` : ""}`,
    { token },
  );
  return {
    rows: (res?.data?.sessions ?? []).map(mapSession),
    truncated: res?.data?.truncated === true,
    maxSessions: num(res?.data?.max_sessions) || MAX_LOADED_SESSIONS,
  };
}

/** One entry in a session's timeline. */
export type VisitorTimelineEvent = {
  id: number;
  /** "page_view" | "engagement" | "conversion". */
  eventType: string;
  eventName: string;
  label: string;
  pagePath: string;
  pageTitle: string;
  durationMs: number;
  /** How far down the page they got, 0–100; 0 when not measured. */
  scrollDepth: number;
  /** Money on a conversion event, 0 otherwise. */
  conversionValue: number;
  timeLabel: string;
};

export type VisitorSessionDetail = {
  visitorId: string;
  sessionDate: string;
  dateLabel: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  deviceType: string;
  browser: string;
  os: string;
  referrer: string;
  pageViews: number;
  clicks: number;
  conversions: number;
  durationMs: number;
  firstSeenLabel: string;
  lastSeenLabel: string;
  timeline: VisitorTimelineEvent[];
};

type DetailResponse = {
  success?: boolean;
  message?: string;
  data?: {
    visitor_id?: string | null;
    session_date?: string | null;
    date_label?: string | null;
    guest?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
    device?: {
      device_type?: string | null;
      browser?: string | null;
      os?: string | null;
    } | null;
    referrer?: string | null;
    summary?: {
      page_views?: number | string | null;
      clicks?: number | string | null;
      conversions?: number | string | null;
      duration_ms?: number | string | null;
      first_seen_label?: string | null;
      last_seen_label?: string | null;
    } | null;
    timeline?:
      | {
          id?: number | string | null;
          event_type?: string | null;
          event_name?: string | null;
          label?: string | null;
          page_path?: string | null;
          page_title?: string | null;
          duration_ms?: number | string | null;
          scroll_depth?: number | string | null;
          conversion_value?: number | string | null;
          time_label?: string | null;
        }[]
      | null;
  } | null;
};

/**
 * GET /api/visitor-sessions/detail — one visitor's day, event by event. Returns
 * null when the backend has no activity for that session (it answers 404 with a
 * message rather than an empty timeline).
 */
export async function fetchVisitorSessionDetail(
  token: string,
  visitorId: string,
  date: string,
  signal?: AbortSignal,
): Promise<VisitorSessionDetail | null> {
  const params = new URLSearchParams({ visitor_id: visitorId, date });
  const res = await apiRequest<DetailResponse>(
    `/api/visitor-sessions/detail?${params.toString()}`,
    { token, signal },
  );
  const data = res?.data;
  if (!data) return null;

  return {
    visitorId: str(data.visitor_id),
    sessionDate: str(data.session_date),
    dateLabel: str(data.date_label),
    guestName: str(data.guest?.name),
    guestPhone: str(data.guest?.phone),
    guestEmail: str(data.guest?.email),
    deviceType: str(data.device?.device_type),
    browser: str(data.device?.browser),
    os: str(data.device?.os),
    referrer: str(data.referrer),
    pageViews: num(data.summary?.page_views),
    clicks: num(data.summary?.clicks),
    conversions: num(data.summary?.conversions),
    durationMs: num(data.summary?.duration_ms),
    firstSeenLabel: str(data.summary?.first_seen_label),
    lastSeenLabel: str(data.summary?.last_seen_label),
    timeline: (data.timeline ?? []).map((event, i) => ({
      id: Number(event.id ?? i),
      eventType: str(event.event_type),
      eventName: str(event.event_name),
      label: str(event.label),
      pagePath: str(event.page_path),
      pageTitle: str(event.page_title),
      durationMs: num(event.duration_ms),
      scrollDepth: num(event.scroll_depth),
      conversionValue: num(event.conversion_value),
      timeLabel: str(event.time_label),
    })),
  };
}

/** "45s", "3m 20s", "1h 12m" — the web page's duration wording. */
export function formatSessionDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
