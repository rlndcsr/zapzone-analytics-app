import { apiRequest } from "../lib/api";
import {
  closureRangeIsValid,
  describeClosure,
  describeOperatingWindow,
} from "../lib/dayOffClosure";

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

/** `full_day`, `operating_window` (open only between opensAt and closesAt), or an older closed-hours block. */
export type BlockType = "full_day" | "operating_window" | "legacy_closure";

/** What a block applies to; `mixed` is an older block covering more than one kind. */
export type BlockScope = "location" | "packages" | "rooms" | "attractions" | "events";

export type DayOff = {
  id: number;
  locationId: number | null;
  locationName: string | null;
  /** YYYY-MM-DD (venue-local). */
  date: string;
  /** Older closed-hours fields; from /day-offs/location these carry each block as closures. */
  timeStart: string | null;
  timeEnd: string | null;
  blockType: BlockType;
  opensAt: string | null;
  closesAt: string | null;
  reason: string | null;
  groupName: string | null;
  isRecurring: boolean;
  packageIds: number[];
  roomIds: number[];
  attractionIds: number[];
  eventIds: number[];
  /** No package/room/attraction/event scoping → the block covers the whole location. */
  isLocationWide: boolean;
  scope: BlockScope | "mixed";
  /** The server's wording when it sends one ("Entire location", "Attraction: Laser Tag"). */
  scopeLabel: string;
  /** The server's wording when it sends one ("Closed all day", "Open only 12:00 PM – 4:00 PM"). */
  durationLabel: string;
  setByName: string | null;
  lastChangedByName: string | null;
};

type RawPerson = { id?: number; name?: string | null; role?: string | null } | null;

type RawDayOff = {
  id: number;
  location_id?: number | null;
  location_name?: string | null;
  date?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  block_type?: BlockType | null;
  opens_at?: string | null;
  closes_at?: string | null;
  reason?: string | null;
  group_name?: string | null;
  is_recurring?: boolean | null;
  package_ids?: number[] | null;
  room_ids?: number[] | null;
  attraction_ids?: number[] | null;
  event_ids?: number[] | null;
  scope?: BlockScope | "mixed" | null;
  scope_label?: string | null;
  window_label?: string | null;
  set_by?: RawPerson;
  last_changed_by?: RawPerson;
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

/** The closure in the web's words; a backwards range is flagged, since it blocks nothing. */
function durationLabel(start: string | null, end: string | null): string {
  const closure = { timeStart: start || null, timeEnd: end || null };
  if (!closure.timeStart && !closure.timeEnd) return "Full Day";
  const label = describeClosure(closure);
  return closureRangeIsValid(closure) ? label : `${label} (invalid range)`;
}

/**
 * Same precedence as the web's `getBlockingScopeBadge`: attractions and events
 * are exclusive scopes, so they win outright; packages/rooms collapse into a
 * combined "N Resources" when both are set.
 */
function scopeLabel(
  packageIds: number[],
  roomIds: number[],
  attractionIds: number[],
  eventIds: number[],
): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (attractionIds.length) return plural(attractionIds.length, "Attraction");
  if (eventIds.length) return plural(eventIds.length, "Event");
  if (!packageIds.length && !roomIds.length) return "Entire Location";
  if (packageIds.length && roomIds.length)
    return plural(packageIds.length + roomIds.length, "Resource");
  if (packageIds.length) return plural(packageIds.length, "Package");
  return plural(roomIds.length, "Space");
}

/** The scope an older block implies when the server does not send one. */
function inferredScope(
  packageIds: number[],
  roomIds: number[],
  attractionIds: number[],
  eventIds: number[],
): BlockScope | "mixed" {
  const kinds = [
    packageIds.length ? "packages" : null,
    roomIds.length ? "rooms" : null,
    attractionIds.length ? "attractions" : null,
    eventIds.length ? "events" : null,
  ].filter(Boolean) as BlockScope[];
  if (kinds.length === 0) return "location";
  return kinds.length === 1 ? kinds[0] : "mixed";
}

function inferredBlockType(raw: RawDayOff): BlockType {
  if (raw.opens_at || raw.closes_at) return "operating_window";
  return raw.time_start || raw.time_end ? "legacy_closure" : "full_day";
}

