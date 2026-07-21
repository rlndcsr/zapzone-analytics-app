import { apiRequest, apiUrl } from "../lib/api";
import type {
  AppliedDiscount as PricingAppliedDiscount,
  AppliedFee as PricingAppliedFee,
} from "./pricingService";

/** Booking status enum exactly as stored by the backend. */
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked-in"
  | "completed"
  | "cancelled";

/** Flattened booking row used by the calendar grid / agenda. */
export type CalendarBooking = {
  id: number;
  referenceNumber: string | null;
  status: string;
  date: string;
  time: string | null;
  participants: number;
  totalAmount: number;
  amountPaid: number;
  packageName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  roomName: string;
  duration: number | null;
  durationUnit: string;
  paymentMethod: string | null;
  locationName: string;
  createdAt: string | null;
};

export type BookingAddOn = {
  id: number;
  name: string;
  quantity: number;
  priceAtBooking: number;
};

export type AppliedFee = {
  name: string;
  amount: number;
  applicationType: string;
};

/** Full booking detail backing the "Booking Details" sheet. */
export type BookingDetail = {
  id: number;
  referenceNumber: string | null;
  status: string;
  type: string;
  date: string;
  time: string | null;
  duration: number;
  durationUnit: string;
  participants: number;
  packageName: string;
  packageId: number | null;
  packagePrice: number | null;
  locationId: number | null;
  locationName: string;
  customerId: number | null;
  roomName: string | null;
  roomId: number | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  guestOfHonorName: string | null;
  guestOfHonorAge: number | null;
  guestOfHonorGender: string | null;
  addOns: BookingAddOn[];
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string | null;
  amountPaid: number;
  appliedFees: AppliedFee[];
  customerNotes: string | null;
  internalNotes: string | null;
  createdAt: string | null;
};

/** Raw shape of a booking in the list response (index select set). */
type RawBooking = {
  id: number;
  reference_number?: string | null;
  status?: string;
  booking_date?: string | null;
  booking_time?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  participants?: number | string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  payment_method?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  package?: { name?: string | null } | null;
  room?: { name?: string | null } | null;
  location?: { name?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

/** Raw shape of the full booking model returned by GET /api/bookings/{id}. */
type RawBookingDetail = RawBooking & {
  type?: string | null;
  location_id?: number | null;
  customer_id?: number | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  internal_notes?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_of_honor_name?: string | null;
  guest_of_honor_age?: number | null;
  guest_of_honor_gender?: string | null;
  customer_notes?: string | null;
  notes?: string | null;
  package_id?: number | null;
  room_id?: number | null;
  applied_fees?:
    | {
        fee_name?: string;
        fee_amount?: number | string;
        fee_application_type?: string;
      }[]
    | null;
  package?: {
    id?: number | null;
    name?: string | null;
    price?: number | string | null;
  } | null;
  room?: { id?: number | null; name?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  add_ons?: RawAddOn[] | null;
  addOns?: RawAddOn[] | null;
};

type RawAddOn = {
  id: number;
  name?: string | null;
  pivot?: {
    quantity?: number | string | null;
    price_at_booking?: number | string | null;
  } | null;
};

type BookingsListResponse = {
  success: boolean;
  data: {
    bookings: RawBooking[];
    pagination: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
};

type BookingDetailResponse = { success: boolean; data: RawBookingDetail };

// Backend caps per_page at 100; there's no date-range filter, so we page all.
const PER_PAGE = 100;
// Safety cap (~10,000 most-recent bookings) to avoid an unbounded paging loop.
const SYNC_MAX_PAGES = 100;

/** "2026-06-13T00:00:00Z" | "2026-06-13" -> "2026-06-13". */
function toDateKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(raw);
  return match ? match[0] : null;
}

/** "13:00" | "13:00:00" | "2026-06-13T13:00:00Z" -> "13:00". */
function toTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = /(\d{2}):(\d{2})/.exec(raw);
  return match ? `${match[1]}:${match[2]}` : null;
}

function customerName(
  customer:
    | { first_name?: string | null; last_name?: string | null }
    | null
    | undefined,
  guestName: string | null | undefined,
): string {
  const full = customer
    ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
    : "";
  return full || guestName?.trim() || "Guest";
}

function mapBooking(raw: RawBooking, date: string): CalendarBooking {
  const durationRaw = raw.duration == null ? null : Number(raw.duration);
  return {
    id: raw.id,
    referenceNumber: raw.reference_number ?? null,
    status: raw.status ?? "pending",
    date,
    time: toTime(raw.booking_time),
    participants: Number(raw.participants ?? 0),
    totalAmount: Number(raw.total_amount ?? 0),
    amountPaid: Number(raw.amount_paid ?? 0),
    packageName: raw.package?.name?.trim() || "Booking",
    customerName: customerName(raw.customer, raw.guest_name),
    customerEmail: raw.customer?.email?.trim() || raw.guest_email?.trim() || null,
    customerPhone: raw.customer?.phone?.trim() || raw.guest_phone?.trim() || null,
    roomName: raw.room?.name?.trim() || "",
    duration:
      durationRaw != null && !Number.isNaN(durationRaw) ? durationRaw : null,
    durationUnit: raw.duration_unit ?? "minutes",
    paymentMethod: raw.payment_method ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
  };
}

type FetchParams = { token: string; locationId?: number; signal?: AbortSignal };

/** One page of the bookings index, newest-first. */
async function fetchPage(
  page: number,
  extra: Record<string, string>,
  { token, locationId, signal }: FetchParams,
): Promise<BookingsListResponse> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    page: String(page),
    sort_by: "booking_date",
    sort_order: "desc",
    ...extra,
  });
  if (locationId != null) params.append("location_id", String(locationId));
  return apiRequest<BookingsListResponse>(
    `/api/bookings?${params.toString()}`,
    {
      token,
      signal,
    },
  );
}

