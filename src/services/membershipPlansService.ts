import { apiRequest } from "../lib/api";

/** Billing cadence, mirrored from the backend `billing_cycle`. */
export type BillingCycle =
  | "monthly"
  | "quarterly"
  | "annual"
  | "one_time"
  | "custom";

/** Where a plan may be used, from the backend `location_access_mode`. */
export type LocationAccessMode = "single" | "multi" | "all";

/** How a plan's usage is metered, from the backend `usage_type`. */
export type UsageType = "limited" | "unlimited" | "limited_visits" | "punch_card";

/** Flattened plan row backing the Membership Plans list. */
export type MembershipPlanRow = {
  id: number;
  name: string;
  description: string;
  price: number;
  billingCycle: BillingCycle;
  /** "Monthly" / "One Time" — humanized billing cadence for the INTERVAL column. */
  intervalLabel: string;
  /** "Unlimited" / "10 visits" — humanized allowance for the USAGE column. */
  usageLabel: string;
  usageType: UsageType;
  /** "Single" / "Multi" / "All" for the ACCESS column. */
  accessLabel: string;
  locationAccessMode: LocationAccessMode;
  isActive: boolean;
  /** How many memberships reference this plan (backend withCount). */
  membersCount: number;
  /** Location ids approved for a multi-location plan (edit pre-fill). */
  approvedLocationIds: number[];
  /** Authorize.Net account bound to the plan; null = per home-location default. */
  billingAccountId: number | null;
  /** Fields the edit form needs to round-trip without losing data. */
  raw: RawPlan;
};

/** Raw plan as returned by GET /api/membership-plans (snake_case). */
type RawPlan = {
  id: number;
  name?: string | null;
  description?: string | null;
  price?: number | string | null;
  billing_cycle?: BillingCycle | null;
  billing_interval?: BillingCycle | null;
  custom_billing_days?: number | null;
  trial_days?: number | null;
  term_length_months?: number | null;
  season_start_date?: string | null;
  season_end_date?: string | null;
  usage_type?: UsageType | null;
  visits_per_term?: number | null;
  uses_per_term?: number | null;
  punch_card_total?: number | null;
  unlimited_visits_per_term?: boolean | null;
  unlimited_visits?: boolean | null;
  location_access_mode?: LocationAccessMode | null;
  location_id?: number | null;
  billing_account_id?: number | null;
  cancellation_mode?: "immediate" | "end_of_term" | "staff_only" | null;
  grace_period_days?: number | null;
  failed_payment_retry_days?: number | null;
  requires_photo?: boolean | null;
  is_family_or_group?: boolean | null;
  is_active?: boolean | null;
  memberships_count?: number | null;
  approved_locations?: { id: number; name?: string | null }[] | null;
  [key: string]: unknown;
};

const REQUEST_TIMEOUT_MS = 15000;

const INTERVAL_LABELS: Record<BillingCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  one_time: "One Time",
  custom: "Custom",
};

const ACCESS_LABELS: Record<LocationAccessMode, string> = {
  single: "Single",
  multi: "Multi",
  all: "All",
};

function intervalLabel(cycle: BillingCycle, customDays?: number | null): string {
  if (cycle === "custom" && customDays) return `${customDays} days`;
  return INTERVAL_LABELS[cycle] ?? "—";
}

/** Humanize the metered-usage into a single short label for the USAGE column. */
function usageLabel(raw: RawPlan): string {
  const type = raw.usage_type ?? "limited";
  const unlimited = !!(raw.unlimited_visits_per_term ?? raw.unlimited_visits);
  if (type === "unlimited" || unlimited) return "Unlimited";
  if (type === "punch_card") {
    return raw.punch_card_total ? `${raw.punch_card_total} punches` : "Punch card";
  }
  const visits = raw.visits_per_term ?? raw.uses_per_term ?? null;
  return visits != null ? `${visits} visits` : "Limited";
}

