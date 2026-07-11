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
  description?: string | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  usage_limit?: number | string | null;
  usage_limit_per_user?: number | string | null;
  per_user_limit?: number | string | null;
  used_count?: number | string | null;
  times_used?: number | string | null;
  is_active?: boolean | number | null;
  status?: string | null;
  deleted?: boolean | number | null;
  start_date?: string | null;
  end_date?: string | null;
  expiry_date?: string | null;
  expires_at?: string | null;
};

/** Flattened promo row backing the Promo Codes management list. */
export type PromoRow = {
  id: number;
  code: string;
  name: string;
  description: string;
  discountType: string;
  discountValue: number;
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
};

/** Fields for POST /api/promos (single code) — mirrors the web create form. */
export type PromoInput = {
  name: string;
  code?: string;
  discount_type: string;
  discount_value: number;
  start_date?: string | null;
  end_date?: string | null;
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;
  description?: string | null;
};

/** Fields for POST /api/promos/generate-bulk (batch). */
export type BulkPromoInput = {
  campaign_name: string;
  description?: string | null;
  discount_type: string;
  discount_value: number;
  start_date: string;
  end_date: string;
  quantity: number;
  code_prefix?: string | null;
  code_length: number;
  uses_per_code: number;
};

/** A bulk-generation batch (Bulk Codes tab). */
export type PromoBatch = {
  id: number;
  name: string;
  quantity: number;
  usedCount: number;
  createdAt: string | null;
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
    description: p.description?.trim() || "",
    discountType: (p.discount_type ?? "fixed").toLowerCase(),
    discountValue: Number(p.discount_value ?? 0),
    usageLimit: p.usage_limit != null ? Number(p.usage_limit) : null,
    usageLimitPerUser:
      p.usage_limit_per_user != null
        ? Number(p.usage_limit_per_user)
        : p.per_user_limit != null
          ? Number(p.per_user_limit)
          : null,
    usedCount: Number(p.used_count ?? p.times_used ?? 0),
    isActive: active,
    startDate: p.start_date ?? null,
    endDate: p.end_date ?? p.expiry_date ?? p.expires_at ?? null,
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

/** POST /api/promos — create a single promo code. */
export async function createPromo(
  token: string,
  input: PromoInput,
): Promise<void> {
  await apiRequest("/api/promos", { method: "POST", token, body: input });
}

/** DELETE /api/promos/{id} — remove a promo code. */
export async function deletePromo(token: string, id: number): Promise<void> {
  await apiRequest(`/api/promos/${id}`, { method: "DELETE", token });
}

/** POST /api/promos/generate-bulk — generate a batch of unique codes. */
export async function generateBulkPromos(
  token: string,
  input: BulkPromoInput,
): Promise<void> {
  await apiRequest("/api/promos/generate-bulk", {
    method: "POST",
    token,
    body: input,
  });
}

type RawBatch = {
  id: number;
  name?: string | null;
  campaign_name?: string | null;
  quantity?: number | string | null;
  total_codes?: number | string | null;
  codes_count?: number | string | null;
  used_count?: number | string | null;
  created_at?: string | null;
};

/** GET /api/promos/batches — bulk-generation batches (Bulk Codes tab). */
export async function fetchPromoBatches(
  token: string,
  signal?: AbortSignal,
): Promise<PromoBatch[]> {
  const res = await apiRequest<{
    success?: boolean;
    data?: { batches?: RawBatch[] } | RawBatch[];
  }>(`/api/promos/batches`, { token, signal });
  const raw = Array.isArray(res?.data)
    ? res.data
    : (res?.data?.batches ?? []);
  return raw.map((b) => ({
    id: b.id,
    name: b.campaign_name?.trim() || b.name?.trim() || `Batch #${b.id}`,
    quantity: Number(b.quantity ?? b.total_codes ?? b.codes_count ?? 0),
    usedCount: Number(b.used_count ?? 0),
    createdAt: b.created_at ?? null,
  }));
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