/** Every booking, paged newest-first. Callers filter by date and cache it. */
export async function fetchAllBookings({
  token,
  locationId,
  signal,
}: FetchParams): Promise<CalendarBooking[]> {
  const out: CalendarBooking[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const res = await fetchPage(page, {}, { token, locationId, signal });
    const items = res?.data?.bookings ?? [];
    for (const raw of items) {
      const date = toDateKey(raw.booking_date);
      if (date) out.push(mapBooking(raw, date));
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= SYNC_MAX_PAGES);

  if (lastPage > SYNC_MAX_PAGES) {
    console.warn(
      `[bookings] Loaded the ${SYNC_MAX_PAGES * PER_PAGE} most recent bookings; ` +
        `${lastPage - SYNC_MAX_PAGES} older page(s) were not fetched.`,
    );
  }

  return out;
}

export async function fetchDashboardBookings({
  token,
  locationId,
  signal,
}: FetchParams): Promise<CalendarBooking[]> {
  const params = new URLSearchParams({ per_page: "500" });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<BookingsListResponse>(
    `/api/bookings?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.bookings ?? [];
  return items.map((raw) => mapBooking(raw, toDateKey(raw.booking_date) ?? ""));
}

function mapAddOns(raw: RawBookingDetail): BookingAddOn[] {
  const list = raw.add_ons ?? raw.addOns ?? [];
  return list.map((a) => ({
    id: a.id,
    name: a.name?.trim() || "Add-on",
    quantity: Number(a.pivot?.quantity ?? 1),
    priceAtBooking: Number(a.pivot?.price_at_booking ?? 0),
  }));
}

/** Full detail for one booking (GET /api/bookings/{id}). */
export async function fetchBookingDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<BookingDetail> {
  const res = await apiRequest<BookingDetailResponse>(`/api/bookings/${id}`, {
    token,
    signal,
  });
  const b = res.data;

  return {
    id: b.id,
    referenceNumber: b.reference_number ?? null,
    status: b.status ?? "pending",
    type: b.type ?? "package",
    date: toDateKey(b.booking_date) ?? "",
    time: toTime(b.booking_time),
    duration: Number(b.duration ?? 0),
    durationUnit: b.duration_unit ?? "hours",
    participants: Number(b.participants ?? 0),
    packageName: b.package?.name?.trim() || "—",
    packageId: b.package_id ?? b.package?.id ?? null,
    packagePrice: b.package?.price != null ? Number(b.package.price) : null,
    locationId: b.location_id ?? null,
    locationName: b.location?.name?.trim() || "",
    customerId: b.customer_id ?? null,
    roomName: b.room?.name?.trim() || null,
    roomId: b.room_id ?? b.room?.id ?? null,
    customerName: customerName(b.customer, b.guest_name),
    customerEmail: b.customer?.email ?? b.guest_email ?? null,
    customerPhone: b.customer?.phone ?? b.guest_phone ?? null,
    guestOfHonorName: b.guest_of_honor_name?.trim() || null,
    guestOfHonorAge: b.guest_of_honor_age ?? null,
    guestOfHonorGender: b.guest_of_honor_gender ?? null,
    addOns: mapAddOns(b),
    totalAmount: Number(b.total_amount ?? 0),
    paymentStatus: b.payment_status ?? "partial",
    paymentMethod: b.payment_method ?? null,
    amountPaid: Number(b.amount_paid ?? 0),
    appliedFees: (b.applied_fees ?? []).map((f) => ({
      name: f.fee_name ?? "Fee",
      amount: Number(f.fee_amount ?? 0),
      applicationType: f.fee_application_type ?? "additive",
    })),
    customerNotes: b.customer_notes ?? b.notes ?? null,
    internalNotes: b.internal_notes?.trim() || null,
    createdAt: b.created_at ?? null,
  };
}

/** PATCH /api/bookings/{id}/status — change the booking status. */
export async function updateBookingStatus(
  token: string,
  id: number,
  status: string,
): Promise<void> {
  await apiRequest(`/api/bookings/${id}/status`, {
    method: "PATCH",
    token,
    body: { status },
  });
}

/** PATCH /api/bookings/{id}/payment-status — mark paid / partial. */
export async function updateBookingPaymentStatus(
  token: string,
  id: number,
  paymentStatus: "paid" | "partial",
): Promise<void> {
  await apiRequest(`/api/bookings/${id}/payment-status`, {
    method: "PATCH",
    token,
    body: { payment_status: paymentStatus },
  });
}

/** DELETE /api/bookings/{id} — soft-delete (moves the booking to trash),
 *  mirroring the web admin's row "Delete" action (bookingService.deleteBooking). */
export async function deleteBooking(token: string, id: number): Promise<void> {
  await apiRequest(`/api/bookings/${id}`, { method: "DELETE", token });
}

/**
 * POST /api/bookings/check-in — mark a confirmed booking as checked-in, matching
 * the web admin's row "Check In" action. The backend records checked_in_at /
 * checked_in_by (from `user_id` when provided, else the authenticated user) and
 * only accepts confirmed bookings.
 */
export async function checkInBooking(
  token: string,
  referenceNumber: string,
  userId?: number,
): Promise<void> {
  await apiRequest(`/api/bookings/check-in`, {
    method: "POST",
    token,
    body: {
      reference_number: referenceNumber,
      ...(userId != null ? { user_id: userId } : {}),
    },
  });
}

/**
 * Bulk status change for the selected bookings. There is no bulk-status endpoint,
 * so — exactly like the web admin's bulk bar — this fans out per-id requests:
 * a "checked-in" change routes through the dedicated check-in endpoint (records
 * checked_in_at/by, confirmed-only), every other status uses the generic status
 * PATCH. Rejects if any single update fails.
 */
export async function bulkSetBookingStatus(
  token: string,
  bookings: { id: number; referenceNumber: string | null }[],
  status: string,
  userId?: number,
): Promise<void> {
  await Promise.all(
    bookings.map((b) =>
      status === "checked-in" && b.referenceNumber
        ? checkInBooking(token, b.referenceNumber, userId)
        : updateBookingStatus(token, b.id, status),
    ),
  );
}

/**
 * POST /api/bookings/bulk-delete — the backend's dedicated bulk soft-delete
 * endpoint (one round-trip), the same route the web BookingService exposes as
 * `bulkDelete({ ids })`.
 */
export async function bulkDeleteBookings(
  token: string,
  ids: number[],
): Promise<void> {
  await apiRequest("/api/bookings/bulk-delete", {
    method: "POST",
    token,
    body: { ids },
  });
}

/** Booking shape backing the check-in scanner's verify + review surface. */
export type ScanBooking = {
  id: number;
  referenceNumber: string;
  status: string;
  packageName: string;
  customerName: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  participants: number;
  totalAmount: number;
  amountPaid: number;
  paymentStatus: string;
  locationName: string;
};

type RawScanBooking = {
  id: number;
  reference_number?: string | null;
  status?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  participants?: number | string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
  guest_name?: string | null;
  package?: { name?: string | null } | null;
  location?: { name?: string | null } | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
};

function mapScanBooking(raw: RawScanBooking): ScanBooking {
  return {
    id: raw.id,
    referenceNumber: raw.reference_number ?? "",
    status: raw.status ?? "pending",
    packageName: raw.package?.name?.trim() || "Booking",
    customerName: customerName(raw.customer, raw.guest_name),
    date: toDateKey(raw.booking_date) ?? "",
    time: toTime(raw.booking_time),
    participants: Number(raw.participants ?? 0),
    totalAmount: Number(raw.total_amount ?? 0),
    amountPaid: Number(raw.amount_paid ?? 0),
    paymentStatus: raw.payment_status ?? "pending",
    locationName: raw.location?.name?.trim() || "",
  };
}

/**
 * GET /api/bookings?reference_number= — look up a scanned booking by its
 * reference number (the same request the web scanner makes,
 * `getBookings({ reference_number })`). Returns the first match, or null.
 */
export async function fetchBookingByReference({
  token,
  referenceNumber,
  userId,
  signal,
}: {
  token: string;
  referenceNumber: string;
  userId?: number;
  signal?: AbortSignal;
}): Promise<ScanBooking | null> {
  const params = new URLSearchParams({
    reference_number: referenceNumber,
    per_page: "1",
  });
  if (userId != null) params.append("user_id", String(userId));
  const res = await apiRequest<{ data?: { bookings?: RawScanBooking[] } }>(
    `/api/bookings?${params.toString()}`,
    { token, signal },
  );
  const first = res?.data?.bookings?.[0];
  return first ? mapScanBooking(first) : null;
}

/** Adapt a full BookingDetail (from GET /api/bookings/{id}) to a ScanBooking. */
export function scanBookingFromDetail(d: BookingDetail): ScanBooking {
  return {
    id: d.id,
    referenceNumber: d.referenceNumber ?? "",
    status: d.status,
    packageName: d.packageName,
    customerName: d.customerName,
    date: d.date,
    time: d.time,
    participants: d.participants,
    totalAmount: d.totalAmount,
    amountPaid: d.amountPaid,
    paymentStatus: d.paymentStatus,
    locationName: d.locationName,
  };
}

/** PATCH /api/bookings/{id}/internal-notes — save internal notes. */
export async function updateBookingInternalNotes(
  token: string,
  id: number,
  internalNotes: string,
): Promise<void> {
  await apiRequest(`/api/bookings/${id}/internal-notes`, {
    method: "PATCH",
    token,
    body: { internal_notes: internalNotes },
  });
}

export type PackageOption = { id: number; name: string; price: number | null };
export type RoomOption = { id: number; name: string };

/** Loosely pull an array out of the common `{data:{key:[]}}` / `{data:[]}` shapes. */
function extractList<T>(res: any, key: string): T[] {
  const d = res?.data ?? res;
  if (Array.isArray(d)) return d as T[];
  if (Array.isArray(d?.[key])) return d[key] as T[];
  return [];
}

/** Runaway-paging backstop when following `last_page`. */
const MAX_LOOKUP_PAGES = 20;

/** GET /api/mobile/packages — selectable packages (id/name/price) for the Edit form
 *  dropdown, via the lightweight mobile list; the full package loads from the detail endpoint. */
export async function fetchPackages(
  token: string,
  locationId?: number | null,
): Promise<PackageOption[]> {
  const params = new URLSearchParams();
  if (locationId != null) params.append("location_id", String(locationId));
  const qs = params.toString();
  const res = await apiRequest<any>(
    `/api/mobile/packages${qs ? `?${qs}` : ""}`,
    { token },
  );
  return extractList<any>(res, "packages").map((p) => ({
    id: Number(p.id),
    name: (p.name ?? "").toString().trim() || `Package #${p.id}`,
    price: p.price != null ? Number(p.price) : null,
  }));
}

