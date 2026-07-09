import { apiRequest } from "../lib/api";

export type PackageStatus = "active" | "inactive";

/** Flattened package row backing the Packages list cards. */
export type PackageRow = {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  capacity: number | null;
  bufferHours: number | null;
  status: PackageStatus;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  packageType: string;
  displayOrder: number;
};

/** Raw package as returned by GET /api/mobile/packages (MobilePackageResource). */
type RawPackage = {
  id: number;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  price?: number | string | null;
  max_participants?: number | string | null;
  min_booking_notice_hours?: number | string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  package_type?: string | null;
  display_order?: number | string | null;
  location?: { id?: number; name?: string | null } | null;
  location_id?: number | null;
};

function mapPackage(raw: RawPackage): PackageRow {
  const cap =
    raw.max_participants == null ? null : Number(raw.max_participants);
  const buffer =
    raw.min_booking_notice_hours == null
      ? null
      : Number(raw.min_booking_notice_hours);
  return {
    id: raw.id,
    name: raw.name?.trim() || "Untitled Package",
    description: raw.description?.trim() || "",
    category: raw.category?.trim() || "Uncategorized",
    price: Number(raw.price ?? 0),
    capacity: cap != null && !Number.isNaN(cap) ? cap : null,
    bufferHours: buffer != null && !Number.isNaN(buffer) ? buffer : null,
    status: raw.is_active ? "active" : "inactive",
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
    packageType: raw.package_type?.trim() || "",
    displayOrder: Number(raw.display_order ?? 0) || 0,
  };
}

/** Regular (or unset) package_type — the web `/packages` filter; custom types
 *  live on the separate Custom Packages screen. */
export function isRegularPackage(p: PackageRow): boolean {
  return !p.packageType || p.packageType === "regular";
}

// Is this a package-shaped record (has a numeric id)? Used by the fallback
// deep-search so we can find the list wherever the response nests it.
function looksLikePackage(v: unknown): v is RawPackage {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { id?: unknown }).id === "number"
  );
}

/** Pull the package array out of any response shape (bare array, `{data:{packages}}`,
 *  `{data}`, `{packages}`), falling back to a tree search so a shape change can't blank it. */
function extractPackages(res: unknown): RawPackage[] {
  const asArray = (v: unknown): RawPackage[] | null =>
    Array.isArray(v) && (v.length === 0 || looksLikePackage(v[0]))
      ? (v as RawPackage[])
      : null;

  if (asArray(res)) return res as RawPackage[];

  const root = (res ?? {}) as Record<string, unknown>;
  const data = (root.data ?? {}) as Record<string, unknown>;

  const candidates: unknown[] = [
    (data.packages as { data?: unknown })?.data, // packages: { data: [...] }
    data.packages,
    data.data,
    root.packages,
    root.data,
  ];
  for (const c of candidates) {
    const arr = asArray(c);
    if (arr) return arr;
  }

  // Last resort: walk the object tree for the first package-shaped array.
  const seen = new Set<unknown>();
  const stack: unknown[] = [res];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    const arr = asArray(node);
    if (arr) return arr;
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return [];
}

type FetchParams = {
  token: string;
  userId?: number;
  locationId?: number;
  search?: string;
  signal?: AbortSignal;
};

/** GET /api/mobile/packages — the lightweight, role-scoped package list (scalars + location,
 *  one response). Replaces the heavy /api/packages index that OOM-crashed Hermes on base64 images. */
export async function fetchPackages({
  token,
  userId,
  locationId,
  search,
  signal,
}: FetchParams): Promise<PackageRow[]> {
  const params = new URLSearchParams();
  if (userId != null) params.append("user_id", String(userId));
  if (locationId != null) params.append("location_id", String(locationId));
  const q = search?.trim();
  if (q) params.append("search", q);
  const qs = params.toString();

  const res = await apiRequest<unknown>(
    `/api/mobile/packages${qs ? `?${qs}` : ""}`,
    { token, signal },
  );
  return extractPackages(res).map(mapPackage);
}

type ToggleResponse = {
  success?: boolean;
  data?: { package_id?: number; is_active?: boolean | null };
};

/** PATCH /api/packages/{id}/toggle-status — flips active state, returns the new flag.
 *  A mutation, so it stays on the standard endpoint (the mobile endpoint is list-only). */
export async function togglePackageStatus(
  token: string,
  id: number,
): Promise<boolean> {
  const res = await apiRequest<ToggleResponse>(
    `/api/packages/${id}/toggle-status`,
    { method: "PATCH", token },
  );
  return !!res.data?.is_active;
}
