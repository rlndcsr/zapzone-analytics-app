import { apiRequest } from "../lib/api";

/** Attraction active-state, mirrored from the web `is_active` flag. */
export type AttractionStatus = "active" | "inactive";

/** An add-on attached to an attraction (used by the Create Purchase form). */
export type AttractionAddOn = {
  id: number;
  name: string;
  price: number;
  description: string | null;
  image: string | null;
  minQuantity: number;
  maxQuantity: number;
};

/** Flattened attraction row backing the Attractions list + KPI cards. */
export type AttractionRow = {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  pricingType: string;
  maxCapacity: number;
  /** 0 or null means "Unlimited". */
  duration: number | null;
  durationUnit: string;
  status: AttractionStatus;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  displayOrder: number;
  displayCapacityToCustomers: boolean;
  images: string[];
  addOns: AttractionAddOn[];
  /** Preferred display order of add-ons, by name. */
  addOnsOrder: string[];
};

/** Raw attraction as returned by GET /api/attractions (snake_case). */
type RawAttraction = {
  id: number;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  price?: number | string | null;
  pricing_type?: string | null;
  max_capacity?: number | string | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  display_order?: number | null;
  display_capacity_to_customers?: boolean | null;
  location?: { id?: number; name?: string | null } | null;
  location_id?: number | null;
  image?: string | string[] | null;
  add_ons?: RawAddOn[] | null;
  add_ons_order?: string[] | null;
  availability?: AvailabilitySchedule[] | Record<string, unknown> | null;
};

type RawAddOn = {
  id: number;
  name?: string | null;
  price?: number | string | null;
  description?: string | null;
  image?: string | null;
  min_quantity?: number | string | null;
  max_quantity?: number | string | null;
};

type AttractionsListResponse = {
  success: boolean;
  data: {
    attractions: RawAttraction[];
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
};

// The web /attractions page loads a single large page (per_page: 100) and
// filters/sorts client-side; attraction counts are small, so we mirror that.
const PER_PAGE = 100;

function mapAttraction(raw: RawAttraction): AttractionRow {
  const durationRaw = raw.duration == null ? null : Number(raw.duration);
  return {
    id: raw.id,
    name: raw.name?.trim() || "Untitled Attraction",
    description: raw.description?.trim() || "",
    category: raw.category?.trim() || "Uncategorized",
    price: Number(raw.price ?? 0),
    pricingType: raw.pricing_type ?? "per_person",
    maxCapacity: Number(raw.max_capacity ?? 0),
    duration: durationRaw && !Number.isNaN(durationRaw) ? durationRaw : null,
    durationUnit: raw.duration_unit ?? "minutes",
    status: raw.is_active ? "active" : "inactive",
    locationId: raw.location?.id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
    displayOrder: Number(raw.display_order ?? 0),
    displayCapacityToCustomers: raw.display_capacity_to_customers ?? true,
    images: raw.image ? (Array.isArray(raw.image) ? raw.image : [raw.image]) : [],
    addOns: (raw.add_ons ?? []).map((a) => ({
      id: a.id,
      name: a.name?.trim() || "Add-on",
      price: Number(a.price ?? 0),
      description: a.description?.trim() || null,
      image: a.image ?? null,
      minQuantity: Number(a.min_quantity ?? 0),
      maxQuantity: Number(a.max_quantity ?? 99),
    })),
    addOnsOrder: raw.add_ons_order ?? [],
  };
}

/** One availability window: which weekdays + the daily open/close times. */
export type AvailabilitySchedule = {
  days: string[];
  start_time: string;
  end_time: string;
};

/** Payload for POST /api/attractions — mirrors the web CreateAttractionData. */
export type CreateAttractionInput = {
  location_id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  pricing_type: string;
  max_capacity: number;
  /** 0 means "unlimited". */
  duration: number;
  duration_unit: "minutes" | "hours";
  availability: AvailabilitySchedule[];
  /** Base64 data URLs; omitted when no images were chosen. */
  image?: string[];
  is_active: boolean;
  addon_ids: number[];
  add_ons_order: string[];
  display_capacity_to_customers: boolean;
  display_order: number;
};

type CreateAttractionResponse = {
  success: boolean;
  data: RawAttraction & { id: number };
  message?: string;
};

/** POST /api/attractions — create an attraction (same endpoint as the web). */
export async function createAttraction(
  token: string,
  input: CreateAttractionInput,
): Promise<AttractionRow> {
  const res = await apiRequest<CreateAttractionResponse>("/api/attractions", {
    method: "POST",
    token,
    body: input,
  });
  return mapAttraction(res.data);
}

/** Full attraction record (list row + availability schedules) as returned by
 *  GET /api/attractions/{id}. Backs the View / Edit / Duplicate flows. */
export type AttractionDetail = AttractionRow & {
  availability: AvailabilitySchedule[];
};

/** Coerce the raw `availability` field into the array form the create/update
 *  endpoints expect. The API may return an array of schedules, a weekday->bool
 *  object (legacy), or null; anything non-array collapses to no schedules. */
function mapAvailability(
  raw: RawAttraction["availability"],
): AvailabilitySchedule[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (s): s is AvailabilitySchedule =>
        !!s && Array.isArray((s as AvailabilitySchedule).days),
    );
  }
  return [];
}

