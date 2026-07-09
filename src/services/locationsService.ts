import { apiRequest } from "../lib/api";

/** A company location, for plan location + approved-location pickers. */
export type LocationOption = { id: number; name: string };

type RawLocation = { id: number; name?: string | null };

/**
 * GET /api/mobile/locations — the active locations list, mobile-optimized
 * (scalar columns only, no company/packages relations). The full `/api/locations`
 * endpoint is deliberately avoided here because it's too heavy for mobile and can
 * time out. Fetched lazily when a form that needs the location list opens.
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
    .map((l) => ({ id: l.id, name: l.name?.trim() || `Location #${l.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
