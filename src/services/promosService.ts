import { apiRequest } from "../lib/api";

/** A selectable promo for the package form. Carries no image → payload-safe. */
export type PromoOption = {
  id: number;
  code: string;
  name: string;
};

type RawPromo = {
  id: number;
  code?: string | null;
  name?: string | null;
};

type PromosResponse = {
  success?: boolean;
  data?: {
    promos?: RawPromo[];
    pagination?: { last_page?: number };
  };
};

const PER_PAGE = 200;
// Safety cap so a bad paginator can't spin forever (the endpoint has no cap).
const MAX_PAGES = 25;

/**
 * GET /api/promos — active promos for the package form (role/company-scoped by
 * the backend). Pages through since the endpoint doesn't cap per_page.
 */
export async function fetchPromos(
  token: string,
  signal?: AbortSignal,
): Promise<PromoOption[]> {
  const out: PromoOption[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await apiRequest<PromosResponse>(
      `/api/promos?per_page=${PER_PAGE}&page=${page}`,
      { token, signal },
    );
    for (const p of res?.data?.promos ?? []) {
      out.push({
        id: p.id,
        code: p.code?.trim() || `#${p.id}`,
        name: p.name?.trim() || p.code?.trim() || `Promo #${p.id}`,
      });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page += 1;
  } while (page <= lastPage && page <= MAX_PAGES);
  return out;
}