/**
 * GET /api/rooms?location_id= — selectable spaces/rooms for the Edit form.
 * Also paginated (default 15/page, max 500); page through so every space shows.
 */
export async function fetchRooms(
  token: string,
  locationId?: number | null,
): Promise<RoomOption[]> {
  const out: RoomOption[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const params = new URLSearchParams({ per_page: "500", page: String(page) });
    if (locationId != null) params.append("location_id", String(locationId));
    const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, {
      token,
    });
    for (const r of extractList<any>(res, "rooms")) {
      out.push({
        id: Number(r.id),
        name: (r.name ?? "").toString().trim() || `Space #${r.id}`,
      });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= MAX_LOOKUP_PAGES);
  return out;
}

// ---------------------------------------------------------------------------
// Space Schedule (mirrors the web /bookings/space-schedule): the day's bookings
// laid out per room/space, with each room's break times. Both are scoped by
// user_id (backend limits to the user's location), exactly like the web.
// ---------------------------------------------------------------------------

/** A recurring break window on a space, for a set of weekdays. */
export type SpaceBreak = {
  /** Lowercased weekday names, e.g. ["saturday","sunday"]. */
  days: string[];
  startTime: string; // HH:MM
  endTime: string; // HH:MM
};

/** A space/room with the fields the Space Schedule needs. */
export type Space = {
  id: number;
  name: string;
  capacity: number | null;
  breaks: SpaceBreak[];
};

