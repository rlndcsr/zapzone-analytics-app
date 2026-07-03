import { apiRequest } from "../lib/api";

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
  participants?: number | string | null;
  total_amount?: number | string | null;
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

/**
 * GET /api/packages?location_id= — selectable packages for the Edit form.
 * NOTE: route/field names are a best guess; adjust if your API differs.
 */
export async function fetchPackages(
  token: string,
  locationId?: number | null,
): Promise<PackageOption[]> {
  const qs = locationId != null ? `?location_id=${locationId}` : "";
  const res = await apiRequest<any>(`/api/packages${qs}`, { token });
  return extractList<any>(res, "packages").map((p) => ({
    id: Number(p.id),
    name: (p.name ?? "").toString().trim() || `Package #${p.id}`,
    price: p.price != null ? Number(p.price) : null,
  }));
}

/**
 * GET /api/rooms?location_id= — selectable spaces/rooms for the Edit form.
 * NOTE: route/field names are a best guess; adjust if your API differs.
 */
export async function fetchRooms(
  token: string,
  locationId?: number | null,
): Promise<RoomOption[]> {
  const qs = locationId != null ? `?location_id=${locationId}` : "";
  const res = await apiRequest<any>(`/api/rooms${qs}`, { token });
  return extractList<any>(res, "rooms").map((r) => ({
    id: Number(r.id),
    name: (r.name ?? "").toString().trim() || `Space #${r.id}`,
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
