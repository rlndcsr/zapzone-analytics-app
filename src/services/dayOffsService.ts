import { apiRequest } from "../lib/api";

/*
 * Day-off (blocked dates) API client — mirrors the web admin's day-off service
 * against the Laravel backend (`App\Http\Controllers\Api\DayOffController`).
 * All endpoints are under `/api` and require a Sanctum bearer token.
 *
 * Scoping: DayOff has a location_id (no company column), so company_admins see
 * every location's day-offs; location_manager/attendant are locked to their own
 * location (server-enforced via applyAuthScope).
 */

/* ---------------------------------------------------------------- domain -- */

export type DayOff = {
  id: number;
  locationId: number | null;
  locationName: string | null;
  /** YYYY-MM-DD (venue-local). */
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  reason: string | null;
  isRecurring: boolean;
  packageIds: number[];
  roomIds: number[];
  attractionIds: number[];
  eventIds: number[];
  /** No package/room scoping → the block covers the entire location. */
  isLocationWide: boolean;
  /** "Entire Location" | "N package(s)" | "N room(s)". */
  scopeLabel: string;
  /** "Full Day" | "Close Early" | "Delayed Opening" | "9:00 AM – 5:00 PM". */
  durationLabel: string;
};

type RawDayOff = {
  id: number;
  location_id?: number | null;
  date?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  reason?: string | null;
  is_recurring?: boolean | null;
  package_ids?: number[] | null;
  room_ids?: number[] | null;
  attraction_ids?: number[] | null;
  event_ids?: number[] | null;
  location?: { id?: number; name?: string | null } | null;
};

type Pagination = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

type DayOffsListResponse = {
  success: boolean;
  data: { day_offs: RawDayOff[]; pagination: Pagination };
};

/* ---------------------------------------------------------------- helpers -- */

/** "14:30:00" | "14:30" → "2:30 PM". */
function prettyTime(t: string | null): string | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function durationLabel(start: string | null, end: string | null): string {
  const s = prettyTime(start);
  const e = prettyTime(end);
  if (!s && !e) return "Full Day";
  if (s && !e) return `Close Early (from ${s})`;
  if (!s && e) return `Delayed Opening (until ${e})`;
  return `${s} – ${e}`;
}