function mapPlan(raw: RawPlan): MembershipPlanRow {
  const cycle = (raw.billing_cycle ?? raw.billing_interval ?? "monthly") as BillingCycle;
  const accessMode = (raw.location_access_mode ?? "single") as LocationAccessMode;
  return {
    id: raw.id,
    name: raw.name?.trim() || "Untitled Plan",
    description: raw.description?.trim() || "",
    price: Number(raw.price ?? 0),
    billingCycle: cycle,
    intervalLabel: intervalLabel(cycle, raw.custom_billing_days),
    usageLabel: usageLabel(raw),
    usageType: (raw.usage_type ?? "limited") as UsageType,
    accessLabel: ACCESS_LABELS[accessMode] ?? "Single",
    locationAccessMode: accessMode,
    isActive: !!raw.is_active,
    membersCount: Number(raw.memberships_count ?? 0),
    approvedLocationIds: Array.isArray(raw.approved_locations)
      ? raw.approved_locations.map((l) => l.id)
      : [],
    billingAccountId: raw.billing_account_id ?? null,
    raw,
  };
}

function looksLikePlan(v: unknown): v is RawPlan {
  return !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "number";
}

/**
 * Pull the plan array out of the response. GET /api/membership-plans returns a
 * paginated resource (`{ success, data: { data: [...] } }`), but we tolerate a
 * bare array or `{ data: [...] }` so a serialization change can't blank the list.
 */