function mapDetail(raw: RawAttraction): AttractionDetail {
  return { ...mapAttraction(raw), availability: mapAvailability(raw.availability) };
}

type DetailResponse = { success: boolean; data: RawAttraction };

/** GET /api/attractions/{id} — the same endpoint the web detail/edit pages use. */
export async function fetchAttractionDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<AttractionDetail> {
  const res = await apiRequest<DetailResponse>(`/api/attractions/${id}`, {
    token,
    signal,
  });
  return mapDetail(res.data);
}

/** Partial update payload for PUT /api/attractions/{id} (web UpdateAttractionData). */
export type UpdateAttractionInput = Partial<CreateAttractionInput>;

/** PUT /api/attractions/{id} — update an attraction (same endpoint as the web). */
export async function updateAttraction(
  token: string,
  id: number,
  input: UpdateAttractionInput,
): Promise<AttractionRow> {
  const res = await apiRequest<CreateAttractionResponse>(
    `/api/attractions/${id}`,
    { method: "PUT", token, body: input },
  );
  return mapAttraction(res.data);
}

/** DELETE /api/attractions/{id} — delete an attraction (same endpoint as the web). */
export async function deleteAttraction(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/attractions/${id}`, { method: "DELETE", token });
}

/**
 * Duplicate an attraction. Mirrors the web ManageAttractions flow exactly: fetch
 * the full record, then POST a copy named "<name> (Copy)" that starts inactive.
 * There is no dedicated duplicate endpoint on either platform — this reuses
 * GET /api/attractions/{id} + POST /api/attractions.
 *
 * @param destinationLocationId Optional target location (company admins); when
 *   omitted the copy is created in the original attraction's location.
 */
export async function duplicateAttraction(
  token: string,
  id: number,
  destinationLocationId?: number | null,
): Promise<AttractionRow> {
  const original = await fetchAttractionDetail(token, id);
  const input: CreateAttractionInput = {
    location_id: destinationLocationId ?? original.locationId ?? 0,
    name: `${original.name} (Copy)`,
    description: original.description,
    category: original.category,
    price: original.price,
    pricing_type: original.pricingType,
    max_capacity: original.maxCapacity,
    duration: original.duration ?? 0,
    duration_unit: original.durationUnit === "hours" ? "hours" : "minutes",
    availability: original.availability,
    image: original.images.length > 0 ? original.images : undefined,
    is_active: false,
    addon_ids: original.addOns.map((a) => a.id),
    add_ons_order: original.addOnsOrder,
    display_capacity_to_customers: original.displayCapacityToCustomers,
    display_order: original.displayOrder,
  };
  return createAttraction(token, input);
}

/** One attraction record accepted by POST /api/attractions/bulk-import. The
 *  backend accepts either camelCase or snake_case keys; we send the same
 *  camelCase shape the Export produces so a file exported here re-imports
 *  cleanly. `location_id` is injected at import time from the chosen location. */
export type AttractionImportInput = {
  location_id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  pricingType?: string;
  maxCapacity?: number;
  duration?: number | null;
  durationUnit?: string;
  availability?: AvailabilitySchedule[];
  images?: string[];
  status?: string;
};

/** Flattened result of a bulk import (mirrors the web `bulkImport` response). */
export type AttractionImportResult = {
  imported: number;
  failed: number;
  errors: { index: number; name: string; error: string }[];
};

type BulkImportResponse = {
  success: boolean;
  message?: string;
  data?: { imported_count?: number; failed_count?: number };
  errors?: { index: number; name: string; error: string }[];
};

/**
 * POST /api/attractions/bulk-import — bulk-create attractions, the same endpoint
 * the web ManageAttractions "Import" modal uses. The backend imports each item
 * independently and reports per-row failures, so a partial success is normal.
 */
export async function bulkImportAttractions(
  token: string,
  attractions: AttractionImportInput[],
): Promise<AttractionImportResult> {
  const res = await apiRequest<BulkImportResponse>(
    "/api/attractions/bulk-import",
    { method: "POST", token, body: { attractions } },
  );
  return {
    imported: res.data?.imported_count ?? 0,
    failed: res.data?.failed_count ?? 0,
    errors: res.errors ?? [],
  };
}

type FetchParams = {
  token: string;
  userId: number;
  /** Restrict to one location; omit for all the user can access. */
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/attractions — the same endpoint the web `/attractions` page uses.
 * Returns the display-ordered attraction list (newest schedules first).
 */
export async function fetchAttractions({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<AttractionRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    user_id: String(userId),
    sort_by: "display_order",
    sort_order: "asc",
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<AttractionsListResponse>(
    `/api/attractions?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.attractions ?? [];
  return items.map(mapAttraction);
}
