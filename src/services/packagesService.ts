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

/* ------------------------------------------------------------------ */
/* Detail / mutations (View, Edit, Duplicate, Delete)                  */
/* ------------------------------------------------------------------ */

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One availability window shown read-only on the detail view. */
export type PackageScheduleView = {
  id: number;
  availabilityType: string;
  dayConfiguration: string[];
  timeSlotStart: string | null;
  timeSlotEnd: string | null;
  timeSlotInterval: number | null;
  isActive: boolean;
};

/** Full package hydrated from GET /api/packages/{id} for the detail view. Safe to
 *  load per-package (one record) even though it carries relations + image. */
export type PackageDetail = {
  id: number;
  name: string;
  description: string;
  category: string;
  packageType: string;
  isActive: boolean;
  features: string[];
  price: number;
  pricePerAdditional: number | null;
  pricePerAdditional30min: number | null;
  pricePerAdditional1hr: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  duration: number | null;
  durationUnit: string;
  bookingWindowDays: number | null;
  minBookingNoticeHours: number | null;
  hasGuestOfHonor: boolean;
  partialPaymentPercentage: number | null;
  partialPaymentFixed: number | null;
  customerNotes: string;
  invitationDownloadLink: string;
  displayOrder: number;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  attractions: { id: number; name: string; price: number | null }[];
  addOns: { id: number; name: string; price: number | null }[];
  rooms: { id: number; name: string; capacity: number | null }[];
  promos: { id: number; name: string; code: string }[];
  giftCards: { id: number; code: string }[];
  schedules: PackageScheduleView[];
  /** Kept for the duplicate round-trip; NOT rendered (mirrors the web detail). */
  image: string[];
};

type RawRelation = Record<string, unknown>;
const rel = (v: unknown): RawRelation[] =>
  Array.isArray(v) ? (v as RawRelation[]) : [];
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** GET /api/packages/{id} — the full package (relations + scalars) for the detail
 *  view and as the source for a duplicate. One record, so no OOM concern. */
export async function fetchPackageDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<PackageDetail> {
  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/packages/${id}`,
    { token, signal },
  );
  const d = res.data ?? {};
  const loc = (d.location ?? {}) as RawRelation;
  const rawImage = d.image;
  return {
    id: Number(d.id),
    name: str(d.name) || "Untitled Package",
    description: str(d.description),
    category: str(d.category) || "Uncategorized",
    packageType: str(d.package_type),
    isActive: !!d.is_active,
    features: Array.isArray(d.features)
      ? (d.features as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    price: Number(d.price ?? 0),
    pricePerAdditional: numOrNull(d.price_per_additional),
    pricePerAdditional30min: numOrNull(d.price_per_additional_30min),
    pricePerAdditional1hr: numOrNull(d.price_per_additional_1hr),
    minParticipants: numOrNull(d.min_participants),
    maxParticipants: numOrNull(d.max_participants),
    duration: numOrNull(d.duration),
    durationUnit: str(d.duration_unit) || "hours",
    bookingWindowDays: numOrNull(d.booking_window_days),
    minBookingNoticeHours: numOrNull(d.min_booking_notice_hours),
    hasGuestOfHonor: !!d.has_guest_of_honor,
    partialPaymentPercentage: numOrNull(d.partial_payment_percentage),
    partialPaymentFixed: numOrNull(d.partial_payment_fixed),
    customerNotes: str(d.customer_notes),
    invitationDownloadLink: str(d.invitation_download_link),
    displayOrder: Number(d.display_order ?? 0) || 0,
    locationId: numOrNull(loc.id) ?? numOrNull(d.location_id),
    locationName: str(loc.name),
    createdAt: (d.created_at as string) ?? null,
    attractions: rel(d.attractions).map((a) => ({
      id: Number(a.id),
      name: str(a.name) || `Attraction #${a.id}`,
      price: numOrNull(a.price),
    })),
    addOns: rel(d.add_ons).map((a) => ({
      id: Number(a.id),
      name: str(a.name) || `Add-on #${a.id}`,
      price: numOrNull(a.price),
    })),
    rooms: rel(d.rooms).map((r) => ({
      id: Number(r.id),
      name: str(r.name) || `Room #${r.id}`,
      capacity: numOrNull(r.capacity),
    })),
    promos: rel(d.promos).map((p) => ({
      id: Number(p.id),
      name: str(p.name),
      code: str(p.code),
    })),
    giftCards: rel(d.gift_cards).map((g) => ({
      id: Number(g.id),
      code: str(g.code) || `#${g.id}`,
    })),
    schedules: rel(d.availability_schedules).map((s) => ({
      id: Number(s.id),
      availabilityType: str(s.availability_type) || "daily",
      dayConfiguration: Array.isArray(s.day_configuration)
        ? (s.day_configuration as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [],
      timeSlotStart: (s.time_slot_start as string) ?? null,
      timeSlotEnd: (s.time_slot_end as string) ?? null,
      timeSlotInterval: numOrNull(s.time_slot_interval),
      isActive: s.is_active !== false,
    })),
    image: Array.isArray(rawImage)
      ? (rawImage as unknown[]).filter((x): x is string => typeof x === "string")
      : typeof rawImage === "string" && rawImage
        ? [rawImage]
        : [],
  };
}

