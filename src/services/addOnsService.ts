import { apiRequest } from "../lib/api";

/** A selectable add-on for the attraction form. */
export type AddOnOption = {
  id: number;
  name: string;
  price: number;
};

type RawAddOn = {
  id: number;
  name?: string | null;
  price?: number | string | null;
};

type AddOnsResponse = {
  success: boolean;
  data: {
    add_ons?: RawAddOn[];
    pagination?: unknown;
  };
};

type FetchAddOnsParams = {
  token: string;
  userId: number;
  locationId?: number;
};

/**
 * GET /api/addons — active add-ons for the attraction form (same endpoint the
 * web create page uses). Scoped to the location when one is provided.
 */
export async function fetchAddOns({
  token,
  userId,
  locationId,
}: FetchAddOnsParams): Promise<AddOnOption[]> {
  const params = new URLSearchParams({ user_id: String(userId) });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<AddOnsResponse>(
    `/api/addons?${params.toString()}`,
    { token },
  );
  const list = res?.data?.add_ons ?? [];
  return list.map((a) => ({
    id: a.id,
    name: a.name?.trim() || "Add-on",
    price: Number(a.price ?? 0),
  }));
}