function scopeLabel(packageIds: number[], roomIds: number[]): string {
  if (packageIds.length === 0 && roomIds.length === 0) return "Entire Location";
  const parts: string[] = [];
  if (packageIds.length)
    parts.push(`${packageIds.length} package${packageIds.length === 1 ? "" : "s"}`);
  if (roomIds.length)
    parts.push(`${roomIds.length} room${roomIds.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function mapDayOff(raw: RawDayOff): DayOff {
  const packageIds = raw.package_ids ?? [];
  const roomIds = raw.room_ids ?? [];
  const isLocationWide = packageIds.length === 0 && roomIds.length === 0;
  return {
    id: raw.id,
    locationId: raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || null,
    date: (raw.date ?? "").substring(0, 10),
    timeStart: raw.time_start ?? null,
    timeEnd: raw.time_end ?? null,
    reason: raw.reason?.trim() || null,
    isRecurring: !!raw.is_recurring,
    packageIds,
    roomIds,
    attractionIds: raw.attraction_ids ?? [],
    eventIds: raw.event_ids ?? [],
    isLocationWide,
    scopeLabel: scopeLabel(packageIds, roomIds),
    durationLabel: durationLabel(raw.time_start ?? null, raw.time_end ?? null),
  };
}

/* ------------------------------------------------------------------ list -- */

export type DayOffFilters = {
  search?: string;
  locationId?: number;
  /** Only future (and today's) blocks. */
  upcomingOnly?: boolean;
  /** Only whole-location blocks (no package/room scoping). */
  locationWideOnly?: boolean;
  /** Type filter → `is_recurring` (true = recurring only, false = one-time). */
  isRecurring?: boolean;
  sortBy?: "date" | "created_at" | "updated_at";
  sortOrder?: "asc" | "desc";
};

export type DayOffListResult = {
  dayOffs: DayOff[];
  total: number;
  currentPage: number;
  lastPage: number;
};

function buildParams(
  filters: DayOffFilters,
  page: number,
  perPage: number,
): URLSearchParams {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    sort_by: filters.sortBy ?? "date",
    sort_order: filters.sortOrder ?? "asc",
  });
  if (filters.search?.trim()) params.append("search", filters.search.trim());
  if (filters.locationId != null)
    params.append("location_id", String(filters.locationId));
  if (filters.upcomingOnly) params.append("upcoming_only", "1");
  if (filters.locationWideOnly) params.append("location_wide_only", "1");
  if (filters.isRecurring != null)
    params.append("is_recurring", filters.isRecurring ? "1" : "0");
  return params;
}

/** GET /api/day-offs — one page of blocked dates (server-side filtered + paged). */
export async function fetchDayOffs(
  token: string,
  filters: DayOffFilters,
  page = 1,
  perPage = 15,
  signal?: AbortSignal,
): Promise<DayOffListResult> {
  const params = buildParams(filters, page, perPage);
  const res = await apiRequest<DayOffsListResponse>(
    `/api/day-offs?${params.toString()}`,
    { token, signal },
  );
  const pg = res?.data?.pagination;
  return {
    dayOffs: (res?.data?.day_offs ?? []).map(mapDayOff),
    total: pg?.total ?? 0,
    currentPage: pg?.current_page ?? page,
    lastPage: pg?.last_page ?? page,
  };
}

/**
 * GET /api/day-offs/location/{locationId} — every day-off for a location (not
 * paginated). This is the exact endpoint the web admin's purchase calendar uses
 * (`dayOffService.getDayOffsByLocation`) to decide which visit dates to block.
 */
export async function fetchDayOffsByLocation(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<DayOff[]> {
  const res = await apiRequest<{ success: boolean; data: RawDayOff[] }>(
    `/api/day-offs/location/${locationId}`,
    { token, signal },
  );
  return (res?.data ?? []).map(mapDayOff);
}

/* ---------------------------------------------------------------- writes -- */

export type DayOffPayload = {
  location_id: number;
  /** YYYY-MM-DD. */
  date: string;
  /** HH:mm (24h) or omit for full-day. */
  time_start?: string | null;
  time_end?: string | null;
  reason?: string | null;
  is_recurring?: boolean;
  package_ids?: number[] | null;
  room_ids?: number[] | null;
};

/** POST /api/day-offs — create a blocked date. */
export async function createDayOff(
  token: string,
  payload: DayOffPayload,
): Promise<DayOff> {
  const res = await apiRequest<{ success: boolean; data: RawDayOff }>(
    "/api/day-offs",
    { method: "POST", token, body: payload },
  );
  return mapDayOff(res.data);
}

/** PUT /api/day-offs/{id} — update a blocked date. */
export async function updateDayOff(
  token: string,
  id: number,
  payload: Partial<DayOffPayload>,
): Promise<DayOff> {
  const res = await apiRequest<{ success: boolean; data: RawDayOff }>(
    `/api/day-offs/${id}`,
    { method: "PUT", token, body: payload },
  );
  return mapDayOff(res.data);
}

/** DELETE /api/day-offs/{id} — remove a blocked date. */
export async function deleteDayOff(token: string, id: number): Promise<void> {
  await apiRequest(`/api/day-offs/${id}`, { method: "DELETE", token });
}

/** POST /api/day-offs/bulk-delete — remove several blocked dates at once. */
export async function bulkDeleteDayOffs(
  token: string,
  ids: number[],
): Promise<number> {
  const res = await apiRequest<{ success: boolean; data: { deleted_count: number } }>(
    "/api/day-offs/bulk-delete",
    { method: "POST", token, body: { ids } },
  );
  return res?.data?.deleted_count ?? 0;
}
