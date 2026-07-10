import { apiRequest } from "../lib/api";

/**
 * A company location for pickers and the "Your Location" banner. `address` is a
 * display-ready composed string (kept for existing picker consumers); the raw
 * scalar fields (streetAddress/city/state/zipCode/phone/email/timezone) are also
 * exposed for callers that need the full breakdown.
 */
export type LocationOption = {
  id: number;
  name: string;
  address: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
};

type RawLocation = {
  id: number;
  name?: string | null;
  address?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
};

function locationAddress(l: RawLocation): string {
  if (l.address?.trim()) return l.address.trim();
  if (l.street_address?.trim()) return l.street_address.trim();
  return [l.city, l.state].filter((s) => s?.trim()).join(", ");
}

function mapLocation(l: RawLocation): LocationOption {
  return {
    id: l.id,
    name: l.name?.trim() || `Location #${l.id}`,
    address: locationAddress(l),
    streetAddress: l.address?.trim() || l.street_address?.trim() || null,
    city: l.city?.trim() || null,
    state: l.state?.trim() || null,
    zipCode: l.zip_code?.trim() || null,
    phone: l.phone?.trim() || null,
    email: l.email?.trim() || null,
    timezone: l.timezone?.trim() || null,
  };
}

/**
 * GET /api/mobile/locations — the active locations list, mobile-optimized
 * (scalar columns only, no company/packages relations). The full `/api/locations`
 * endpoint is deliberately avoided here because it's too heavy for mobile and can
 * crash Hermes (it eager-loads packages with base64 images). Fetched lazily when
 * a form that needs the location list opens.
 */
export async function fetchLocations(
  token: string,
  signal?: AbortSignal,
): Promise<LocationOption[]> {
  const res = await apiRequest<{ data?: RawLocation[] } | RawLocation[]>(
    "/api/mobile/locations",
    { token, signal },
  );
  const list = Array.isArray(res) ? res : (res.data ?? []);
  return list
    .filter((l): l is RawLocation => !!l && typeof l.id === "number")
    .map(mapLocation)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A single location by id, sourced from the lightweight `/api/mobile/locations`
 * list (NOT the heavy `/api/locations/{id}`). Returns null if not found — e.g.
 * an inactive location the mobile list omits — so callers can fall back.
 */
export async function fetchLocationById(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<LocationOption | null> {
  const list = await fetchLocations(token, signal);
  return list.find((l) => l.id === id) ?? null;
}

/** Editable location fields (mirrors the web EditLocationModal payload). */
export type UpdateLocationPayload = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  email: string;
};

/**
 * PUT /api/locations/{id} — update a location's contact details (the same
 * endpoint + payload the web "Edit Location" modal uses). Throws ApiError on
 * validation (422) / permission (403) / other failures.
 */
export async function updateLocation(
  token: string,
  id: number,
  payload: UpdateLocationPayload,
): Promise<void> {
  await apiRequest(`/api/locations/${id}`, {
    method: "PUT",
    token,
    body: payload,
  });
}
