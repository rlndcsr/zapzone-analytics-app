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
  discount_type?: string | null;
  discount_value?: number | string | null;
  usage_limit?: number | string | null;
  used_count?: number | string | null;
  times_used?: number | string | null;
  is_active?: boolean | number | null;
  status?: string | null;
  deleted?: boolean | number | null;
  expiry_date?: string | null;
  expires_at?: string | null;
};

/** Flattened promo row backing the Promo Codes management list. */
export type PromoRow = {
  id: number;
  code: string;
  name: string;
  discountType: string;
  discountValue: number;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
};

function mapPromoRow(p: RawPromo): PromoRow {
  const active =
    p.is_active === true ||
    p.is_active === 1 ||
    (p.status ? p.status.toLowerCase() === "active" : false) ||
    (p.is_active == null && p.status == null && !p.deleted);
  return {
    id: p.id,
    code: p.code?.trim() || `#${p.id}`,
    name: p.name?.trim() || p.code?.trim() || `Promo #${p.id}`,
    discountType: (p.discount_type ?? "fixed").toLowerCase(),
    discountValue: Number(p.discount_value ?? 0),
    usageLimit: p.usage_limit != null ? Number(p.usage_limit) : null,
    usedCount: Number(p.used_count ?? p.times_used ?? 0),
    isActive: active,
    expiresAt: p.expiry_date ?? p.expires_at ?? null,
  };
}

/** GET /api/promos — the full promo list for the management screen. */
export async function fetchPromoList(
  token: string,
  signal?: AbortSignal,
): Promise<PromoRow[]> {
  const out: PromoRow[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await apiRequest<PromosResponse>(
      `/api/promos?per_page=${PER_PAGE}&page=${page}`,
      { token, signal },
    );
    for (const p of res?.data?.promos ?? []) out.push(mapPromoRow(p));
    lastPage = res?.data?.pagination?.last_page ?? page;
    page += 1;
  } while (page <= lastPage && page <= MAX_PAGES);
  return out;
}

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