type RawRoom = {
  id: number;
  name?: string | null;
  capacity?: number | string | null;
  area_group?: string | { name?: string | null } | null;
  booking_interval?: number | string | null;
  is_active?: boolean | number | null;
  status?: string | null;
  location_id?: number | string | null;
  location?: { id?: number | null; name?: string | null } | null;
  created_at?: string | null;
  break_time?:
    | {
        days?: string[] | null;
        start_time?: string | null;
        end_time?: string | null;
      }[]
    | null;
};

/**
 * GET /api/rooms — spaces with capacity + break times. Scoped by user_id like
 * the web Space Schedule (`roomService.getRooms({ user_id, per_page: 100 })`).
 */
export async function fetchSpaces({
  token,
  userId,
  signal,
}: {
  token: string;
  userId?: number;
  signal?: AbortSignal;
}): Promise<Space[]> {
  const out: Space[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const params = new URLSearchParams({ per_page: "100", page: String(page) });
    if (userId != null) params.append("user_id", String(userId));
    const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, {
      token,
      signal,
    });
    for (const r of extractList<RawRoom>(res, "rooms")) {
      out.push({
        id: Number(r.id),
        name: (r.name ?? "").toString().trim() || `Space #${r.id}`,
        capacity: r.capacity != null ? Number(r.capacity) : null,
        breaks: (r.break_time ?? []).map((b) => ({
          days: Array.isArray(b.days)
            ? b.days.map((d) => String(d).toLowerCase())
            : [],
          startTime: toTime(b.start_time) ?? String(b.start_time ?? ""),
          endTime: toTime(b.end_time) ?? String(b.end_time ?? ""),
        })),
      });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= MAX_LOOKUP_PAGES);
  return out;
}

/** Flattened space/room row backing the Spaces management list. */
export type SpaceRow = {
  id: number;
  name: string;
  capacity: number | null;
  areaGroup: string | null;
  bookingInterval: number | null;
  isActive: boolean;
  locationId: number | null;
  locationName: string;
  breaks: SpaceBreak[];
  createdAt: string | null;
};

/** Fields accepted when creating/updating a room (mirrors the web form). */
export type RoomInput = {
  name: string;
  capacity: number | null;
  is_active: boolean;
  area_group: string | null;
  booking_interval: number | null;
  location_id?: number | null;
  break_time: { days: string[]; start_time: string; end_time: string }[];
};

function rawRoomToBreaks(r: RawRoom): SpaceBreak[] {
  return (r.break_time ?? []).map((b) => ({
    days: Array.isArray(b.days) ? b.days.map((d) => String(d).toLowerCase()) : [],
    startTime: toTime(b.start_time) ?? String(b.start_time ?? ""),
    endTime: toTime(b.end_time) ?? String(b.end_time ?? ""),
  }));
}

function mapSpaceRow(r: RawRoom): SpaceRow {
  const areaGroup =
    typeof r.area_group === "string"
      ? r.area_group.trim() || null
      : r.area_group?.name?.trim() || null;
  return {
    id: Number(r.id),
    name: (r.name ?? "").toString().trim() || `Space #${r.id}`,
    capacity: r.capacity != null ? Number(r.capacity) : null,
    areaGroup,
    bookingInterval: r.booking_interval != null ? Number(r.booking_interval) : null,
    isActive:
      r.is_active === true ||
      r.is_active === 1 ||
      (r.status ? r.status.toLowerCase() === "active" : false) ||
      (r.is_active == null && r.status == null),
    locationId:
      r.location_id != null
        ? Number(r.location_id)
        : r.location?.id != null
          ? Number(r.location.id)
          : null,
    locationName: r.location?.name?.trim() || "",
    breaks: rawRoomToBreaks(r),
    createdAt: r.created_at ?? null,
  };
}

/** Serialize a SpaceRow's break windows back into the API's break_time shape. */
export function breaksToPayload(
  breaks: SpaceBreak[],
): RoomInput["break_time"] {
  return breaks.map((b) => ({
    days: b.days,
    start_time: b.startTime,
    end_time: b.endTime,
  }));
}

/**
 * GET /api/rooms — the full spaces list for the management screen (name,
 * capacity, area group, booking interval). Scoped by user_id like the web.
 */
export async function fetchSpaceList({
  token,
  userId,
  signal,
}: {
  token: string;
  userId?: number;
  signal?: AbortSignal;
}): Promise<SpaceRow[]> {
  const out: SpaceRow[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const params = new URLSearchParams({ per_page: "100", page: String(page) });
    if (userId != null) params.append("user_id", String(userId));
    const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, {
      token,
      signal,
    });
    for (const r of extractList<RawRoom>(res, "rooms")) {
      out.push(mapSpaceRow(r));
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= MAX_LOOKUP_PAGES);
  return out;
}

type RoomMutationResponse = { success?: boolean; data?: RawRoom; message?: string };

/** POST /api/rooms — create a space/room. */
export async function createRoom(
  token: string,
  input: RoomInput,
): Promise<void> {
  await apiRequest<RoomMutationResponse>("/api/rooms", {
    method: "POST",
    token,
    body: input,
  });
}

/** PUT /api/rooms/{id} — update a space/room. */
export async function updateRoom(
  token: string,
  id: number,
  input: RoomInput,
): Promise<void> {
  await apiRequest<RoomMutationResponse>(`/api/rooms/${id}`, {
    method: "PUT",
    token,
    body: input,
  });
}

/** DELETE /api/rooms/{id} — remove a space/room. */
export async function deleteRoom(token: string, id: number): Promise<void> {
  await apiRequest(`/api/rooms/${id}`, { method: "DELETE", token });
}

/**
 * Apply one booking interval to every room in an area group. Uses the confirmed
 * per-room update route (PUT /api/rooms/{id}) so it doesn't depend on a bulk
 * endpoint; each room keeps its other fields (name/capacity/breaks/location).
 */
