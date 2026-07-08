import { apiRequest } from "../lib/api";

/** Package active-state, mirrored from the backend `is_active` flag. */
export type PackageStatus = "active" | "inactive";

/** Flattened package row backing the Packages list cards. */
export type PackageRow = {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  /** Max guests for the package (backend `max_participants`). */
  capacity: number | null;
  /** Booking buffer in hours (backend `min_booking_notice_hours`); null = none. */
  bufferHours: number | null;
  status: PackageStatus;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
};

/** Raw package as returned by GET /api/packages (PackageResource, snake_case). */
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
  location?: { id?: number; name?: string | null } | null;
  location_id?: number | null;
};

// Backend caps per_page at 50; request the max so the list loads in one page.
const PER_PAGE = 50;
// Fail fast instead of leaving the list stuck on the skeleton forever.
const REQUEST_TIMEOUT_MS = 15000;

function mapPackage(raw: RawPackage): PackageRow {
  const cap = raw.max_participants == null ? null : Number(raw.max_participants);
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
  };
}

// Is this a package-shaped record (has a numeric id)? Used by the fallback
// deep-search so we can find the list wherever Laravel nests it.
function looksLikePackage(v: unknown): v is RawPackage {
  return !!v && typeof v === "object" && typeof (v as { id?: unknown }).id === "number";
}

/**
 * Pull the package array out of the response, tolerating every shape the API
 * has produced: a bare array, `{ data: { packages: [...] } }`, a paginated
 * resource collection (`packages: { data: [...] }`), `{ data: [...] }`, or
 * `{ packages: [...] }`. Falls back to a shallow search for the first array of
 * package-shaped objects so a serialization change can't blank the list.
 */
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
  /** Fallback scope hint; the backend also resolves the user from the token. */
  userId?: number;
  /** Restrict to one location; omit for all the user can access. */
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/packages — the same endpoint the web Packages page uses. Returns the
 * package list the user can access (auth-scoped to their company/location).
 */
export async function fetchPackages({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<PackageRow[]> {
  const params = new URLSearchParams({ per_page: String(PER_PAGE) });
  if (userId != null) params.append("user_id", String(userId));
  if (locationId != null) params.append("location_id", String(locationId));

  // Abort the request if it outlives the timeout, and also honor any caller
  // signal, so the screen never hangs on the skeleton indefinitely.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    const res = await apiRequest<unknown>(`/api/packages?${params.toString()}`, {
      token,
      signal: controller.signal,
    });
    return extractPackages(res).map(mapPackage);
  } catch (err) {
    if (timedOut) {
      throw new Error("Request timed out. Pull to refresh to try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

type ToggleResponse = {
  success?: boolean;
  data?: { package_id?: number; is_active?: boolean | null };
};

/**
 * PATCH /api/packages/{id}/toggle-status — flips a package's active state.
 * Returns the new active flag reported by the backend.
 */
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