function extractPlans(res: unknown): RawPlan[] {
  const asArray = (v: unknown): RawPlan[] | null =>
    Array.isArray(v) && (v.length === 0 || looksLikePlan(v[0])) ? (v as RawPlan[]) : null;

  if (asArray(res)) return res as RawPlan[];

  const root = (res ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [data.data, root.data, root.plans];
  for (const c of candidates) {
    const arr = asArray(c);
    if (arr) return arr;
  }
  return [];
}

type FetchParams = {
  token: string;
  /** Only active plans (used by the Add Member plan picker). */
  activeOnly?: boolean;
  locationId?: number;
  search?: string;
  signal?: AbortSignal;
};

/**
 * GET /api/membership-plans — the plan list the user can access, auth-scoped by
 * the backend to their company (and location, for managers/attendants).
 */
export async function fetchMembershipPlans({
  token,
  activeOnly,
  locationId,
  search,
  signal,
}: FetchParams): Promise<MembershipPlanRow[]> {
  const params = new URLSearchParams({ per_page: "50" });
  if (activeOnly) params.append("active_only", "1");
  if (locationId != null) params.append("location_id", String(locationId));
  if (search) params.append("search", search);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    const res = await apiRequest<unknown>(
      `/api/membership-plans?${params.toString()}`,
      { token, signal: controller.signal },
    );
    return extractPlans(res).map(mapPlan);
  } catch (err) {
    if (timedOut) throw new Error("Request timed out. Pull to refresh to try again.");
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

type ToggleResponse = { success?: boolean; data?: { is_active?: boolean | null } };

/**
 * PATCH /api/membership-plans/{id}/toggle-status — flips a plan's active state.
 * Returns the new active flag reported by the backend.
 */
export async function togglePlanStatus(token: string, id: number): Promise<boolean> {
  const res = await apiRequest<ToggleResponse>(
    `/api/membership-plans/${id}/toggle-status`,
    { method: "PATCH", token },
  );
  return !!res.data?.is_active;
}

/** DELETE /api/membership-plans/{id} — company admins only (backend enforced). */
export async function deletePlan(token: string, id: number): Promise<void> {
  await apiRequest(`/api/membership-plans/${id}`, { method: "DELETE", token });
}

/** The benefit kinds the backend accepts (mirrors its Rule::in list). */
export type BenefitType =
  | "package_discount"
  | "attraction_discount"
  | "event_discount"
  | "addon_discount"
  | "free_entry_pass"
  | "guest_pass"
  | "priority_booking"
  | "member_only_access"
  | "birthday_reward";

/** How a benefit's value is expressed (mirrors the backend value modes). */
export type ValueMode = "percent" | "fixed" | "free" | "count" | "flag";

/**
 * The value modes each benefit type allows — kept in sync with the backend's
 * VALUE_MODE_MATRIX so the Add-benefit form can only build valid payloads.
 * scope_type "any" is valid for every type, so the mobile form fixes it to
 * "any" and skips per-item target selection (that lives on the web).
 */
export const BENEFIT_TYPES: { value: BenefitType; label: string; modes: ValueMode[] }[] = [
  { value: "package_discount", label: "Package discount", modes: ["percent", "fixed", "free"] },
  { value: "attraction_discount", label: "Attraction discount", modes: ["percent", "fixed", "free"] },
  { value: "event_discount", label: "Event discount", modes: ["percent", "fixed", "free"] },
  { value: "addon_discount", label: "Add-on discount", modes: ["percent", "fixed", "free"] },
  { value: "free_entry_pass", label: "Free entry pass", modes: ["count"] },
  { value: "guest_pass", label: "Guest pass", modes: ["count"] },
  { value: "priority_booking", label: "Priority booking", modes: ["flag"] },
  { value: "member_only_access", label: "Member-only access", modes: ["flag"] },
  { value: "birthday_reward", label: "Birthday reward", modes: ["free", "percent", "fixed", "count"] },
];

export const VALUE_MODE_LABELS: Record<ValueMode, string> = {
  percent: "% off",
  fixed: "$ off",
  free: "Free",
  count: "Quantity",
  flag: "Enabled",
};

/** A benefit attached to a plan, flattened for the benefits panel. */
export type PlanBenefit = {
  id: number;
  label: string;
  type: string;
  active: boolean;
  detail: string | null;
};

type RawBenefit = {
  id: number;
  label?: string | null;
  benefit_type?: string | null;
  value_mode?: ValueMode | null;
  value?: number | string | null;
  period?: string | null;
  is_active?: boolean | null;
  [key: string]: unknown;
};

/** Title-case a snake_case benefit_type like "package_discount" → "Package Discount". */
function humanizeType(type: string | null | undefined): string {
  if (!type) return "Benefit";
  return type
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** A short human value like "20% off" / "$5 off" / "3 included" for a benefit. */
function benefitDetail(b: RawBenefit): string | null {
  const value = b.value != null ? Number(b.value) : null;
  switch (b.value_mode) {
    case "percent":
      return value ? `${value}% off` : "% off";
    case "fixed":
      return value ? `$${value.toFixed(2)} off` : "$ off";
    case "free":
      return "Free";
    case "count":
      return value ? `${value} included` : null;
    case "flag":
      return "Enabled";
    default:
      return null;
  }
}

/** GET /api/membership-plans/{id}/benefits — the plan's configured benefits. */
export async function fetchPlanBenefits(
  token: string,
  planId: number,
): Promise<PlanBenefit[]> {
  const res = await apiRequest<{ data?: RawBenefit[] }>(
    `/api/membership-plans/${planId}/benefits`,
    { token },
  );
  const list = Array.isArray(res.data) ? res.data : [];
  return list
    .filter((b): b is RawBenefit => !!b && typeof b.id === "number")
    .map((b) => ({
      id: b.id,
      label: b.label?.trim() || humanizeType(b.benefit_type),
      type: humanizeType(b.benefit_type),
      active: b.is_active !== false,
      detail: benefitDetail(b),
    }));
}

/** Where a benefit applies. "any" covers every item of the benefit's type. */
export type ScopeType = "any" | "package" | "attraction" | "event" | "addon" | "location";

export type CreateBenefitPayload = {
  benefitType: BenefitType;
  label?: string;
  valueMode: ValueMode;
  value: number;
  /** "any" or a specific target type (package/attraction/event/addon/location). */
  scopeType: ScopeType;
  /** The specific target id when scopeType isn't "any"; null otherwise. */
  scopeId: number | null;
  /** Redemption cap per the benefit's period; null = unlimited. */
  maxRedemptions: number | null;
  priority: number;
  isStackable: boolean;
  requiresManualRedemption: boolean;
  isActive: boolean;
};

/** POST /api/membership-plans/{id}/benefits — create an enforceable benefit. */
export async function createBenefit(
  token: string,
  planId: number,
  payload: CreateBenefitPayload,
): Promise<void> {
  await apiRequest(`/api/membership-plans/${planId}/benefits`, {
    method: "POST",
    token,
    body: {
      benefit_type: payload.benefitType,
      label: payload.label || null,
      scope_type: payload.scopeType,
      scope_id: payload.scopeType === "any" ? null : payload.scopeId,
      value_mode: payload.valueMode,
      value: payload.value,
      max_redemptions: payload.maxRedemptions,
      priority: payload.priority,
      is_stackable: payload.isStackable,
      requires_manual_redemption: payload.requiresManualRedemption,
      is_active: payload.isActive,
    },
  });
}

/** DELETE /api/membership-plans/{planId}/benefits/{benefitId}. */
export async function deleteBenefit(
  token: string,
  planId: number,
  benefitId: number,
): Promise<void> {
  await apiRequest(`/api/membership-plans/${planId}/benefits/${benefitId}`, {
    method: "DELETE",
    token,
  });
}

export type CancellationMode = "immediate" | "end_of_term" | "staff_only";

/**
 * The full set of fields the create/edit plan form collects — mirrors the web
 * plan modal. Keys are snake_case so the object is sent to the backend as-is.
 */
export type PlanFormValues = {
  name: string;
  description?: string | null;
  price: number;
  billing_cycle: BillingCycle;
  trial_days?: number | null;
  term_length_months?: number | null;
  season_start_date?: string | null;
  season_end_date?: string | null;
  usage_type: UsageType;
  visits_per_term?: number | null;
  uses_per_term?: number | null;
  punch_card_total?: number | null;
  unlimited_visits_per_term?: boolean;
  location_access_mode: LocationAccessMode;
  location_id?: number | null;
  approved_location_ids?: number[];
  billing_account_id?: number | null;
  cancellation_mode: CancellationMode;
  grace_period_days?: number | null;
  failed_payment_retry_days?: number | null;
  requires_photo?: boolean;
  is_family_or_group?: boolean;
  is_active?: boolean;
};

/** Create (POST) or update (PUT) a plan. Values are sent to the backend as-is. */
export async function savePlan(
  token: string,
  id: number | null,
  values: PlanFormValues,
): Promise<MembershipPlanRow> {
  const res = await apiRequest<{ data: RawPlan }>(
    id ? `/api/membership-plans/${id}` : "/api/membership-plans",
    { method: id ? "PUT" : "POST", token, body: values },
  );
  return mapPlan(res.data);
}

/** An Authorize.Net billing account, for the plan form's Billing Account picker. */
export type BillingAccount = {
  id: number;
  label: string;
  locationName: string | null;
};

type RawAccount = {
  id: number;
  label?: string | null;
  location?: { name?: string | null } | null;
};

/** GET /api/authorize-net/accounts/all — accounts a plan can bill through. */
export async function fetchBillingAccounts(
  token: string,
): Promise<BillingAccount[]> {
  const res = await apiRequest<{ data?: RawAccount[] }>(
    "/api/authorize-net/accounts/all",
    { token },
  );
  const list = Array.isArray(res.data) ? res.data : [];
  return list
    .filter((a): a is RawAccount => !!a && typeof a.id === "number")
    .map((a) => ({
      id: a.id,
      label: a.label?.trim() || `Account #${a.id}`,
      locationName: a.location?.name?.trim() || null,
    }));
}
