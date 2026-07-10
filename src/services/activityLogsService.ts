import { apiRequest } from "../lib/api";
import { roleLabel, type StaffRole } from "./usersService";

/*
 * Activity-log API client — mirrors the web admin's activity-log service against
 * the Laravel backend (`App\Http\Controllers\Api\ActivityLogController`). The
 * index is read-only (audit trail) and requires a Sanctum bearer token.
 *
 * Scoping: ActivityLog has no company_id column, so company_admins see all
 * company activity across locations; location_manager/attendant are locked to
 * their own location_id (server-enforced via applyAuthScope).
 */

/* ------------------------------------------------------------------ enums -- */

export type ActivityCategory =
  | "create"
  | "update"
  | "delete"
  | "view"
  | "login"
  | "logout"
  | "export"
  | "import"
  | "other";

/** Category → badge tint slug consumed by the screen. */
export const CATEGORY_TONE: Record<string, string> = {
  create: "emerald",
  update: "blue",
  delete: "rose",
  login: "indigo",
  logout: "gray",
  view: "gray",
  export: "amber",
  import: "amber",
  other: "gray",
};

export const CATEGORY_OPTIONS: { label: string; value: ActivityCategory }[] = [
  { label: "Created", value: "create" },
  { label: "Updated", value: "update" },
  { label: "Deleted", value: "delete" },
  { label: "Login", value: "login" },
  { label: "Logout", value: "logout" },
  { label: "Viewed", value: "view" },
  { label: "Exported", value: "export" },
];

/* ---------------------------------------------------------------- domain -- */

export type ActivityActor = {
  id: number | null;
  name: string;
  role: StaffRole | null;
  roleLabel: string;
  email: string | null;
};

export type ActivityLogEntry = {
  id: number;
  action: string;
  category: string;
  description: string;
  entityType: string | null;
  entityId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  actor: ActivityActor;
  locationId: number | null;
  locationName: string | null;
};

type RawUser = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
  email?: string | null;
};

type RawLog = {
  id: number;
  action?: string | null;
  category?: string | null;
  description?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  user?: RawUser | null;
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

type LogsListResponse = {
  success: boolean;
  data: { activity_logs: RawLog[]; pagination: Pagination };
};

/* ---------------------------------------------------------------- mappers -- */

function actorFrom(raw: RawUser | null | undefined): ActivityActor {
  const name = `${raw?.first_name ?? ""} ${raw?.last_name ?? ""}`.trim();
  return {
    id: raw?.id ?? null,
    name: name || "System",
    role: raw?.role ?? null,
    roleLabel: raw?.role ? roleLabel(raw.role) : "System",
    email: raw?.email ?? null,
  };
}

function mapLog(raw: RawLog): ActivityLogEntry {
  return {
    id: raw.id,
    action: raw.action?.trim() || "Activity",
    category: raw.category ?? "other",
    description: raw.description?.trim() || "",
    entityType: raw.entity_type ?? null,
    entityId: raw.entity_id ?? null,
    ipAddress: raw.ip_address ?? null,
    userAgent: raw.user_agent ?? null,
    metadata: raw.metadata ?? null,
    createdAt: raw.created_at ?? null,
    actor: actorFrom(raw.user),
    locationId: raw.location?.id ?? null,
    locationName: raw.location?.name?.trim() || null,
  };
}

/* ------------------------------------------------------------------ list -- */

export type ActivityFilters = {
  search?: string;
  category?: ActivityCategory;
  action?: string;
  locationId?: number;
  /** Inclusive `created_at >=` date (YYYY-MM-DD). */
  dateFrom?: string;
  /** Inclusive `created_at <=` date (YYYY-MM-DD). */
  dateTo?: string;
};

export type ActivityListResult = {
  logs: ActivityLogEntry[];
  total: number;
  currentPage: number;
  lastPage: number;
};

function buildParams(
  filters: ActivityFilters,
  page: number,
  perPage: number,
): URLSearchParams {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    sort_by: "created_at",
    sort_order: "desc",
  });
  if (filters.search?.trim()) params.append("search", filters.search.trim());
  if (filters.category) params.append("category", filters.category);
  if (filters.action?.trim()) params.append("action", filters.action.trim());
  if (filters.locationId != null)
    params.append("location_id", String(filters.locationId));
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  return params;
}

/** GET /api/activity-logs — one page of audit entries (newest first). */
export async function fetchActivityLogs(
  token: string,
  filters: ActivityFilters,
  page = 1,
  perPage = 15,
  signal?: AbortSignal,
): Promise<ActivityListResult> {
  const params = buildParams(filters, page, perPage);
  const res = await apiRequest<LogsListResponse>(
    `/api/activity-logs?${params.toString()}`,
    { token, signal },
  );
  const pg = res?.data?.pagination;
  return {
    logs: (res?.data?.activity_logs ?? []).map(mapLog),
    total: pg?.total ?? 0,
    currentPage: pg?.current_page ?? page,
    lastPage: pg?.last_page ?? page,
  };
}

/** Total entry count matching a filter (via a cheap `per_page=1` request). */
export async function fetchActivityCount(
  token: string,
  filters: ActivityFilters,
  signal?: AbortSignal,
): Promise<number> {
  const params = buildParams(filters, 1, 1);
  const res = await apiRequest<LogsListResponse>(
    `/api/activity-logs?${params.toString()}`,
    { token, signal },
  );
  return res?.data?.pagination?.total ?? 0;
}
