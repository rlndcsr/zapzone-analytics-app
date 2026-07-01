import { apiRequest } from "../lib/api";

/** A customer match from the search-as-you-type lookup. */
export type CustomerHit = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

type RawCustomer = {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type SearchResponse = { success?: boolean; data?: RawCustomer[] } | RawCustomer[];

/** GET /api/customers/search?q= — used to link an existing customer. */
export async function searchCustomers(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<CustomerHit[]> {
  const res = await apiRequest<SearchResponse>(
    `/api/customers/search?q=${encodeURIComponent(query)}`,
    { token, signal },
  );
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list
    .filter((c): c is RawCustomer => !!c && typeof c.id === "number")
    .map((c) => ({
      id: c.id,
      firstName: c.first_name?.trim() || "",
      lastName: c.last_name?.trim() || "",
      email: c.email?.trim() || "",
      phone: c.phone?.trim() || null,
    }));
}