export async function updateAreaGroupInterval(
  token: string,
  rooms: SpaceRow[],
  bookingInterval: number,
): Promise<void> {
  for (const room of rooms) {
    await updateRoom(token, room.id, {
      name: room.name,
      capacity: room.capacity,
      is_active: room.isActive,
      area_group: room.areaGroup,
      booking_interval: bookingInterval,
      location_id: room.locationId ?? undefined,
      break_time: breaksToPayload(room.breaks),
    });
  }
}

/** One booking on the day schedule — carries room + duration for placement. */
export type ScheduleBooking = {
  id: number;
  roomId: number | null;
  referenceNumber: string | null;
  status: string;
  time: string | null; // HH:MM start
  durationMinutes: number;
  participants: number;
  totalAmount: number;
  amountPaid: number;
  paymentStatus: string;
  packageName: string;
  customerName: string;
};

type RawScheduleBooking = {
  id: number;
  reference_number?: string | null;
  status?: string | null;
  booking_time?: string | null;
  room_id?: number | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  participants?: number | string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
  guest_name?: string | null;
  package?: { name?: string | null } | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
};

/** Convert a duration + unit to whole minutes (mirrors the web schedule math). */
function durationToMinutes(
  duration: number,
  unit: string | null | undefined,
): number {
  if (unit === "hours and minutes") {
    const hours = Math.floor(duration);
    const mins = Math.round((duration % 1) * 60);
    return hours * 60 + mins;
  }
  return unit === "hours" ? duration * 60 : duration;
}

/** Map a raw schedule/list booking to the ScheduleBooking shape. */
function mapScheduleBooking(raw: RawScheduleBooking): ScheduleBooking {
  return {
    id: raw.id,
    roomId: raw.room_id ?? null,
    referenceNumber: raw.reference_number ?? null,
    status: raw.status ?? "pending",
    time: toTime(raw.booking_time),
    durationMinutes: durationToMinutes(
      Number(raw.duration ?? 0),
      raw.duration_unit,
    ),
    participants: Number(raw.participants ?? 0),
    totalAmount: Number(raw.total_amount ?? 0),
    amountPaid: Number(raw.amount_paid ?? 0),
    paymentStatus: raw.payment_status ?? "pending",
    packageName: raw.package?.name?.trim() || "Booking",
    customerName: customerName(raw.customer, raw.guest_name),
  };
}

/**
 * GET /api/bookings?booking_date=YYYY-MM-DD — the single day's bookings for the
 * Space Schedule (same request the web makes: `getBookings({ booking_date,
 * user_id })`). Paged for safety, though a single day rarely exceeds one page.
 */
