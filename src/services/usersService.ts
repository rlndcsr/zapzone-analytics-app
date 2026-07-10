import { apiRequest } from "../lib/api";

/*
 * Staff (users) API client — mirrors the web admin's user-management services
 * against the same Laravel backend (`App\Http\Controllers\Api\UserController`).
 * All endpoints are under `/api` and require a Sanctum bearer token.
 *
 * Backend authorization (enforced server-side; the mobile UI mirrors it so we
 * never surface an action the caller's role would be rejected for):
 *   - GET /users is auto-scoped: company_admin → their company; location_manager
 *     → their company AND location. Attendants have no user-management access.
 *   - Create staff (`/users/staff`): company_admin or location_manager.
 *   - Resend credentials: company_admin only.
 *   - toggle-status / delete: staff admins (mirrored to admin/manager here).
 */

/* ------------------------------------------------------------------ enums -- */

export type StaffRole =
  | "company_admin"
  | "location_manager"
  | "attendant"
  | (string & {});

export type StaffStatus = "active" | "inactive" | (string & {});

/** Human labels for staff roles (mirrors the web "Type" column). */
export const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  location_manager: "Location Manager",
  attendant: "Attendant",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

/* ---------------------------------------------------------------- domain -- */

export type StaffUser = {
  id: number;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: StaffStatus;
  companyId: number | null;
  locationId: number | null;
  locationName: string | null;
  department: string | null;
  position: string | null;
  employeeId: string | null;
  lastLogin: string | null;
  createdAt: string | null;
};

type RawUser = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
  company_id?: number | null;
  location_id?: number | null;
  department?: string | null;
  position?: string | null;
  employee_id?: string | null;
  last_login?: string | null;
  created_at?: string | null;
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

type UsersListResponse = {
  success: boolean;
  data: { users: RawUser[]; pagination: Pagination };
};

/* ---------------------------------------------------------------- mappers -- */

function fullName(first?: string | null, last?: string | null): string {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || "—";
}

function mapUser(raw: RawUser): StaffUser {
  return {
    id: raw.id,
    firstName: raw.first_name ?? "",
    lastName: raw.last_name ?? "",
    name: raw.name?.trim() || fullName(raw.first_name, raw.last_name),
    email: raw.email ?? "—",
    phone: raw.phone?.trim() || null,
    role: raw.role ?? "attendant",
    status: raw.status ?? "active",
    companyId: raw.company_id ?? null,
    locationId: raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || null,
    department: raw.department?.trim() || null,
    position: raw.position?.trim() || null,
    employeeId: raw.employee_id?.trim() || null,
    lastLogin: raw.last_login ?? null,
    createdAt: raw.created_at ?? null,
  };
}

/* ------------------------------------------------------------------ list -- */

export type StaffFilters = {
  /** Free-text search (name / email / employee id / phone / department). */
  search?: string;
  role?: StaffRole;
  status?: StaffStatus;
  /** company_admin only — narrow to a single location. */
  locationId?: number;
  sortBy?: "first_name" | "last_name" | "email" | "role" | "created_at" | "last_login";
  sortOrder?: "asc" | "desc";
};

export type StaffListResult = {
  users: StaffUser[];
  total: number;
  currentPage: number;
  lastPage: number;
};

function buildParams(
  filters: StaffFilters,
  page: number,
  perPage: number,
): URLSearchParams {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });
  if (filters.search?.trim()) params.append("search", filters.search.trim());
  if (filters.role) params.append("role", filters.role);
  if (filters.status) params.append("status", filters.status);
  if (filters.locationId != null)
    params.append("location_id", String(filters.locationId));
  if (filters.sortBy) params.append("sort_by", filters.sortBy);
  if (filters.sortOrder) params.append("sort_order", filters.sortOrder);
  return params;
}

/** GET /api/users — one page of staff accounts (server-side filtered + paged). */
export async function fetchStaffUsers(
  token: string,
  filters: StaffFilters,
  page = 1,
  perPage = 15,
  signal?: AbortSignal,
): Promise<StaffListResult> {
  const params = buildParams(filters, page, perPage);
  const res = await apiRequest<UsersListResponse>(
    `/api/users?${params.toString()}`,
    { token, signal },
  );
  const pg = res?.data?.pagination;
  return {
    users: (res?.data?.users ?? []).map(mapUser),
    total: pg?.total ?? 0,
    currentPage: pg?.current_page ?? page,
    lastPage: pg?.last_page ?? page,
  };
}

/**
 * Total account count matching a filter (across all pages). Uses a `per_page=1`
 * request and reads `pagination.total` — cheap, and lets the KPI cards show
 * accurate role/status counts without a dedicated stats endpoint.
 */
export async function fetchStaffCount(
  token: string,
  filters: StaffFilters,
  signal?: AbortSignal,
): Promise<number> {
  const params = buildParams(filters, 1, 1);
  const res = await apiRequest<UsersListResponse>(
    `/api/users?${params.toString()}`,
    { token, signal },
  );
  return res?.data?.pagination?.total ?? 0;
}

/**
 * Most recent accounts (created_at desc) for the "New Accounts" KPI. The users
 * index has no created_at filter, so we fetch a bounded recent page and count
 * client-side — accurate for realistic company staff sizes.
 */
export async function fetchRecentStaff(
  token: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<StaffUser[]> {
  const res = await fetchStaffUsers(
    token,
    { sortBy: "created_at", sortOrder: "desc" },
    1,
    limit,
    signal,
  );
  return res.users;
}

/* ---------------------------------------------------------------- writes -- */

/** PATCH /api/users/{id}/toggle-status — flips active ⇄ inactive. */
export async function toggleStaffStatus(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/users/${id}/toggle-status`, { method: "PATCH", token });
}

/** DELETE /api/users/{id} — remove a staff account (admin). */
export async function deleteStaffUser(token: string, id: number): Promise<void> {
  await apiRequest(`/api/users/${id}`, { method: "DELETE", token });
}

/** POST /api/users/{id}/resend-credentials — regenerate + email a password. */
export async function resendStaffCredentials(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/users/${id}/resend-credentials`, {
    method: "POST",
    token,
    body: { password_mode: "generate" },
  });
}
