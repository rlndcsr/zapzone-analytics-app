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
  shift: string | null;
  hireDate: string | null;
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
  shift?: string | null;
  hire_date?: string | null;
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
    shift: raw.shift?.trim() || null,
    hireDate: raw.hire_date ?? null,
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

/**
 * Every staff account matching a filter, following pagination to the last page.
 * The web Attendants page loads the full (server-scoped) attendant set once and
 * does all search/filter/sort/paginate client-side; this mirrors that so the
 * KPI aggregates (departments, ≤30-day counts) match the web exactly. Bounded
 * by `maxPages` as a runaway guard — a single location's staff is small.
 */
export async function fetchAllStaffUsers(
  token: string,
  filters: StaffFilters,
  signal?: AbortSignal,
  perPage = 100,
  maxPages = 20,
): Promise<StaffUser[]> {
  const first = await fetchStaffUsers(token, filters, 1, perPage, signal);
  const users = [...first.users];
  const pages = Math.min(first.lastPage, maxPages);
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchStaffUsers(token, filters, page, perPage, signal);
    users.push(...next.users);
  }
  return users;
}

/* ------------------------------------------------------------- create/edit -- */

/**
 * Create-staff request — mirrors the web `CreateStaffAccountModal` payload sent
 * to `POST /users/staff`. `location_id` is the caller's own location for a
 * location_manager (server also enforces this).
 */
export type CreateStaffPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role: StaffRole;
  location_id?: number | null;
  password_mode: "generate" | "custom";
  password?: string;
  send_email: boolean;
  return_password: boolean;
  login_url?: string;
};

export type CreateStaffResult = {
  user: StaffUser | null;
  /** Temporary password, present only when `return_password` was set. */
  generatedPassword: string | null;
  emailSent: boolean;
};

/** POST /api/users/staff — provision a new staff account (admin/manager). */
export async function createStaff(
  token: string,
  payload: CreateStaffPayload,
): Promise<CreateStaffResult> {
  const res = await apiRequest<{
    success?: boolean;
    data?: {
      user?: RawUser;
      generated_password?: string | null;
      email_sent?: boolean;
    };
    user?: RawUser;
    generated_password?: string | null;
    email_sent?: boolean;
  }>("/api/users/staff", { method: "POST", token, body: payload });

  const rawUser = res?.data?.user ?? res?.user ?? null;
  return {
    user: rawUser ? mapUser(rawUser) : null,
    generatedPassword:
      res?.data?.generated_password ?? res?.generated_password ?? null,
    emailSent: Boolean(res?.data?.email_sent ?? res?.email_sent),
  };
}

/** Fields the web edit modal updates via `PUT /users/{id}`. */
export type UpdateStaffPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
  shift?: string | null;
  status?: StaffStatus;
};

/** PUT /api/users/{id} — update an existing staff account. */
export async function updateStaff(
  token: string,
  id: number,
  payload: UpdateStaffPayload,
): Promise<StaffUser | null> {
  const res = await apiRequest<{
    success?: boolean;
    data?: RawUser;
    user?: RawUser;
  }>(`/api/users/${id}`, { method: "PUT", token, body: payload });
  const raw = res?.data ?? res?.user ?? null;
  return raw ? mapUser(raw) : null;
}

/**
 * POST /api/shareable-tokens — mint a self-service signup invitation link for a
 * new attendant (or manager). Mirrors the web "Send Invitation" modal.
 */
export type InvitePayload = {
  email: string;
  role: StaffRole;
  company_id?: number | null;
  location_id?: number | null;
};

export async function createStaffInvite(
  token: string,
  payload: InvitePayload,
): Promise<string> {
  const res = await apiRequest<{
    success?: boolean;
    data?: { link?: string | null } | null;
  }>("/api/shareable-tokens", { method: "POST", token, body: payload });
  return res?.data?.link ?? "";
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
