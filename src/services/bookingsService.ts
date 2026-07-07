import { apiRequest, apiUrl } from "../lib/api";

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
  /** Local calendar date as YYYY-MM-DD. */
  date: string;
  /** 24h time as HH:MM, or null when the API omits it. */
  time: string | null;
  participants: number;
  totalAmount: number;
  /** Amount collected so far; powers the Manage Bookings "Revenue" KPI. */
  amountPaid: number;
  packageName: string;
  customerName: string;
  locationName: string;
  /** Raw creation timestamp; powers the dashboard "New Bookings" count. */
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
  guest_name?: string | null;
  package?: { name?: string | null } | null;
  location?: { name?: string | null } | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
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
    | { fee_name?: string; fee_amount?: number | string; fee_application_type?: string }[]
    | null;
  package?: { id?: number | null; name?: string | null; price?: number | string | null } | null;
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
  pivot?: { quantity?: number | string | null; price_at_booking?: number | string | null } | null;
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
  customer: { first_name?: string | null; last_name?: string | null } | null | undefined,
  guestName: string | null | undefined,
): string {
  const full = customer
    ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
    : "";
  return full || guestName?.trim() || "Guest";
}

function mapBooking(raw: RawBooking, date: string): CalendarBooking {
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
  return apiRequest<BookingsListResponse>(`/api/bookings?${params.toString()}`, {
    token,
    signal,
  });
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

/**
 * Single-page bookings fetch used ONLY to derive the dashboard "New Bookings"
 * count. Deliberately mirrors the web ManagerDashboard's request exactly — one
 * `GET /bookings?location_id&per_page=500` with no sort, status, or pagination
 * (web: `getBookings({ location_id, per_page: 500 })`, then
 * `allBookings = data.bookings`). The backend caps `per_page` at 100, so this
 * returns the same capped first page the web sees. This is why All-Time New
 * Bookings must NOT use `fetchAllBookings` (which pages the full dataset): the
 * web's count is the capped page's length, not the true total.
 *
 * Rows are mapped without dropping any (missing booking_date → ""), matching the
 * web, which counts every booking the response returns.
 */
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
 * checked_in_by from the authenticated user and only accepts confirmed bookings.
 */
export async function checkInBooking(
  token: string,
  referenceNumber: string,
): Promise<void> {
  await apiRequest(`/api/bookings/check-in`, {
    method: "POST",
    token,
    body: { reference_number: referenceNumber },
  });
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

/**
 * GET /api/packages?location_id= — selectable packages for the Edit form.
 * The endpoint paginates (default 15/page, max 50), so page through all results
 * or the dropdown silently shows only the first 15.
 */
export async function fetchPackages(
  token: string,
  locationId?: number | null,
): Promise<PackageOption[]> {
  const out: PackageOption[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const params = new URLSearchParams({ per_page: "50", page: String(page) });
    if (locationId != null) params.append("location_id", String(locationId));
    const res = await apiRequest<any>(`/api/packages?${params.toString()}`, { token });
    for (const p of extractList<any>(res, "packages")) {
      out.push({
        id: Number(p.id),
        name: (p.name ?? "").toString().trim() || `Package #${p.id}`,
        price: p.price != null ? Number(p.price) : null,
      });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= MAX_LOOKUP_PAGES);
  return out;
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
    const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, { token });
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
  break_time?:
    | { days?: string[] | null; start_time?: string | null; end_time?: string | null }[]
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
function durationToMinutes(duration: number, unit: string | null | undefined): number {
  if (unit === "hours and minutes") {
    const hours = Math.floor(duration);
    const mins = Math.round((duration % 1) * 60);
    return hours * 60 + mins;
  }
  return unit === "hours" ? duration * 60 : duration;
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
      data?: { bookings?: RawScheduleBooking[]; pagination?: { last_page?: number } };
    }>(`/api/bookings?${params.toString()}`, { token, signal });
    for (const raw of res?.data?.bookings ?? []) {
      out.push({
        id: raw.id,
        roomId: raw.room_id ?? null,
        referenceNumber: raw.reference_number ?? null,
        status: raw.status ?? "pending",
        time: toTime(raw.booking_time),
        durationMinutes: durationToMinutes(Number(raw.duration ?? 0), raw.duration_unit),
        participants: Number(raw.participants ?? 0),
        totalAmount: Number(raw.total_amount ?? 0),
        amountPaid: Number(raw.amount_paid ?? 0),
        paymentStatus: raw.payment_status ?? "pending",
        packageName: raw.package?.name?.trim() || "Booking",
        customerName: customerName(raw.customer, raw.guest_name),
      });
    }
    lastPage = res?.data?.pagination?.last_page ?? page;
    page++;
  } while (page <= lastPage && page <= SYNC_MAX_PAGES);
  return out;
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

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

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
export function scheduleMatchesDate(schedule: PackageAvailabilitySchedule, date: Date): boolean {
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
        const map: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
        return map[occurrence] === weekdayOccurrence(date);
      });
    default:
      return false;
  }
}

/** True when at least one active schedule allows booking on `date` (no schedules → unrestricted). */
export function isDateBookable(schedules: PackageAvailabilitySchedule[], date: Date): boolean {
  if (schedules.length === 0) return true;
  return schedules.some((s) => scheduleMatchesDate(s, date));
}

/** GET /api/packages/{id}/availability-schedules — the package's booking-day rules. */
export async function fetchPackageAvailabilitySchedules(
  token: string,
  packageId: number,
): Promise<PackageAvailabilitySchedule[]> {
  const res = await apiRequest<any>(`/api/packages/${packageId}/availability-schedules`, { token });
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
 * PATCH /api/bookings/{id} — full booking update from the Edit form.
 * NOTE: route/field names mirror the web edit form as a best guess; adjust the
 * body keys here if your backend expects different names.
 */
export async function updateBooking(
  token: string,
  id: number,
  input: BookingUpdateInput,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.packageId != null) body.package_id = input.packageId;
  if (input.roomId != null) body.room_id = input.roomId;
  if (input.customerName != null) {
    body.customer_name = input.customerName;
    body.guest_name = input.customerName;
  }
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
  if (input.customerNotes !== undefined) body.customer_notes = input.customerNotes;
  if (input.internalNotes !== undefined) body.internal_notes = input.internalNotes;
  if (input.sendEmail != null) body.send_email = input.sendEmail;

  await apiRequest(`/api/bookings/${id}`, { method: "PATCH", token, body });
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
  const params = new URLSearchParams({ sort_by: "booking_date", sort_order: "desc" });
  if (locationId != null) params.append("location_id", String(locationId));
  const res = await apiRequest<{ data?: { bookings?: Record<string, unknown>[] } }>(
    `/api/bookings/export?${params.toString()}`,
    { token },
  );
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
    const res = await apiRequest<BookingsListResponse & { data: { bookings: RawBooking[] } }>(
      `/api/bookings/trashed?${params.toString()}`,
      { token, signal },
    );
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
    headers: { Accept: "application/json", Authorization: `Bearer ${params.token}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data?.message as string) ?? "Bulk import failed. Please check the CSV and try again.",
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
  if (params.locationId != null) qs.append("location_id", String(params.locationId));
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
