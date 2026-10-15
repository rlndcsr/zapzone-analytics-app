import { apiRequest } from "../lib/api";
import {
  mapProfileDependent,
  mapProfileRow,
  mapProfileView,
  type DependentPayload,
  type ProfilePayload,
  type RawProfileDependent,
  type RawProfileRow,
  type RawProfileView,
  type ReturningCustomerDependent,
  type ReturningCustomerRow,
  type ReturningCustomerView,
} from "../lib/waivers/returningCustomers";

/**
 * Returning Customers API (web parity: `waiverService.listProfiles` & co.).
 * Every route is company_admin / admin / location_manager only, scoped to the
 * user's company (records carry no location of their own, only the last one).
 */

type Envelope<T> = { success?: boolean; message?: string; data?: T };

function unwrap<T>(res: Envelope<T> | null | undefined, fallback: string): T {
  if (!res?.success || res.data == null) {
    throw new Error(res?.message || fallback);
  }
  return res.data;
}

export type ReturningCustomersPage = {
  rows: ReturningCustomerRow[];
  lastPage: number;
  total: number;
};

/** GET /api/waiver-profiles — one page, newest-to-review first (the API's order). */
export async function fetchReturningCustomers(
  token: string,
  {
    page,
    perPage,
    search,
    needsReview,
  }: { page: number; perPage: number; search?: string; needsReview?: boolean },
  signal?: AbortSignal,
): Promise<ReturningCustomersPage> {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
  });
  if (search) params.set("search", search);
  if (needsReview) params.set("needs_review", "1");

  const res = await apiRequest<
    Envelope<RawProfileRow[]> & {
      meta?: { last_page?: number; total?: number };
    }
  >(`/api/waiver-profiles?${params.toString()}`, { token, signal });

  const rows = unwrap(res, "Failed to load returning customers");
  return {
    rows: rows.map(mapProfileRow),
    lastPage: res.meta?.last_page ?? 1,
    total: res.meta?.total ?? 0,
  };
}

/** GET /api/waiver-profiles/{id} — the record, its dependents and history. */
export async function fetchReturningCustomer(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<ReturningCustomerView> {
  const res = await apiRequest<Envelope<RawProfileView>>(
    `/api/waiver-profiles/${id}`,
    { token, signal },
  );
  return mapProfileView(unwrap(res, "Failed to load that customer record"));
}

/** PATCH /api/waiver-profiles/{id} — answers with the whole refreshed view. */
export async function updateReturningCustomer(
  token: string,
  id: number,
  body: ProfilePayload | { needs_staff_review: boolean },
): Promise<ReturningCustomerView> {
  const res = await apiRequest<Envelope<RawProfileView>>(
    `/api/waiver-profiles/${id}`,
    { method: "PATCH", token, body },
  );
  return mapProfileView(unwrap(res, "Those details could not be saved"));
}

/** POST /api/waiver-profiles/{id}/dependents — re-activates a matching retired one. */
export async function addReturningCustomerDependent(
  token: string,
  profileId: number,
  body: DependentPayload,
): Promise<ReturningCustomerDependent> {
  const res = await apiRequest<Envelope<RawProfileDependent>>(
    `/api/waiver-profiles/${profileId}/dependents`,
    { method: "POST", token, body },
  );
  return mapProfileDependent(unwrap(res, "That dependent could not be saved"));
}

/** PATCH /api/waiver-profile-dependents/{id} — edit, or `{ is_active: true }` to bring back. */
export async function updateReturningCustomerDependent(
  token: string,
  dependentId: number,
  body: DependentPayload | { is_active: boolean },
): Promise<ReturningCustomerDependent> {
  const res = await apiRequest<Envelope<RawProfileDependent>>(
    `/api/waiver-profile-dependents/${dependentId}`,
    { method: "PATCH", token, body },
  );
  return mapProfileDependent(unwrap(res, "That dependent could not be saved"));
}

/** DELETE /api/waiver-profile-dependents/{id} — retires; past waivers keep them. */
export async function retireReturningCustomerDependent(
  token: string,
  dependentId: number,
): Promise<ReturningCustomerDependent> {
  const res = await apiRequest<Envelope<RawProfileDependent>>(
    `/api/waiver-profile-dependents/${dependentId}`,
    { method: "DELETE", token },
  );
  return mapProfileDependent(unwrap(res, "That dependent could not be saved"));
}
