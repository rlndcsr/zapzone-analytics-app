import { apiRequest } from "../lib/api";

/** Attraction active-state, mirrored from the web `is_active` flag. */
export type AttractionStatus = "active" | "inactive";

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