export async function fetchDaySchedule({
  token,
  date,
  userId,
  signal,
}: {
  token: string;
  date: string;
  userId?: number;
  signal?: AbortSignal;
}): Promise<ScheduleBooking[]> {
  const out: ScheduleBooking[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const params = new URLSearchParams({
      booking_date: date,
      per_page: String(PER_PAGE),
      page: String(page),
    });
    if (userId != null) params.append("user_id", String(userId));
    const res = await apiRequest<{
      data?: {
        bookings?: RawScheduleBooking[];
        pagination?: { last_page?: number };
      };
    }>(`/api/bookings?${params.toString()}`, { token, signal });
    for (const raw of res?.data?.bookings ?? []) {
      out.push(mapScheduleBooking(raw));
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= SYNC_MAX_PAGES);
  return out;
}

/**
 * GET /api/bookings/location-date?location_id=&date= — bookings at a location on
 * a date, matching the web admin's `getBookingsByLocationAndDate` (used by
 * EditBooking to show "Existing bookings at this location"). Reuses the same
 * dedicated Laravel endpoint the web uses, location-scoped server-side.
 */
export async function fetchBookingsByLocationAndDate(
  token: string,
  locationId: number,
  date: string,
  signal?: AbortSignal,
): Promise<ScheduleBooking[]> {
  const params = new URLSearchParams({
    location_id: String(locationId),
    date,
  });
  const res = await apiRequest<{ data?: RawScheduleBooking[] }>(
    `/api/bookings/location-date?${params.toString()}`,
    { token, signal },
  );
  return (Array.isArray(res?.data) ? res.data : []).map(mapScheduleBooking);
}

/**
 * A package's availability rule. Together these decide which calendar days a
 * booking can be rescheduled onto — e.g. a package with a single weekly
 * `["friday"]` rule is bookable on Fridays only.
 */
export type PackageAvailabilitySchedule = {
  availabilityType: "daily" | "weekly" | "monthly" | string;
  dayConfiguration: string[] | null;
  isActive: boolean;
};

/** A concrete open slot from the mobile availability endpoint. */
export type AvailableSlot = {
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  roomId: number | null;
  roomName: string | null;
};

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function weekdayOccurrence(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}
function isLastWeekdayOccurrence(date: Date): boolean {
  const next = new Date(date);
  next.setDate(date.getDate() + 7);
  return next.getMonth() !== date.getMonth();
}

/** Mirrors the backend PackageAvailabilitySchedule::matchesDate(). Monthly configs
 *  use the backend `occurrence-dayName` form (e.g. "first-friday", "last-friday"). */
export function scheduleMatchesDate(
  schedule: PackageAvailabilitySchedule,
  date: Date,
): boolean {
  if (!schedule.isActive) return false;
  const dayName = WEEKDAY_NAMES[date.getDay()];
  switch (schedule.availabilityType) {
    case "daily":
      return true;
    case "weekly":
      return !!schedule.dayConfiguration?.includes(dayName);
    case "monthly":
      return !!schedule.dayConfiguration?.some((config) => {
        const [occurrence, cfgDay] = config.toLowerCase().split("-");
        if (cfgDay !== dayName) return false;
        if (occurrence === "last") return isLastWeekdayOccurrence(date);
        const map: Record<string, number> = {
          first: 1,
          second: 2,
          third: 3,
          fourth: 4,
        };
        return map[occurrence] === weekdayOccurrence(date);
      });
    default:
      return false;
  }
}

/** True when at least one active schedule allows booking on `date` (no schedules → unrestricted). */
export function isDateBookable(
  schedules: PackageAvailabilitySchedule[],
  date: Date,
): boolean {
  if (schedules.length === 0) return true;
  return schedules.some((s) => scheduleMatchesDate(s, date));
}

/** GET /api/packages/{id}/availability-schedules — the package's booking-day rules. */
export async function fetchPackageAvailabilitySchedules(
  token: string,
  packageId: number,
): Promise<PackageAvailabilitySchedule[]> {
  const res = await apiRequest<any>(
    `/api/packages/${packageId}/availability-schedules`,
    { token },
  );
  const schedules = res?.data?.schedules ?? [];
  return (Array.isArray(schedules) ? schedules : []).map((s: any) => ({
    availabilityType: s.availability_type ?? "",
    dayConfiguration: Array.isArray(s.day_configuration)
      ? s.day_configuration.map((d: string) => String(d).toLowerCase())
      : null,
    isActive: s.is_active !== false,
  }));
}

/**
 * GET /api/mobile/packages/{id}/availability?date= — the real open slots for a
 * package on a date (respects rooms, existing bookings, day-offs). Public endpoint.
 */
export async function fetchAvailableTimeSlots(
  token: string | undefined,
  packageId: number,
  date: string,
): Promise<AvailableSlot[]> {
  const res = await apiRequest<any>(
    `/api/mobile/packages/${packageId}/availability?date=${encodeURIComponent(date)}`,
    { token },
  );
  const slots = res?.data?.available_slots ?? [];
  return (Array.isArray(slots) ? slots : []).map((s: any) => ({
    startTime: toTime(s.start_time) ?? String(s.start_time ?? ""),
    endTime: toTime(s.end_time) ?? String(s.end_time ?? ""),
    roomId: s.room_id ?? null,
    roomName: s.room_name ?? null,
  }));
}

export type BookingUpdateInput = {
  locationId?: number | null;
  packageId?: number | null;
  roomId?: number | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  participants?: number;
  status?: string;
  guestOfHonorName?: string | null;
  guestOfHonorAge?: number | null;
  guestOfHonorGender?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  sendEmail?: boolean;
};

/**
 * PUT /api/bookings/{id} — full booking update from the Edit form. Method and
 * body keys mirror the web admin exactly (bookingService.updateBooking /
 * EditBooking.tsx): PUT, `guest_name`, `notes` (customer notes), and
 * `send_notification` for the update-notification toggle.
 */
export async function updateBooking(
  token: string,
  id: number,
  input: BookingUpdateInput,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.locationId != null) body.location_id = input.locationId;
  if (input.packageId != null) body.package_id = input.packageId;
  if (input.roomId != null) body.room_id = input.roomId;
  if (input.customerName != null) body.guest_name = input.customerName;
  if (input.customerEmail != null) body.guest_email = input.customerEmail;
  if (input.customerPhone != null) body.guest_phone = input.customerPhone;
  if (input.date != null) body.booking_date = input.date;
  if (input.time != null) body.booking_time = input.time;
  if (input.participants != null) body.participants = input.participants;
  if (input.status != null) body.status = input.status;
  if (input.guestOfHonorName !== undefined)
    body.guest_of_honor_name = input.guestOfHonorName;
  if (input.guestOfHonorAge !== undefined)
    body.guest_of_honor_age = input.guestOfHonorAge;
  if (input.guestOfHonorGender !== undefined)
    body.guest_of_honor_gender = input.guestOfHonorGender;
  if (input.customerNotes !== undefined) body.notes = input.customerNotes;
  if (input.internalNotes !== undefined)
    body.internal_notes = input.internalNotes;
  if (input.sendEmail != null) body.send_notification = input.sendEmail;

  await apiRequest(`/api/bookings/${id}`, { method: "PUT", token, body });
}

// ---------------------------------------------------------------------------
// Page-level "More" actions (mirrors the web Manage Bookings header menu):
// Export Bookings, Generate Report, Bulk Import, View Deleted.
// ---------------------------------------------------------------------------

/**
 * GET /api/bookings/export — the raw booking records the web admin turns into a
 * CSV (bookingService.exportBookings). Returned as-is so the caller can build
 * the same CSV columns client-side.
 */
export async function exportBookings(
  token: string,
  locationId?: number | null,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    sort_by: "booking_date",
    sort_order: "desc",
  });
  if (locationId != null) params.append("location_id", String(locationId));
  const res = await apiRequest<{
    data?: { bookings?: Record<string, unknown>[] };
  }>(`/api/bookings/export?${params.toString()}`, { token });
  return res?.data?.bookings ?? [];
}

/** A soft-deleted booking row (adds the deletion timestamp to the list shape). */
export type TrashedBooking = CalendarBooking & { deletedAt: string | null };

/**
 * GET /api/bookings/trashed — soft-deleted bookings (the web "View Deleted"
 * list), paged newest-first and scoped to the location when provided.
 */
export async function fetchTrashedBookings({
  token,
  locationId,
  signal,
}: FetchParams): Promise<TrashedBooking[]> {
  const out: TrashedBooking[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const params = new URLSearchParams({
      per_page: String(PER_PAGE),
      page: String(page),
      sort_by: "deleted_at",
      sort_order: "desc",
    });
    if (locationId != null) params.append("location_id", String(locationId));
    const res = await apiRequest<
      BookingsListResponse & { data: { bookings: RawBooking[] } }
    >(`/api/bookings/trashed?${params.toString()}`, { token, signal });
    for (const raw of res?.data?.bookings ?? []) {
      out.push({
        ...mapBooking(raw, toDateKey(raw.booking_date) ?? ""),
        deletedAt: raw.deleted_at ?? null,
      });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= SYNC_MAX_PAGES);
  return out;
}

/** POST /api/bookings/{id}/restore — restore a soft-deleted booking. */
export async function restoreBooking(token: string, id: number): Promise<void> {
  await apiRequest(`/api/bookings/${id}/restore`, { method: "POST", token });
}

/** Result of a CSV bulk import (mirrors the web bulkImportCsv response). */
export type BulkImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; error: string }[];
  total_rows: number;
};

