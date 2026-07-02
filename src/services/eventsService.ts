import { apiRequest } from "../lib/api";

/** Event active-state, mirrored from the web `is_active` flag. */
export type EventStatus = "active" | "inactive";

/** How an event's dates are defined (single day vs a range). */
export type EventDateType = "one_time" | "date_range";

/** An add-on attached to an event (used by the Create Purchase form). */
export type EventAddOn = {
  id: number;
  name: string;
  price: number;
  description: string | null;
  image: string | null;
  minQuantity: number;
  maxQuantity: number;
};

/** Flattened event row backing the Events list + KPI cards. */
export type EventRow = {
  id: number;
  name: string;
  description: string;
  dateType: EventDateType;
  startDate: string;
  endDate: string | null;
  timeStart: string;
  timeEnd: string;
  intervalMinutes: number;
  /** null means "Unlimited". */
  maxBookingsPerSlot: number | null;
  price: number;
  features: string[];
  status: EventStatus;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  images: string[];
  addOns: EventAddOn[];
  /** Preferred display order of add-ons, by id. */
  addOnsOrder: number[];
};

type RawEventAddOn = {
  id: number;
  name?: string | null;
  price?: number | string | null;
  description?: string | null;
  image?: string | null;
  min_quantity?: number | string | null;
  max_quantity?: number | string | null;
};

/** Raw event as returned by GET /api/events (snake_case). */
type RawEvent = {
  id: number;
  name?: string | null;
  description?: string | null;
  date_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  interval_minutes?: number | string | null;
  max_bookings_per_slot?: number | string | null;
  price?: number | string | null;
  features?: string[] | null;
  add_ons_order?: number[] | null;
  is_active?: boolean | null;
  created_at?: string | null;
  location?: { id?: number; name?: string | null } | null;
  location_id?: number | null;
  image?: string | string[] | null;
  add_ons?: RawEventAddOn[] | null;
};

// Web loads a single large page and filters/sorts client-side; mirror that.
const PER_PAGE = 100;

function mapEventAddOn(a: RawEventAddOn): EventAddOn {
  return {
    id: a.id,
    name: a.name?.trim() || "Add-on",
    price: Number(a.price ?? 0),
    description: a.description?.trim() || null,
    image: a.image ?? null,
    minQuantity: Number(a.min_quantity ?? 0),
    maxQuantity: Number(a.max_quantity ?? 99),
  };
}

function mapEvent(raw: RawEvent): EventRow {
  const maxRaw =
    raw.max_bookings_per_slot == null ? null : Number(raw.max_bookings_per_slot);
  return {
    id: raw.id,
    name: raw.name?.trim() || "Untitled Event",
    description: raw.description?.trim() || "",
    dateType: (raw.date_type === "date_range" ? "date_range" : "one_time") as EventDateType,
    startDate: raw.start_date ?? "",
    endDate: raw.end_date ?? null,
    timeStart: raw.time_start ?? "",
    timeEnd: raw.time_end ?? "",
    intervalMinutes: Number(raw.interval_minutes ?? 60),
    maxBookingsPerSlot: maxRaw && !Number.isNaN(maxRaw) ? maxRaw : null,
    price: Number(raw.price ?? 0),
    features: (raw.features ?? []).filter((f): f is string => typeof f === "string"),
    status: raw.is_active ? "active" : "inactive",
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
    images: raw.image ? (Array.isArray(raw.image) ? raw.image : [raw.image]) : [],
    addOns: (raw.add_ons ?? []).map(mapEventAddOn),
    addOnsOrder: raw.add_ons_order ?? [],
  };
}

// The /events response has varied over time: `data` may be an array directly,
// or an object wrapping `events` / `data`. Mirror the web's resilient reader.
function extractEvents(res: unknown): RawEvent[] {
  if (Array.isArray(res)) return res as RawEvent[];
  const data = (res as { data?: unknown })?.data;
  if (Array.isArray(data)) return data as RawEvent[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.events)) return obj.events as RawEvent[];
    if (Array.isArray(obj.data)) return obj.data as RawEvent[];
  }
  return [];
}

type FetchParams = {
  token: string;
  userId: number;
  /** Restrict to one location; omit for all the user can access. */
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/events — the same endpoint the web `/events` page uses. Returns the
 * event list the user can access.
 */
export async function fetchEvents({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<EventRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    user_id: String(userId),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<unknown>(`/api/events?${params.toString()}`, {
    token,
    signal,
  });
  return extractEvents(res).map(mapEvent);
}

/** Payload for POST /api/events — mirrors the web CreateEventData. */
export type CreateEventInput = {
  location_id: number;
  name: string;
  description?: string;
  /** Base64 data URL; omitted when no image was chosen. */
  image?: string;
  date_type: EventDateType;
  start_date: string;
  end_date?: string;
  time_start: string;
  time_end: string;
  interval_minutes: number;
  max_bookings_per_slot?: number | null;
  price: number;
  features: string[];
  add_on_ids?: number[];
  add_ons_order?: number[];
  is_active: boolean;
};

type CreateEventResponse = {
  success: boolean;
  data: RawEvent & { id: number };
  message?: string;
};

/** POST /api/events — create an event (same endpoint as the web). */
export async function createEvent(
  token: string,
  input: CreateEventInput,
): Promise<EventRow> {
  const res = await apiRequest<CreateEventResponse>("/api/events", {
    method: "POST",
    token,
    body: input,
  });
  return mapEvent(res.data);
}