export function mapDayOff(raw: RawDayOff): DayOff {
  const packageIds = raw.package_ids ?? [];
  const roomIds = raw.room_ids ?? [];
  const attractionIds = raw.attraction_ids ?? [];
  const eventIds = raw.event_ids ?? [];
  const isLocationWide =
    packageIds.length === 0 &&
    roomIds.length === 0 &&
    attractionIds.length === 0 &&
    eventIds.length === 0;
  const opensAt = raw.opens_at ? raw.opens_at.substring(0, 5) : null;
  const closesAt = raw.closes_at ? raw.closes_at.substring(0, 5) : null;
  const blockType = raw.block_type ?? inferredBlockType(raw);
  return {
    id: raw.id,
    locationId: raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || raw.location_name?.trim() || null,
    date: (raw.date ?? "").substring(0, 10),
    timeStart: raw.time_start ?? null,
    timeEnd: raw.time_end ?? null,
    blockType,
    opensAt,
    closesAt,
    reason: raw.reason?.trim() || null,
    groupName: raw.group_name?.trim() || null,
    isRecurring: !!raw.is_recurring,
    packageIds,
    roomIds,
    attractionIds,
    eventIds,
    isLocationWide,
    scope: raw.scope ?? inferredScope(packageIds, roomIds, attractionIds, eventIds),
    scopeLabel:
      raw.scope_label?.trim() || scopeLabel(packageIds, roomIds, attractionIds, eventIds),
    // A set-hours block has no closed-hours fields, so it must never be read as a full-day closure.
    durationLabel:
      raw.window_label?.trim() ||
      (opensAt || closesAt
        ? describeOperatingWindow(opensAt ?? "", closesAt ?? "")
        : durationLabel(raw.time_start ?? null, raw.time_end ?? null)),
    setByName: raw.set_by?.name?.trim() || null,
    lastChangedByName: raw.last_changed_by?.name?.trim() || null,
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

/**
 * A block as the backend now takes it (web BlockPayload): full day, or open only
 * between opens_at and closes_at, for one kind of item, with a group name and
 * reason. The older time_start / time_end are refused on every save.
 */
export type DayOffPayload = {
  location_id: number;
  /** YYYY-MM-DD. */
  date: string;
  block_type: Exclude<BlockType, "legacy_closure">;
  /** HH:mm (24h); either may be null on an operating window. */
  opens_at?: string | null;
  closes_at?: string | null;
  scope: BlockScope;
  reason: string;
  group_name: string;
  is_recurring?: boolean;
  package_ids?: number[] | null;
  room_ids?: number[] | null;
  attraction_ids?: number[] | null;
  event_ids?: number[] | null;
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

/* ---------------------------------------------------------- change history -- */

export type DayOffChangeAction =
  | "created"
  | "updated"
  | "deleted"
  | "booked_inside_block"
  | "booking_removed";

/** One block field as it was saved (the backend's DayOff::snapshot). */
export type DayOffSnapshot = Record<string, unknown>;

/** One permanent history entry for a block (web AvailabilityChange). */
export type DayOffChange = {
  id: number;
  dayOffId: number | null;
  action: DayOffChangeAction;
  summary: string;
  changedByName: string | null;
  changedByRole: string | null;
  locationName: string | null;
  previousLocationName: string | null;
  before: DayOffSnapshot | null;
  after: DayOffSnapshot | null;
  changedFields: string[];
  context: Record<string, unknown>;
  /** ISO timestamp. */
  createdAt: string | null;
};

type RawChange = {
  id: number;
  day_off_id?: number | null;
  action?: DayOffChangeAction;
  summary?: string | null;
  changed_by?: RawPerson;
  location_name?: string | null;
  previous_location_name?: string | null;
  before?: DayOffSnapshot | null;
  after?: DayOffSnapshot | null;
  changed_fields?: string[] | null;
  context?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type DayOffChangePage = {
  changes: DayOffChange[];
  currentPage: number;
  lastPage: number;
};

/**
 * GET /api/day-offs/change-log — who blocked, changed or removed what, and every
 * booking made inside a block (company admins and location managers only).
 */
export async function fetchDayOffChanges(
  token: string,
  filters: { dayOffId?: number; locationId?: number; action?: DayOffChangeAction; page?: number; perPage?: number },
  signal?: AbortSignal,
): Promise<DayOffChangePage> {
  const params = new URLSearchParams({
    page: String(filters.page ?? 1),
    per_page: String(filters.perPage ?? 20),
  });
  if (filters.dayOffId != null) params.append("day_off_id", String(filters.dayOffId));
  if (filters.locationId != null) params.append("location_id", String(filters.locationId));
  if (filters.action) params.append("action", filters.action);
  const res = await apiRequest<{
    data?: { changes?: RawChange[]; pagination?: Pagination };
  }>(`/api/day-offs/change-log?${params.toString()}`, { token, signal });
  const pg = res?.data?.pagination;
  return {
    changes: (res?.data?.changes ?? []).map((c) => ({
      id: c.id,
      dayOffId: c.day_off_id ?? null,
      action: c.action ?? "updated",
      summary: c.summary ?? "",
      changedByName: c.changed_by?.name?.trim() || null,
      changedByRole: c.changed_by?.role ?? null,
      locationName: c.location_name ?? null,
      previousLocationName: c.previous_location_name ?? null,
      before: c.before ?? null,
      after: c.after ?? null,
      changedFields: c.changed_fields ?? [],
      context: c.context ?? {},
      createdAt: c.created_at ?? null,
    })),
    currentPage: pg?.current_page ?? filters.page ?? 1,
    lastPage: pg?.last_page ?? 1,
  };
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