/** All fields the mobile Edit screen can change — full parity with the web
 *  admin's Edit Package PUT payload (scalars + relations + features + media).
 *  Availability schedules are saved separately via
 *  {@link savePackageAvailabilitySchedules}, exactly as the web does. */
export type UpdatePackageInput = {
  name: string;
  description: string;
  category: string;
  packageType: string;
  features: string[];
  price: number;
  pricePerAdditional: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  duration: number | null;
  durationUnit: string;
  bookingWindowDays: number | null;
  minBookingNoticeHours: number | null;
  hasGuestOfHonor: boolean;
  partialPaymentPercentage: number | null;
  partialPaymentFixed: number | null;
  customerNotes: string;
  invitationDownloadLink: string;
  /** Base64 data URL of a newly picked invitation file; null keeps the current. */
  invitationFile: string | null;
  displayOrder: number | null;
  isActive: boolean;
  /** Base64 data URL of a newly picked image; null keeps the current image. */
  image: string | null;
  attractionIds: number[];
  addonIds: number[];
  /** Add-on NAMES in display order (the key the backend expects). */
  addOnsOrder: string[];
  roomIds: number[];
  promoIds: number[];
  giftCardIds: number[];
};

/** PUT /api/packages/{id} — update every editable field (mirrors the web admin's
 *  Edit Package save). `image`/`invitation_file` are only sent when a new one was
 *  picked, so we never resend the existing base64 payload. */
export async function updatePackage(
  token: string,
  id: number,
  input: UpdatePackageInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    category: input.category,
    package_type: input.packageType || "regular",
    features: input.features,
    price: input.price,
    price_per_additional: input.pricePerAdditional,
    min_participants: input.minParticipants,
    max_participants: input.maxParticipants,
    duration: input.duration,
    duration_unit: input.durationUnit,
    booking_window_days: input.bookingWindowDays,
    min_booking_notice_hours: input.minBookingNoticeHours,
    has_guest_of_honor: input.hasGuestOfHonor,
    partial_payment_percentage: input.partialPaymentPercentage,
    partial_payment_fixed: input.partialPaymentFixed,
    customer_notes: input.customerNotes || null,
    invitation_download_link: input.invitationDownloadLink || null,
    display_order: input.displayOrder,
    is_active: input.isActive,
    attraction_ids: input.attractionIds,
    addon_ids: input.addonIds,
    add_ons_order: input.addOnsOrder,
    room_ids: input.roomIds,
    promo_ids: input.promoIds,
    gift_card_ids: input.giftCardIds,
  };
  // Only send media when a new one was chosen (base64 data URL), matching the
  // web admin — omitting the key leaves the existing image/file untouched.
  if (input.image) body.image = input.image;
  if (input.invitationFile) body.invitation_file = input.invitationFile;
  await apiRequest(`/api/packages/${id}`, { method: "PUT", token, body });
}

/** No duplicate endpoint exists — mirror the web: fetch the source, then POST a
 *  copy (name + " (Copy)", inactive, relations as id arrays). Non-admins are
 *  forced to their own location by the backend regardless of `locationId`. */
export async function duplicatePackage(
  token: string,
  id: number,
  locationId?: number | null,
): Promise<void> {
  const d = await fetchPackageDetail(token, id);
  const body: Record<string, unknown> = {
    name: `${d.name} (Copy)`,
    location_id: locationId ?? d.locationId,
    description: d.description,
    category: d.category,
    package_type: d.packageType || "regular",
    features: d.features,
    price: d.price,
    price_per_additional: d.pricePerAdditional,
    max_participants: d.maxParticipants,
    duration: d.duration,
    duration_unit: d.durationUnit,
    price_per_additional_30min: d.pricePerAdditional30min,
    price_per_additional_1hr: d.pricePerAdditional1hr,
    image: d.image,
    is_active: false,
    partial_payment_percentage: d.partialPaymentPercentage,
    partial_payment_fixed: d.partialPaymentFixed,
    has_guest_of_honor: d.hasGuestOfHonor,
    customer_notes: d.customerNotes || null,
    invitation_download_link: d.invitationDownloadLink || null,
    booking_window_days: d.bookingWindowDays,
    min_booking_notice_hours: d.minBookingNoticeHours,
    attraction_ids: d.attractions.map((a) => a.id),
    addon_ids: d.addOns.map((a) => a.id),
    room_ids: d.rooms.map((r) => r.id),
  };
  await apiRequest("/api/packages", { method: "POST", token, body });
}

