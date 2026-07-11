import { apiRequest } from "../lib/api";

/** A selectable gift card for the package form. No image → payload-safe. */
export type GiftCardOption = {
  id: number;
  code: string;
};

type RawGiftCard = {
  id: number;
  code?: string | null;
  discount_type?: string | null;
  type?: string | null;
  value?: number | string | null;
  amount?: number | string | null;
  balance?: number | string | null;
  current_balance?: number | string | null;
  remaining_balance?: number | string | null;
  max_usage?: number | string | null;
  usage_limit?: number | string | null;
  used_count?: number | string | null;
  times_used?: number | string | null;
  description?: string | null;
  is_active?: boolean | number | null;
  status?: string | null;
  deleted?: boolean | number | null;
  expiry_date?: string | null;
  expires_at?: string | null;
};

/** Flattened gift-card row backing the Gift Cards management list. */
export type GiftCardRow = {
  id: number;
  code: string;
  discountType: string;
  value: number;
  balance: number | null;
  maxUsage: number | null;
  usedCount: number;
  description: string;
  isActive: boolean;
  expiresAt: string | null;
};

/** Fields for POST /api/gift-cards — mirrors the web create form. */
export type GiftCardInput = {
  type: string;
  value: number;
  balance: number;
  max_usage: number;
  expiry_date?: string | null;
  description?: string | null;
};

function mapGiftCardRow(g: RawGiftCard): GiftCardRow {
  const active =
    g.is_active === true ||
    g.is_active === 1 ||
    (g.status ? g.status.toLowerCase() === "active" : false) ||
    (g.is_active == null && g.status == null && !g.deleted);
  const balanceRaw = g.balance ?? g.current_balance ?? g.remaining_balance;
  return {
    id: g.id,
    code: g.code?.trim() || `#${g.id}`,
    discountType: (g.discount_type ?? g.type ?? "fixed").toLowerCase(),
    value: Number(g.value ?? g.amount ?? 0),
    balance: balanceRaw != null ? Number(balanceRaw) : null,
    maxUsage: g.max_usage != null ? Number(g.max_usage) : g.usage_limit != null ? Number(g.usage_limit) : null,
    usedCount: Number(g.used_count ?? g.times_used ?? 0),
    description: g.description?.trim() || "",
    isActive: active,
    expiresAt: g.expiry_date ?? g.expires_at ?? null,
  };
}

/** GET /api/gift-cards — the full gift-card list for the management screen. */
export async function fetchGiftCardList(
  token: string,
  signal?: AbortSignal,
): Promise<GiftCardRow[]> {
  const out: GiftCardRow[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await apiRequest<GiftCardsResponse>(
      `/api/gift-cards?per_page=${PER_PAGE}&page=${page}`,
      { token, signal },
    );
    for (const g of res?.data?.gift_cards ?? []) out.push(mapGiftCardRow(g));
    lastPage = res?.data?.pagination?.last_page ?? page;
    page += 1;
  } while (page <= lastPage && page <= MAX_PAGES);
  return out;
}

/** POST /api/gift-cards — create a gift card. */
export async function createGiftCard(
  token: string,
  input: GiftCardInput,
): Promise<void> {
  await apiRequest("/api/gift-cards", { method: "POST", token, body: input });
}

/** DELETE /api/gift-cards/{id} — remove a gift card. */
export async function deleteGiftCard(token: string, id: number): Promise<void> {
  await apiRequest(`/api/gift-cards/${id}`, { method: "DELETE", token });
}

type GiftCardsResponse = {
  success?: boolean;
  data?: {
    gift_cards?: RawGiftCard[];
    pagination?: { last_page?: number };
  };
};

const PER_PAGE = 200;
// Safety cap so a bad paginator can't spin forever (the endpoint has no cap).
const MAX_PAGES = 25;

/**
 * GET /api/gift-cards — active gift cards for the package form (role/company-
 * scoped by the backend). Pages through since the endpoint doesn't cap per_page.
 */
export async function fetchGiftCards(
  token: string,
  signal?: AbortSignal,
): Promise<GiftCardOption[]> {
  const out: GiftCardOption[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await apiRequest<GiftCardsResponse>(
      `/api/gift-cards?per_page=${PER_PAGE}&page=${page}`,
      { token, signal },
    );
    for (const g of res?.data?.gift_cards ?? []) {
      out.push({ id: g.id, code: g.code?.trim() || `#${g.id}` });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page += 1;
  } while (page <= lastPage && page <= MAX_PAGES);
  return out;
}
