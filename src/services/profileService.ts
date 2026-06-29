import { apiRequest } from "../lib/api";

/** Company record embedded in the user payload / returned by /api/companies. */
export type CompanyDetails = {
  id: number;
  company_name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  founded_date: string | null;
  tax_id: string | null;
  registration_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  description: string | null;
  logo_path: string | null;
};

export type ProfileLocation = {
  id: number;
  name: string;
  city?: string | null;
  state?: string | null;
};

/** Full user profile from GET /api/users/{id} (company + location eager-loaded). */
export type ProfileUser = {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  position: string | null;
  employee_id: string | null;
  department: string | null;
  status: string;
  profile_path: string | null;
  company_id: number | null;
  location_id: number | null;
  company?: CompanyDetails | null;
  location?: ProfileLocation | null;
};

/** Auto-calculated company rollups from GET /api/companies/{id}/statistics. */
export type CompanyStatistics = {
  total_locations: number;
  total_users: number;
  active_users: number;
  recent_bookings: number;
};

type ApiEnvelope<T> = { success: boolean; data: T };

// GET /api/users/{id} — personal info + embedded company/location.
export async function fetchUserProfile(
  userId: number,
  token: string,
): Promise<ProfileUser> {
  const res = await apiRequest<ApiEnvelope<ProfileUser>>(
    `/api/users/${userId}`,
    { token },
  );
  return res.data;
}

// GET /api/companies/{id}/statistics — Business Overview numbers.
export async function fetchCompanyStatistics(
  companyId: number,
  token: string,
): Promise<CompanyStatistics> {
  const res = await apiRequest<ApiEnvelope<CompanyStatistics>>(
    `/api/companies/${companyId}/statistics`,
    { token },
  );
  return res.data;
}

/** Editable personal-info fields (PATCH /api/users/{id}). */
export type UserProfilePayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
  position?: string | null;
  employee_id?: string | null;
  department?: string | null;
};

/** Editable company fields (PUT /api/companies/{id}). */
export type CompanyPayload = {
  company_name?: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  company_size?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip_code?: string | null;
};

// PATCH /api/users/{id} — update personal information.
export async function updateUserProfile(
  userId: number,
  token: string,
  payload: UserProfilePayload,
): Promise<ProfileUser> {
  const res = await apiRequest<ApiEnvelope<ProfileUser>>(
    `/api/users/${userId}`,
    { method: "PATCH", token, body: payload },
  );
  return res.data;
}

// PUT /api/companies/{id} — update company details.
export async function updateCompany(
  companyId: number,
  token: string,
  payload: CompanyPayload,
): Promise<CompanyDetails> {
  const res = await apiRequest<ApiEnvelope<CompanyDetails>>(
    `/api/companies/${companyId}`,
    { method: "PUT", token, body: payload },
  );
  return res.data;
}
