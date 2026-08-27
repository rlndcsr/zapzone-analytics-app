import { apiRequest } from "../lib/api";

/**
 * Extra checkboxes shown at checkout — the mobile side of the web admin's
 * Custom Fields page (`/api/custom-fields`). The type column exists because more
 * input types will land later; today the backend only accepts "checkbox".
 */
export type CustomFieldType = "checkbox";

/** Who is asked the question. "both" answers to either side. */
export type CustomFieldAudience = "customer" | "admin" | "both";

export type CustomFieldRow = {
  id: number;
  label: string;
  type: CustomFieldType;
  /** Optional line under the checkbox; "" when the backend sent null. */
  helpText: string;
  isRequired: boolean;
  audience: CustomFieldAudience;
  /** Empty means every one of them — the backend's targeting convention. */
  locationIds: number[];
  packageIds: number[];
  attractionIds: number[];
  eventIds: number[];
  displayOrder: number;
  isActive: boolean;
  /**
   * False when the question covers more venues than the signed-in manager runs,
   * so only a company admin may change it. The list endpoint computes this per
   * row; absent (treated as true) on the create/update responses.
   */
  canManage: boolean;
};

type RawCustomField = {
  id: number;
  label?: string | null;
  type?: string | null;
  help_text?: string | null;
  is_required?: boolean | number | null;
  audience?: string | null;
  location_ids?: unknown;
  package_ids?: unknown;
  attraction_ids?: unknown;
  event_ids?: unknown;
  display_order?: number | string | null;
  is_active?: boolean | number | null;
  can_manage?: boolean | null;
};

type CustomFieldListResponse = {
  success?: boolean;
  data?: RawCustomField[] | null;
};

type CustomFieldItemResponse = {
  success?: boolean;
  message?: string;
  data?: RawCustomField | null;
};

const AUDIENCES: CustomFieldAudience[] = ["customer", "admin", "both"];

const bool = (v: boolean | number | null | undefined): boolean =>
  v === true || v === 1;

/** The targeting columns are json, so a stray null/object must not throw. */
const idList = (v: unknown): number[] =>
  Array.isArray(v)
    ? v
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

function mapField(raw: RawCustomField): CustomFieldRow {
  const audience = (raw.audience ?? "both") as CustomFieldAudience;
  return {
    id: raw.id,
    label: raw.label?.trim() || "Untitled checkbox",
    type: "checkbox",
    helpText: raw.help_text?.trim() || "",
    isRequired: bool(raw.is_required),
    audience: AUDIENCES.includes(audience) ? audience : "both",
    locationIds: idList(raw.location_ids),
    packageIds: idList(raw.package_ids),
    attractionIds: idList(raw.attraction_ids),
    eventIds: idList(raw.event_ids),
    displayOrder: Number(raw.display_order ?? 0) || 0,
    isActive: bool(raw.is_active),
    // Only the list endpoint sets it; a saved row is one the caller just wrote.
    canManage: raw.can_manage !== false,
  };
}

/**
 * GET /api/custom-fields — every question the signed-in account may see, already
 * ordered by `display_order` then id. Managers and attendants get the ones that
 * apply to their venue; the endpoint returns an empty list for an account with
 * no company rather than leaking other tenants' questions.
 */
export async function fetchCustomFields(
  token: string,
  signal?: AbortSignal,
): Promise<CustomFieldRow[]> {
  const res = await apiRequest<CustomFieldListResponse>("/api/custom-fields", {
    token,
    signal,
  });
  return (res?.data ?? []).map(mapField);
}

/**
 * Body for POST/PUT `/api/custom-fields`. The targeting keys are omitted
 * entirely for an unrestricted dimension on create; on update they're sent as
 * empty arrays so clearing a restriction actually clears it.
 */
export type CustomFieldInput = {
  label: string;
  help_text?: string | null;
  is_required?: boolean;
  audience?: CustomFieldAudience;
  is_active?: boolean;
  location_ids?: number[];
  package_ids?: number[];
  attraction_ids?: number[];
  event_ids?: number[];
};

/** POST /api/custom-fields — adds a checkbox. */
export async function createCustomField(
  token: string,
  input: CustomFieldInput,
): Promise<CustomFieldRow | null> {
  const res = await apiRequest<CustomFieldItemResponse>("/api/custom-fields", {
    method: "POST",
    token,
    body: input,
  });
  return res?.data ? mapField(res.data) : null;
}

/** PUT /api/custom-fields/{id} — edits one. */
export async function updateCustomField(
  token: string,
  id: number,
  input: CustomFieldInput,
): Promise<CustomFieldRow | null> {
  const res = await apiRequest<CustomFieldItemResponse>(
    `/api/custom-fields/${id}`,
    { method: "PUT", token, body: input },
  );
  return res?.data ? mapField(res.data) : null;
}

/**
 * DELETE /api/custom-fields/{id} — soft-deletes the question. Answers already
 * collected are kept: the response rows copy the label at answer time.
 */
export async function deleteCustomField(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest<{ success?: boolean; message?: string }>(
    `/api/custom-fields/${id}`,
    { method: "DELETE", token },
  );
}
