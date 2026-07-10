import { apiRequest, mediaUrl } from "../lib/api";

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
  description?: string | null;
  max_quantity?: number | string | null;
  min_quantity?: number | string | null;
  is_force_add_on?: boolean | number | null;
  location_id?: number | string | null;
  location?: { id?: number | null; name?: string | null } | null;
  location_name?: string | null;
  image?: string | string[] | null;
};

/** Flattened add-on row backing the Add-ons management list. */
export type AddOnRow = {
  id: number;
  name: string;
  price: number;
  description: string;
  locationId: number | null;
  locationName: string;
  maxQuantity: number | null;
  minQuantity: number | null;
  isForced: boolean;
  images: string[];
};

/** Fields accepted when creating/updating an add-on (mirrors the web form). */
export type AddOnInput = {
  name: string;
  price: number;
  min_quantity: number;
  max_quantity: number;
  description: string | null;
  is_force_add_on: boolean;
  location_id: number;
  /** Base64 data URL(s); omit to keep the existing image on update. */
  image?: string[];
};

function toImages(image: RawAddOn["image"]): string[] {
  const raw: string[] = [];
  if (Array.isArray(image)) {
    raw.push(...image.filter((s): s is string => !!s));
  } else if (typeof image === "string" && image.trim()) {
    const s = image.trim();
    // Some endpoints return a JSON-encoded array in a string column.
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) raw.push(...parsed.filter(Boolean));
      } catch {
        raw.push(s);
      }
    } else {
      raw.push(s);
    }
  }
  // Resolve relative storage paths to absolute URLs so <Image> can load them.
  return raw
    .map((s) => mediaUrl(s))
    .filter((s): s is string => !!s);
}

function mapAddOnRow(a: RawAddOn): AddOnRow {
  return {
    id: a.id,
    name: a.name?.trim() || "Add-on",
    price: Number(a.price ?? 0),
    description: a.description?.trim() || "",
    locationId:
      a.location_id != null
        ? Number(a.location_id)
        : a.location?.id != null
          ? Number(a.location.id)
          : null,
    locationName: a.location?.name?.trim() || a.location_name?.trim() || "",
    maxQuantity: a.max_quantity != null ? Number(a.max_quantity) : null,
    minQuantity: a.min_quantity != null ? Number(a.min_quantity) : null,
    isForced: a.is_force_add_on === true || a.is_force_add_on === 1,
    images: toImages(a.image),
  };
}

/**
 * GET /api/addons — the full add-on list for the management screen (name, price,
 * location, quantity limits, image). Scoped to the location when provided.
 */
export async function fetchAddOnList({
  token,
  userId,
  locationId,
  signal,
}: {
  token: string;
  userId: number;
  locationId?: number;
  signal?: AbortSignal;
}): Promise<AddOnRow[]> {
  const params = new URLSearchParams({
    user_id: String(userId),
    per_page: "200",
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<AddOnsResponse>(
    `/api/addons?${params.toString()}`,
    { token, signal },
  );
  return (res?.data?.add_ons ?? []).map(mapAddOnRow);
}

type AddOnMutationResponse = { success?: boolean; data?: RawAddOn; message?: string };

/** POST /api/addons — create an add-on. */
export async function createAddOn(
  token: string,
  input: AddOnInput,
): Promise<void> {
  await apiRequest<AddOnMutationResponse>("/api/addons", {
    method: "POST",
    token,
    body: input,
  });
}

/** PUT /api/addons/{id} — update an add-on. */
export async function updateAddOn(
  token: string,
  id: number,
  input: AddOnInput,
): Promise<void> {
  await apiRequest<AddOnMutationResponse>(`/api/addons/${id}`, {
    method: "PUT",
    token,
    body: input,
  });
}

/** DELETE /api/addons/{id} — remove an add-on. */
export async function deleteAddOn(token: string, id: number): Promise<void> {
  await apiRequest(`/api/addons/${id}`, { method: "DELETE", token });
}

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
  /** The endpoint defaults to 15/page; pass a high value to get the full set. */
  perPage?: number;
};

/**
 * GET /api/addons — active add-ons for the attraction/package forms (same
 * endpoint the web create page uses). Scoped to the location when one is
 * provided. The response carries no base64 image, so it's payload-safe.
 */
export async function fetchAddOns({
  token,
  userId,
  locationId,
  perPage,
}: FetchAddOnsParams): Promise<AddOnOption[]> {
  const params = new URLSearchParams({ user_id: String(userId) });
  if (perPage != null) params.append("per_page", String(perPage));
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
