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
  packagePrice: number | null;
  locationId: number | null;
  locationName: string;
  customerId: number | null;
  roomName: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  guestOfHonorName: string | null;
  guestOfHonorAge: number | null;
  addOns: BookingAddOn[];
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string | null;
  amountPaid: number;
  appliedFees: AppliedFee[];
  internalNotes: string | null;
};

/** Raw shape of a booking in the list response (index select set). */
type RawBooking = {
  id: number;
  reference_number?: string | null;
  status?: string;
  booking_date?: string | null;
  booking_time?: string | null;
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
  applied_fees?:
    | { fee_name?: string; fee_amount?: number | string; fee_application_type?: string }[]
    | null;
  package?: { name?: string | null; price?: number | string | null } | null;
  room?: { name?: string | null } | null;
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

const PER_PAGE = 100;
// Safety cap so navigating to a far-past month can't page forever. The list is
// sorted newest-first, so reaching a month before today costs one page per ~100
// newer bookings; this bounds that to 60 pages (~6,000 bookings).
const MAX_PAGES = 60;

const pad2 = (n: number) => String(n).padStart(2, "0");

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

/** Exact single-day fetch via the index's booking_date filter (cheap path). */
async function fetchSingleDay(
  date: string,
  params: FetchParams,
): Promise<CalendarBooking[]> {
  const out: CalendarBooking[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(page, { booking_date: date }, params);
    const items = res?.data?.bookings ?? [];
    for (const raw of items) {
      const d = toDateKey(raw.booking_date);
      if (d) out.push(mapBooking(raw, d));
    }
    const pg = res?.data?.pagination;
    if (!pg || page >= pg.last_page || items.length === 0) break;
  }
  return out;
}

/**
 * Page through one month (newest-first) and append bookings whose date falls in
 * [rangeLo, rangeHi]. Stops as soon as it crosses below the month's first day,
 * since every later page is older still.
 */
async function collectMonth(
  out: CalendarBooking[],
  year: number,
  month: number,
  rangeLo: string,
  rangeHi: string,
  params: FetchParams,
): Promise<void> {
  const monthStart = `${year}-${pad2(month)}-01`;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchPage(page, {}, params);
    const items = res?.data?.bookings ?? [];
    if (items.length === 0) break;

    let reachedPast = false;
    for (const raw of items) {
      const date = toDateKey(raw.booking_date);
      if (!date) continue;
      if (date < monthStart) {
        reachedPast = true;
        continue;
      }
      if (date < rangeLo || date > rangeHi) continue;
      out.push(mapBooking(raw, date));
    }

    const pg = res?.data?.pagination;
    if (reachedPast || !pg || page >= pg.last_page) break;
  }
}

export type FetchRangeParams = {
  token: string;
  /** Inclusive start, YYYY-MM-DD. */
  startDate: string;
  /** Inclusive end, YYYY-MM-DD. */
  endDate: string;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * All bookings whose date falls within [startDate, endDate].
 *
 * The bookings index has no date-range filter, so for multi-day ranges we scan
 * each spanned month newest-first; single days use the exact booking_date
 * filter. Powers the month / week / day calendar views from one entry point.
 */
export async function fetchBookingsInRange({
  token,
  startDate,
  endDate,
  locationId,
  signal,
}: FetchRangeParams): Promise<CalendarBooking[]> {
  const params: FetchParams = { token, locationId, signal };

  if (startDate === endDate) {
    return fetchSingleDay(startDate, params);
  }

  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);
  const out: CalendarBooking[] = [];

  let year = sy;
  let month = sm;
  while (year < ey || (year === ey && month <= em)) {
    const lastDay = new Date(year, month, 0).getDate();
    const monthStart = `${year}-${pad2(month)}-01`;
    const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
    const lo = startDate > monthStart ? startDate : monthStart;
    const hi = endDate < monthEnd ? endDate : monthEnd;

    await collectMonth(out, year, month, lo, hi, params);

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return out;
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
    packagePrice: b.package?.price != null ? Number(b.package.price) : null,
    locationId: b.location_id ?? null,
    locationName: b.location?.name?.trim() || "",
    customerId: b.customer_id ?? null,
    roomName: b.room?.name?.trim() || null,
    customerName: customerName(b.customer, b.guest_name),
    customerEmail: b.customer?.email ?? b.guest_email ?? null,
    customerPhone: b.customer?.phone ?? b.guest_phone ?? null,
    guestOfHonorName: b.guest_of_honor_name?.trim() || null,
    guestOfHonorAge: b.guest_of_honor_age ?? null,
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
    internalNotes: b.internal_notes?.trim() || null,
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

/**
 * POST /api/payments — record an in-store payment against a booking. The
 * backend recomputes the booking's amount_paid / payment_status. (Card charges
 * need on-device Accept.js tokenization, which this app doesn't carry, so this
 * records a manual in-store payment for the outstanding balance.)
 */
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