/**
 * POST /api/bookings/bulk-import-csv — multipart upload of a CSV file, matching
 * the web admin's Bulk Import. Sent via a direct fetch (not apiRequest) so
 * React Native sets the multipart boundary itself.
 */
export async function bulkImportBookingsCsv(params: {
  token: string;
  fileUri: string;
  locationId: number;
  skipDuplicates?: boolean;
}): Promise<BulkImportResult> {
  const form = new FormData();
  // React Native's FormData accepts a { uri, name, type } file descriptor.
  form.append("file", {
    uri: params.fileUri,
    name: "bookings-import.csv",
    type: "text/csv",
  } as unknown as Blob);
  form.append("location_id", String(params.locationId));
  form.append("skip_duplicates", params.skipDuplicates === false ? "0" : "1");

  const res = await fetch(apiUrl("/api/bookings/bulk-import-csv"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${params.token}`,
    },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data?.message as string) ??
        "Bulk import failed. Please check the CSV and try again.",
    );
  }
  return data?.data as BulkImportResult;
}

/** Report period selector (subset of the web's period types that map cleanly to
 *  mobile controls). */
export type ReportPeriod = "today" | "monthly" | "custom";

/**
 * Absolute URL for GET /api/bookings/details-report (a PDF stream). Built here
 * so the screen can hand it to expo-file-system's downloader with the same
 * query params the web sends.
 */
export function buildBookingsReportUrl(params: {
  period: ReportPeriod;
  viewMode: "individual" | "list";
  includeCancelled: boolean;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  locationId?: number | null;
  userId?: number | null;
}): string {
  const qs = new URLSearchParams();
  qs.append("package_ids", "all");
  qs.append("period_type", params.period);
  if (params.period === "monthly") {
    qs.append("month", String(params.month ?? new Date().getMonth() + 1));
    qs.append("year", String(params.year ?? new Date().getFullYear()));
  } else if (params.period === "custom") {
    if (params.startDate) qs.append("start_date", params.startDate);
    if (params.endDate) qs.append("end_date", params.endDate);
  }
  qs.append("view_mode", params.viewMode);
  if (params.includeCancelled) qs.append("include_cancelled", "true");
  if (params.locationId != null)
    qs.append("location_id", String(params.locationId));
  if (params.userId != null) qs.append("user_id", String(params.userId));
  return apiUrl(`/api/bookings/details-report?${qs.toString()}`);
}

/** POST /api/payments — record a manual in-store payment (no card tokenization). */
export async function recordBookingPayment(
  token: string,
  params: {
    bookingId: number;
    amount: number;
    locationId: number | null;
    customerId: number | null;
  },
): Promise<void> {
  await apiRequest(`/api/payments`, {
    method: "POST",
    token,
    body: {
      payable_id: params.bookingId,
      payable_type: "booking",
      customer_id: params.customerId ?? undefined,
      location_id: params.locationId ?? undefined,
      amount: params.amount,
      method: "in-store",
      status: "completed",
      notes: "Recorded from analytics app",
    },
  });
}

// ---------------------------------------------------------------------------
// Create Booking (mirrors the web /bookings/create OnsiteBooking flow):
// rich package catalog + POST /api/bookings.
// ---------------------------------------------------------------------------

export type PackageAddOn = { id: number; name: string; price: number };
export type PackageAttraction = {
  id: number;
  name: string;
  price: number;
  /** "per_person" multiplies by participants; otherwise a flat per-unit price. */
  pricingType: string;
};

/** A package with everything the Create Booking form needs. */
export type BookablePackage = {
  id: number;
  name: string;
  category: string;
  price: number;
  pricePerAdditional: number;
  minParticipants: number;
  maxParticipants: number;
  duration: number;
  durationUnit: "hours" | "minutes" | "hours and minutes";
  hasGuestOfHonor: boolean;
  timeSlotInterval: number;
  partialPaymentPercentage: number | null;
  partialPaymentFixed: number | null;
  locationId: number | null;
  /** Whether the package is active; the web filters these client-side. */
  isActive: boolean;
  addOns: PackageAddOn[];
  attractions: PackageAttraction[];
};

type RawPackage = {
  id: number;
  name?: string | null;
  category?: string | null;
  is_active?: boolean | number | null;
  price?: number | string | null;
  price_per_additional?: number | string | null;
  min_participants?: number | string | null;
  max_participants?: number | string | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  has_guest_of_honor?: boolean | null;
  time_slot_interval?: number | string | null;
  partial_payment_percentage?: number | string | null;
  partial_payment_fixed?: number | string | null;
  location_id?: number | null;
  add_ons?:
    | { id: number; name?: string | null; price?: number | string | null }[]
    | null;
  attractions?:
    | {
        id: number;
        name?: string | null;
        price?: number | string | null;
        pricing_type?: string | null;
      }[]
    | null;
};

function mapBookablePackage(raw: RawPackage): BookablePackage {
  const unit = raw.duration_unit;
  const durationUnit: BookablePackage["durationUnit"] =
    unit === "minutes" || unit === "hours and minutes" ? unit : "hours";
  return {
    id: raw.id,
    name: raw.name?.trim() || `Package #${raw.id}`,
    category: raw.category?.trim() || "",
    price: Number(raw.price ?? 0),
    pricePerAdditional: Number(raw.price_per_additional ?? 0),
    minParticipants: Number(raw.min_participants ?? 1) || 1,
    maxParticipants: Number(raw.max_participants ?? 0) || 0,
    duration: Number(raw.duration ?? 0),
    durationUnit,
    hasGuestOfHonor: !!raw.has_guest_of_honor,
    timeSlotInterval: Number(raw.time_slot_interval ?? 0) || 0,
    partialPaymentPercentage:
      raw.partial_payment_percentage != null
        ? Number(raw.partial_payment_percentage)
        : null,
    partialPaymentFixed:
      raw.partial_payment_fixed != null
        ? Number(raw.partial_payment_fixed)
        : null,
    locationId: raw.location_id ?? null,
    // Active unless the backend explicitly says otherwise (matches the web's
    // `is_active === true` filter without hiding packages when the field is
    // simply absent from the payload).
    isActive: raw.is_active !== false && raw.is_active !== 0,
    addOns: (raw.add_ons ?? []).map((a) => ({
      id: Number(a.id),
      name: a.name?.trim() || `Add-on #${a.id}`,
      price: Number(a.price ?? 0),
    })),
    attractions: (raw.attractions ?? []).map((a) => ({
      id: Number(a.id),
      name: a.name?.trim() || `Attraction #${a.id}`,
      price: Number(a.price ?? 0),
      pricingType: a.pricing_type ?? "flat",
    })),
  };
}

/**
 * Lightweight package row for the Step-1 list — scalars only, NO relations.
 * The `/packages` index eager-loads 7 relations per package (rooms, promos,
 * gift cards, attractions, add-ons, availability schedules), which is far too
 * heavy to retain for a mobile list; we map only what's needed to list + pick,
 * and hydrate the full package on selection ({@link fetchBookablePackageDetail}).
 */
export type PackageListItem = {
  id: number;
  name: string;
  category: string;
  price: number;
  duration: number;
  durationUnit: BookablePackage["durationUnit"];
  minParticipants: number;
  maxParticipants: number;
  isActive: boolean;
};

function mapPackageListItem(raw: RawPackage): PackageListItem {
  const unit = raw.duration_unit;
  return {
    id: raw.id,
    name: raw.name?.trim() || `Package #${raw.id}`,
    category: raw.category?.trim() || "",
    price: Number(raw.price ?? 0),
    duration: Number(raw.duration ?? 0),
    durationUnit:
      unit === "minutes" || unit === "hours and minutes" ? unit : "hours",
    minParticipants: Number(raw.min_participants ?? 1) || 1,
    maxParticipants: Number(raw.max_participants ?? 0) || 0,
    isActive: raw.is_active !== false && raw.is_active !== 0,
  };
}

export type PackageListPage = {
  items: PackageListItem[];
  page: number;
  lastPage: number;
};

/** GET /api/mobile/packages — bookable packages as lightweight list items (role-scoped, `search`
 *  server-side). Not paginated: whole list is one page (`lastPage: 1`), keeping "load more" a no-op. */
export async function fetchPackageList(
  token: string,
  opts: {
    locationId?: number | null;
    userId?: number;
    search?: string;
    page?: number;
    perPage?: number;
    signal?: AbortSignal;
  } = {},
): Promise<PackageListPage> {
  const params = new URLSearchParams();
  if (opts.locationId != null)
    params.append("location_id", String(opts.locationId));
  if (opts.userId != null) params.append("user_id", String(opts.userId));
  const search = opts.search?.trim();
  if (search) params.append("search", search);
  const qs = params.toString();
  const res = await apiRequest<any>(
    `/api/mobile/packages${qs ? `?${qs}` : ""}`,
    { token, signal: opts.signal },
  );
  const items = extractList<RawPackage>(res, "packages")
    .map(mapPackageListItem)
    .filter((p) => p.isActive);
  return { items, page: 1, lastPage: 1 };
}

/**
 * GET /api/packages/{id} — the full package (add-ons, attractions, deposit
 * rules, etc.), fetched only AFTER a package is picked so the heavy relations
 * are hydrated for exactly one package instead of the whole list.
 */
export async function fetchBookablePackageDetail(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<BookablePackage> {
  const res = await apiRequest<{ data?: RawPackage | null }>(
    `/api/packages/${id}`,
    { token, signal },
  );
  if (!res?.data) throw new Error("Package not found");
  return mapBookablePackage(res.data);
}

/** One add-on / attraction line on a new booking. */
export type BookingAddonInput = {
  addon_id: number;
  quantity: number;
  price_at_booking: number;
};
export type BookingAttractionInput = {
  attraction_id: number;
  quantity: number;
  price_at_booking: number;
};

/**
 * Payload for POST /api/bookings — mirrors the web on-site booking request.
 * Card (authorize.net) tokenization isn't available in React Native, so the
 * mobile flow submits `in-store` or `paylater` only.
 */
export type CreateBookingInput = {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  location_id: number;
  package_id: number;
  room_id?: number;
  type: "package";
  booking_date: string; // YYYY-MM-DD
  booking_time: string; // HH:MM
  participants: number;
  duration: number;
  duration_unit: string;
  total_amount: number;
  amount_paid: number;
  payment_method: "in-store" | "paylater";
  status?: "confirmed";
  payment_status?: "paid" | "partial" | "pending";
  notes?: string;
  internal_notes?: string;
  additional_attractions?: BookingAttractionInput[];
  additional_addons?: BookingAddonInput[];
  created_by?: number;
  guest_of_honor_name?: string;
  guest_of_honor_age?: number;
  guest_of_honor_gender?: "male" | "female" | "other";
  guest_address?: string;
  guest_city?: string;
  guest_state?: string;
  guest_zip?: string;
  guest_country?: string;
  sent_email_to_staff?: boolean;
  applied_fees?: PricingAppliedFee[] | null;
  discount_amount?: number;
  applied_discounts?: PricingAppliedDiscount[] | null;
  send_email?: boolean;
};

type CreateBookingResponse = {
  success: boolean;
  data: {
    id: number;
    reference_number?: string | null;
    customer_id?: number | null;
  };
  message?: string;
};

/** POST /api/bookings — create an on-site package booking. */
export async function createBooking(
  token: string,
  input: CreateBookingInput,
): Promise<{
  id: number;
  referenceNumber: string | null;
  customerId: number | null;
}> {
  const res = await apiRequest<CreateBookingResponse>("/api/bookings", {
    method: "POST",
    token,
    body: input,
  });
  return {
    id: res.data.id,
    referenceNumber: res.data.reference_number ?? null,
    customerId: res.data.customer_id ?? null,
  };
}
