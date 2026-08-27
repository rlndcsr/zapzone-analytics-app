import { apiRequest } from "../lib/api";

/**
 * Everything a targeting picker needs in one request — the venues plus every
 * package, attraction and event the signed-in staff member may point something
 * at. Same `/api/targeting-options` endpoint the web picker uses; it selects
 * narrow columns on purpose (package and attraction rows carry image payloads
 * measured in megabytes).
 */
export type TargetingVenue = { id: number; name: string };

export type TargetingItem = {
  id: number;
  name: string;
  locationId: number;
  /** "" when the item type has no category (events) or none was set. */
  category: string;
};

export type TargetingOptions = {
  venues: TargetingVenue[];
  packages: TargetingItem[];
  attractions: TargetingItem[];
  events: TargetingItem[];
};

type RawItem = {
  id?: number | string | null;
  name?: string | null;
  location_id?: number | string | null;
  category?: string | null;
};

type TargetingOptionsResponse = {
  success?: boolean;
  data?: {
    locations?: RawItem[] | null;
    packages?: RawItem[] | null;
    attractions?: RawItem[] | null;
    events?: RawItem[] | null;
  } | null;
};

const mapItem = (raw: RawItem): TargetingItem => ({
  id: Number(raw.id ?? 0),
  name: raw.name?.trim() || "Untitled",
  locationId: Number(raw.location_id ?? 0),
  category: raw.category?.trim() || "",
});

const mapList = (rows: RawItem[] | null | undefined): TargetingItem[] =>
  (rows ?? []).map(mapItem).filter((item) => item.id > 0);

/**
 * GET /api/targeting-options. Returns empty lists (never throws on shape) when
 * the account has no company or venue to scope by, which is what the backend
 * answers in that case too.
 */
export async function fetchTargetingOptions(
  token: string,
  signal?: AbortSignal,
): Promise<TargetingOptions> {
  const res = await apiRequest<TargetingOptionsResponse>(
    "/api/targeting-options",
    { token, signal },
  );
  const data = res?.data;

  return {
    venues: mapList(data?.locations).map(({ id, name }) => ({ id, name })),
    packages: mapList(data?.packages),
    attractions: mapList(data?.attractions),
    events: mapList(data?.events),
  };
}
