import { apiRequest } from "../lib/api";

/** Special-pricing active-state, mirrored from the backend `is_active` flag. */
export type SpecialPricingStatus = "active" | "inactive";

export type DiscountType = "fixed" | "percentage";
export type RecurrenceType = "one_time" | "weekly" | "monthly";
export type SpecialPricingEntityType =
  | "package"
  | "attraction"
  | "event"
  | "all";

/** Flattened special-pricing row backing the Special Pricing list + KPI cards. */
export type SpecialPricingRow = {
  id: number;
  name: string;
  description: string;
  discountAmount: number;
  discountType: DiscountType;
  /** Display label — "50%" for percentage, "$13.00" for fixed. */
  discountLabel: string;
  recurrenceType: RecurrenceType;
  /** Human recurrence, from the backend (e.g. "Every Tuesday"). */
  recurrenceDisplay: string;
  entityType: SpecialPricingEntityType;
  priority: number;
  isStackable: boolean;
  status: SpecialPricingStatus;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
};

/** Raw special pricing as returned by GET /api/special-pricings (snake_case). */
type RawSpecialPricing = {
  id: number;
  name?: string | null;
  description?: string | null;
  discount_amount?: number | string | null;
  discount_type?: string | null;
  recurrence_type?: string | null;
  recurrence_display?: string | null;
  entity_type?: string | null;
  priority?: number | string | null;
  is_stackable?: boolean | null;
  is_active?: boolean | null;
  created_at?: string | null;
  location_id?: number | null;
  location?: { id?: number; name?: string | null } | null;
};

type SpecialPricingListResponse = {
  success: boolean;
  data: {
    special_pricings: RawSpecialPricing[];
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
};

// The web page loads a single large page and filters/sorts client-side;
// special-pricing counts are small, so we mirror that.
const PER_PAGE = 100;

function normalizeDiscountType(v: string | null | undefined): DiscountType {
  return v === "percentage" ? "percentage" : "fixed";
}

function normalizeRecurrenceType(v: string | null | undefined): RecurrenceType {
  if (v === "weekly") return "weekly";
  if (v === "monthly") return "monthly";
  return "one_time";
}

function normalizeEntityType(
  v: string | null | undefined,
): SpecialPricingEntityType {
  if (v === "package" || v === "event" || v === "all") return v;
  return "attraction";
}

function discountLabel(amount: number, type: DiscountType): string {
  if (type === "percentage") {
    // Drop trailing zeros: 50.00 -> "50%".
    return `${Number(amount)}%`;
  }
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mapSpecialPricing(raw: RawSpecialPricing): SpecialPricingRow {
  const discountType = normalizeDiscountType(raw.discount_type);
  const discountAmount = Number(raw.discount_amount ?? 0);
  return {
    id: raw.id,
    name: raw.name?.trim() || "Untitled Special Pricing",
    description: raw.description?.trim() || "",
    discountAmount,
    discountType,
    discountLabel: discountLabel(discountAmount, discountType),
    recurrenceType: normalizeRecurrenceType(raw.recurrence_type),
    recurrenceDisplay: raw.recurrence_display?.trim() || "",
    entityType: normalizeEntityType(raw.entity_type),
    priority: Number(raw.priority ?? 0),
    isStackable: !!raw.is_stackable,
    status: raw.is_active ? "active" : "inactive",
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
  };
}

type FetchParams = {
  token: string;
  /** Restrict to one location; omit for all the user can access. */
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/special-pricings — the same endpoint the web Special Pricing page
 * uses. Returns the priority-ordered list the user can access (auth-scoped to
 * their company/location by the backend).
 */
export async function fetchSpecialPricings({
  token,
  locationId,
  signal,
}: FetchParams): Promise<SpecialPricingRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    sort_by: "priority",
    sort_order: "desc",
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<SpecialPricingListResponse>(
    `/api/special-pricings?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.special_pricings ?? [];
  return items.map(mapSpecialPricing);
}

type ToggleResponse = {
  success?: boolean;
  data?: { is_active?: boolean | null };
};

/**
 * PATCH /api/special-pricings/{id}/toggle-status — flips a special pricing's
 * active state. Returns the new active flag reported by the backend.
 */
export async function toggleSpecialPricingStatus(
  token: string,
  id: number,
): Promise<boolean> {
  const res = await apiRequest<ToggleResponse>(
    `/api/special-pricings/${id}/toggle-status`,
    { method: "PATCH", token },
  );
  return !!res.data?.is_active;
}

/** DELETE /api/special-pricings/{id} — removes a special pricing. */
export async function deleteSpecialPricing(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest<{ success?: boolean }>(`/api/special-pricings/${id}`, {
    method: "DELETE",
    token,
  });
}
