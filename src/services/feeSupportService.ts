import { apiRequest } from "../lib/api";

/** Fee-support active-state, mirrored from the backend `is_active` flag. */
export type FeeSupportStatus = "active" | "inactive";

export type FeeCalculationType = "fixed" | "percentage";
export type FeeApplicationType = "additive" | "inclusive";
export type FeeSupportEntityType =
  | "package"
  | "attraction"
  | "event"
  | "membership";

/** Flattened fee-support row backing the Fee Supports list + KPI cards. */
export type FeeSupportRow = {
  id: number;
  feeName: string;
  feeAmount: number;
  calculationType: FeeCalculationType;
  applicationType: FeeApplicationType;
  /** Display label — "4.87%" for percentage, "$4.87" for fixed. */
  amountLabel: string;
  entityType: FeeSupportEntityType;
  /** How many entities this fee is applied to (entity_ids length). */
  entityCount: number;
  status: FeeSupportStatus;
  locationId: number | null;
  locationName: string;
  companyName: string;
  createdAt: string | null;
};

/** Raw fee support as returned by GET /api/fee-supports (snake_case). */
type RawFeeSupport = {
  id: number;
  fee_name?: string | null;
  fee_amount?: number | string | null;
  fee_calculation_type?: string | null;
  fee_application_type?: string | null;
  entity_ids?: number[] | null;
  entity_type?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  location_id?: number | null;
  location?: { id?: number; name?: string | null } | null;
  company?: { id?: number; company_name?: string | null } | null;
};

type FeeSupportListResponse = {
  success: boolean;
  data: {
    fee_supports: RawFeeSupport[];
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
};

// The web page loads a single large page and filters/sorts client-side;
// fee-support counts are small, so we mirror that.
const PER_PAGE = 100;

function normalizeCalculationType(
  v: string | null | undefined,
): FeeCalculationType {
  return v === "percentage" ? "percentage" : "fixed";
}

function normalizeApplicationType(
  v: string | null | undefined,
): FeeApplicationType {
  return v === "inclusive" ? "inclusive" : "additive";
}

function normalizeEntityType(
  v: string | null | undefined,
): FeeSupportEntityType {
  if (v === "package" || v === "event" || v === "membership") return v;
  return "attraction";
}

function amountLabel(amount: number, type: FeeCalculationType): string {
  if (type === "percentage") {
    // Drop trailing zeros where present: 4.87 -> "4.87%", 5.00 -> "5%".
    return `${Number(amount)}%`;
  }
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mapFeeSupport(raw: RawFeeSupport): FeeSupportRow {
  const calculationType = normalizeCalculationType(raw.fee_calculation_type);
  const feeAmount = Number(raw.fee_amount ?? 0);
  return {
    id: raw.id,
    feeName: raw.fee_name?.trim() || "Untitled Fee",
    feeAmount,
    calculationType,
    applicationType: normalizeApplicationType(raw.fee_application_type),
    amountLabel: amountLabel(feeAmount, calculationType),
    entityType: normalizeEntityType(raw.entity_type),
    entityCount: Array.isArray(raw.entity_ids) ? raw.entity_ids.length : 0,
    status: raw.is_active ? "active" : "inactive",
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    companyName: raw.company?.company_name?.trim() || "",
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
 * GET /api/fee-supports — the same endpoint the web Fee Supports page uses.
 * Returns the name-ordered list the user can access (auth-scoped to their
 * company/location by the backend).
 */
export async function fetchFeeSupports({
  token,
  locationId,
  signal,
}: FetchParams): Promise<FeeSupportRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    sort_by: "fee_name",
    sort_order: "asc",
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<FeeSupportListResponse>(
    `/api/fee-supports?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.fee_supports ?? [];
  return items.map(mapFeeSupport);
}

type ToggleResponse = {
  success?: boolean;
  data?: { is_active?: boolean | null };
};

/**
 * PATCH /api/fee-supports/{id}/toggle-status — flips a fee support's active
 * state. Returns the new active flag reported by the backend.
 */
export async function toggleFeeSupportStatus(
  token: string,
  id: number,
): Promise<boolean> {
  const res = await apiRequest<ToggleResponse>(
    `/api/fee-supports/${id}/toggle-status`,
    { method: "PATCH", token },
  );
  return !!res.data?.is_active;
}

/** DELETE /api/fee-supports/{id} — removes a fee support. */
export async function deleteFeeSupport(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest<{ success?: boolean }>(`/api/fee-supports/${id}`, {
    method: "DELETE",
    token,
  });
}
