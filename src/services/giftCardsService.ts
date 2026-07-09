import { apiRequest } from "../lib/api";

/** A selectable gift card for the package form. No image → payload-safe. */
export type GiftCardOption = {
  id: number;
  code: string;
};

type RawGiftCard = {
  id: number;
  code?: string | null;
};

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