/** DELETE /api/packages/{id} — soft-delete (restorable from the web trashed view). */
export async function deletePackage(token: string, id: number): Promise<void> {
  await apiRequest(`/api/packages/${id}`, { method: "DELETE", token });
}

/** Fields the mobile Create form supplies. `locationId` is required by the store
 *  endpoint (the backend forces it to the user's own location for non-admins).
 *  Relations are id arrays; `addOnsOrder` is add-on NAMES in display order (the
 *  key the backend expects), and `image` is a base64 data URL (matches the web). */
export type CreatePackageInput = {
  locationId: number;
  name: string;
  description: string;
  category: string;
  packageType: string;
  price: number;
  pricePerAdditional: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  duration: number;
  durationUnit: string;
  bookingWindowDays: number | null;
  minBookingNoticeHours: number | null;
  hasGuestOfHonor: boolean;
  partialPaymentPercentage: number | null;
  partialPaymentFixed: number | null;
  customerNotes: string;
  displayOrder: number | null;
  isActive: boolean;
  features: string[];
  invitationDownloadLink: string;
  /** Base64 data URL of an uploaded invitation file (PDF/doc/image); null when unused. */
  invitationFile: string | null;
  image: string | null;
  attractionIds: number[];
  addonIds: number[];
  addOnsOrder: string[];
  roomIds: number[];
  promoIds: number[];
  giftCardIds: number[];
};

/** POST /api/packages — create a package (same endpoint + validation as the web).
 *  Availability schedules are NOT accepted here; save them with a follow-up
 *  {@link savePackageAvailabilitySchedules} call, exactly as the web does.
 *  Returns the new package id. */
export async function createPackage(
  token: string,
  input: CreatePackageInput,
): Promise<number> {
  const body: Record<string, unknown> = {
    location_id: input.locationId,
    name: input.name,
    description: input.description,
    category: input.category,
    package_type: input.packageType || "regular",
    features: input.features,
    price: input.price,
    price_per_additional: input.pricePerAdditional,
    min_participants: input.minParticipants,
    max_participants: input.maxParticipants,
    duration: input.duration,
    duration_unit: input.durationUnit,
    booking_window_days: input.bookingWindowDays,
    min_booking_notice_hours: input.minBookingNoticeHours,
    has_guest_of_honor: input.hasGuestOfHonor,
    partial_payment_percentage: input.partialPaymentPercentage,
    partial_payment_fixed: input.partialPaymentFixed,
    customer_notes: input.customerNotes || null,
    invitation_download_link: input.invitationDownloadLink || null,
    invitation_file: input.invitationFile || null,
    display_order: input.displayOrder,
    is_active: input.isActive,
    attraction_ids: input.attractionIds,
    addon_ids: input.addonIds,
    add_ons_order: input.addOnsOrder,
    room_ids: input.roomIds,
    promo_ids: input.promoIds,
    gift_card_ids: input.giftCardIds,
  };
  // Only send an image when one was chosen (base64 data URL, like the web).
  if (input.image) body.image = input.image;

  const res = await apiRequest<{ data?: { id?: number } }>("/api/packages", {
    method: "POST",
    token,
    body,
  });
  return Number(res.data?.id ?? 0);
}

/** One availability window supplied by the Create/Edit form. */
export type PackageScheduleInput = {
  availabilityType: "daily" | "weekly" | "monthly";
  /** [] for daily; day names for weekly; "occurrence-day" for monthly. */
  dayConfiguration: string[];
  timeSlotStart: string; // "HH:MM"
  timeSlotEnd: string; // "HH:MM"
  timeSlotInterval: number; // minutes, min 15
  isActive: boolean;
};

/** PUT /api/packages/{id}/availability-schedules — bulk-replace a package's
 *  schedules (same endpoint the web calls right after creating a package). */
export async function savePackageAvailabilitySchedules(
  token: string,
  packageId: number,
  schedules: PackageScheduleInput[],
): Promise<void> {
  const body = {
    schedules: schedules.map((s) => ({
      availability_type: s.availabilityType,
      day_configuration:
        s.availabilityType === "daily" ? null : s.dayConfiguration,
      time_slot_start: s.timeSlotStart,
      time_slot_end: s.timeSlotEnd,
      time_slot_interval: s.timeSlotInterval,
      is_active: s.isActive,
    })),
  };
  await apiRequest(`/api/packages/${packageId}/availability-schedules`, {
    method: "PUT",
    token,
    body,
  });
}
