import { ApiError, apiRequest, apiUrl, firstMediaUrl } from "../lib/api";
import {
  addOnUnitPrice,
  locationAddressLine,
} from "../lib/bookings/bookingDetailFields";
import { compareCheckInRows } from "../lib/checkin/checkInOrder";
import { fetchAllPages } from "../lib/fetchAllPages";
import { cardLabelFromPayments } from "../lib/payments/cardLabel";
import { normalizeCategory } from "../lib/venueCategories";
import type {
  AppliedDiscount as PricingAppliedDiscount,
  AppliedFee as PricingAppliedFee,
} from "./pricingService";

/** Booking status enum exactly as stored by the backend. */
export type BookingStatus =
  "pending" | "confirmed" | "checked-in" | "completed" | "cancelled";

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
  packageCategory: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  packageNameRaw: string | null;
  roomName: string;
  roomId: number | null;
  packageId: number | null;
  duration: number | null;
  durationUnit: string;
  durationMinutes: number;
  paymentMethod: string | null;
  /** "Visa ending in 1234" — the most relevant paid card, or null. */
  cardLabel: string | null;
  paymentStatus: string | null;
  locationId: number | null;
  locationName: string;
  createdAt: string | null;
  updatedAt: string | null;
  attractionCount: number;
  addOnCount: number;
  address: string | null;
  guestOfHonorName: string | null;
  guestOfHonorAge: number | null;
  customerNotes: string | null;
  specialRequests: string | null;
  /** Staff-only digest of the booking's notes log. Never shown to a guest. */
  internalNotes: string | null;
};

export type BookingAddOn = {
  id: number;
  /** Catalog add-on id — the web reads `pivot.add_on_id ?? id`. */
  addOnId: number;
  name: string;
  price: number | null;
  quantity: number;
  priceAtBooking: number;
  /** Charged per unit, resolved the way the web ViewBooking resolves it. */
  unitPrice: number;
  isForceAddOn: boolean;
};

/** A booking's attraction line, with the price frozen at booking time. */
export type BookingAttraction = {
  id: number;
  name: string;
  quantity: number;
  priceAtBooking: number;
};

/** One entry of the booking's `applied_discounts` json column. */
export type AppliedDiscount = {
  name: string;
  type: string;
  amount: number;
};

/** One row of the booking's payment history (`payments` morph relation). */
export type BookingPayment = {
  id: number | null;
  amount: number;
  method: string | null;
  status: string | null;
  createdAt: string | null;
  paidAt: string | null;
  cardType: string | null;
  cardLastFour: string | null;
  notes: string | null;
};

export type AppliedFee = {
  name: string;
  amount: number;
  applicationType: string;
  /** "4.87%" — shown beside the name, the way the web prints a stored fee. */
  label: string | null;
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
  /** Normalised package category — the web's second line under the package. */
  packageCategory: string | null;
  locationId: number | null;
  locationName: string;
  /** "123 Main St, Farmington, MI", or null when the venue has no address. */
  locationAddress: string | null;
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
  attractions: BookingAttraction[];
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string | null;
  /** "Visa ending in 1234" — the most relevant paid card, or null. */
  cardLabel: string | null;
  amountPaid: number;
  discountAmount: number;
  appliedFees: AppliedFee[];
  appliedDiscounts: AppliedDiscount[];
  promo: { code: string; discountPercentage: number | null } | null;
  giftCard: { code: string; balance: number } | null;
  payments: BookingPayment[];
  /** The extra confirmation checkboxes and how they were answered. */
  customFieldResponses: { id: number; label: string; value: boolean }[];
  customerNotes: string | null;
  specialRequests: string | null;
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
  updated_at?: string | null;
  address?: string | null;
  guest_address?: string | null;
  guest_of_honor_name?: string | null;
  guest_of_honor_age?: number | string | null;
  customer_notes?: string | null;
  notes?: string | null;
  special_requests?: string | null;
  // The digest the internal notes log rebuilds. The index selects this column, so
  // every list row carries it and the note badge works straight off the cache.
  internal_notes?: string | null;
  payment_status?: string | null;
  package?: {
    id?: number | null;
    name?: string | null;
    category?: string | null;
    display_label?: string | null;
  } | null;
  room_id?: number | null;
  package_id?: number | null;
  room?: { id?: number | null; name?: string | null } | null;
  location_id?: number | null;
  location?: { name?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  // Eager-loaded by the index as `attractions:id,name` / `addOns:id,name`.
  attractions?: RawBookingAttraction[] | null;
  add_ons?: RawAddOn[] | null;
  // Column-limited eager load, present on both the index and the show response.
  // Typed as the richer `RawPayment` (not `CardBearingPayment`) so it agrees
  // with `RawBookingDetail`'s own `payments` field rather than intersecting
  // into an unusable type.
  payments?: RawPayment[] | null;
};

type RawBookingAttraction = {
  id?: number;
  name?: string | null;
  pivot?: {
    attraction_id?: number | null;
    quantity?: number | string | null;
    price_at_booking?: number | string | null;
  } | null;
};

/** Raw shape of the full booking model returned by GET /api/bookings/{id}. */
export type RawBookingDetail = RawBooking & {
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
        /** "4.87%" — how the fee was worked out, frozen when it was applied. */
        fee_label?: string | null;
      }[]
    | null;
  package?: {
    id?: number | null;
    name?: string | null;
    price?: number | string | null;
    category?: string | null;
  } | null;
  room?: { id?: number | null; name?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  // The detail endpoint eager-loads the full location, unlike the index.
  location?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  discount_amount?: number | string | null;
  applied_discounts?:
    | {
        discount_name?: string | null;
        discount_type?: string | null;
        discount_amount?: number | string | null;
      }[]
    | null;
  promo?: {
    code?: string | null;
    discount_percentage?: number | string | null;
  } | null;
  gift_card?: { code?: string | null; balance?: number | string | null } | null;
  payments?: RawPayment[] | null;
  custom_field_responses?:
    | { id?: number | string | null; label?: string | null; value?: unknown }[]
    | null;
  add_ons?: RawAddOn[] | null;
  addOns?: RawAddOn[] | null;
};

type RawPayment = {
  id?: number | string | null;
  amount?: number | string | null;
  method?: string | null;
  status?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  card_type?: string | null;
  card_last_four?: string | null;
  notes?: string | null;
};

type RawAddOn = {
  id: number;
  name?: string | null;
  price?: number | string | null;
  is_force_add_on?: boolean | number | null;
  /** Per-package override price for a forced add-on (web reads this first). */
  price_each_packages?:
    { package_id?: number | null; price?: number | string | null }[] | null;
  pivot?: {
    add_on_id?: number | null;
    quantity?: number | string | null;
    price_at_booking?: number | string | null;
    price?: number | string | null;
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
    packageCategory:
      raw.package?.display_label?.trim() || raw.package?.category?.trim() || "",
    customerName: customerName(raw.customer, raw.guest_name),
    customerEmail:
      raw.customer?.email?.trim() || raw.guest_email?.trim() || null,
    customerPhone:
      raw.customer?.phone?.trim() || raw.guest_phone?.trim() || null,
    guestName: raw.guest_name?.trim() || null,
    guestEmail: raw.guest_email?.trim() || null,
    guestPhone: raw.guest_phone?.trim() || null,
    packageNameRaw: raw.package?.name?.trim() || null,
    roomName: raw.room?.name?.trim() || "",
    roomId: raw.room_id ?? raw.room?.id ?? null,
    packageId: raw.package_id ?? raw.package?.id ?? null,
    duration:
      durationRaw != null && !Number.isNaN(durationRaw) ? durationRaw : null,
    durationUnit: raw.duration_unit ?? "minutes",
    durationMinutes: durationToMinutes(
      durationRaw != null && !Number.isNaN(durationRaw) ? durationRaw : 0,
      raw.duration_unit,
    ),
    paymentMethod: raw.payment_method ?? null,
    cardLabel: cardLabelFromPayments(raw.payments),
    paymentStatus: raw.payment_status ?? null,
    locationId: raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
    attractionCount: raw.attractions?.length ?? 0,
    addOnCount: raw.add_ons?.length ?? 0,
    address: raw.address?.trim() || raw.guest_address?.trim() || null,
    guestOfHonorName: raw.guest_of_honor_name?.trim() || null,
    guestOfHonorAge: Number(raw.guest_of_honor_age) || null,
    customerNotes: raw.customer_notes?.trim() || raw.notes?.trim() || null,
    specialRequests: raw.special_requests?.trim() || null,
    internalNotes: raw.internal_notes?.trim() || null,
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

/**
 * Just the bookings inside a date window, paged newest-first.
 *
 * The calendar knows exactly which days it is drawing, so it has no business pulling the whole
 * history down and filtering it on the device: a venue with a few thousand bookings turned one
 * day's grid into a dozen round trips of data that is thrown away. The index endpoint takes
 * `date_from` / `date_to` (BookingController@index), so ask it for the window.
 */
export async function fetchBookingsInRange({
  token,
  locationId,
  from,
  to,
  signal,
}: FetchParams & { from: string; to: string }): Promise<CalendarBooking[]> {
  return fetchAllPages<CalendarBooking>(
    async (page) => {
      const res = await fetchPage(
        page,
        { date_from: from, date_to: to },
        { token, locationId, signal },
      );
      const bookings: CalendarBooking[] = [];
      for (const raw of res?.data?.bookings ?? []) {
        const date = toDateKey(raw.booking_date);
        if (date) bookings.push(mapBooking(raw, date));
      }
      return {
        items: bookings,
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: SYNC_MAX_PAGES },
  );
}

/** Every booking, paged newest-first. Callers filter by date and cache it. */
export async function fetchAllBookings({
  token,
  locationId,
  signal,
}: FetchParams): Promise<CalendarBooking[]> {
  let lastPage = 1;

  const out = await fetchAllPages<CalendarBooking>(
    async (page) => {
      const res = await fetchPage(page, {}, { token, locationId, signal });
      const bookings: CalendarBooking[] = [];
      for (const raw of res?.data?.bookings ?? []) {
        const date = toDateKey(raw.booking_date);
        if (date) bookings.push(mapBooking(raw, date));
      }
      const reported = res?.data?.pagination?.last_page ?? page;
      // Page 1 is the only page whose count decides the walk, so it is also the
      // only one the "older pages skipped" warning below should believe.
      if (page === 1) lastPage = reported;
      return { items: bookings, lastPage: reported };
    },
    { maxPages: SYNC_MAX_PAGES },
  );

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
  // Newest-created first: New Bookings is about when a booking was made, and
  // the default order (booking_date) would hand back the furthest-future ones.
  const params = new URLSearchParams({
    per_page: "500",
    sort_by: "created_at",
    sort_order: "desc",
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<BookingsListResponse>(
    `/api/bookings?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.bookings ?? [];
  return items.map((raw) => mapBooking(raw, toDateKey(raw.booking_date) ?? ""));
}

export async function searchBookings({
  token,
  term,
  locationId,
  limit = 20,
  signal,
}: {
  token: string;
  term: string;
  locationId?: number | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<CalendarBooking[]> {
  const params = new URLSearchParams({
    search: term,
    per_page: String(limit),
    sort_by: "booking_date",
    sort_order: "desc",
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<BookingsListResponse>(
    `/api/bookings?${params.toString()}`,
    { token, signal },
  );
  return (res?.data?.bookings ?? []).map((raw) =>
    mapBooking(raw, toDateKey(raw.booking_date) ?? ""),
  );
}

function mapAddOns(raw: RawBookingDetail): BookingAddOn[] {
  const list = raw.add_ons ?? raw.addOns ?? [];
  const packageId = raw.package_id ?? raw.package?.id ?? null;
  return list.map((a) => ({
    id: a.id,
    addOnId: Number(a.pivot?.add_on_id ?? a.id),
    name: a.name?.trim() || "Add-on",
    price: a.price != null ? Number(a.price) : null,
    quantity: Number(a.pivot?.quantity ?? 1),
    priceAtBooking: Number(a.pivot?.price_at_booking ?? 0),
    unitPrice: addOnUnitPrice(a, packageId),
    isForceAddOn: a.is_force_add_on === true || a.is_force_add_on === 1,
  }));
}

function mapBookingAttractions(raw: RawBookingDetail): BookingAttraction[] {
  return (raw.attractions ?? []).map((a) => ({
    id: Number(a.pivot?.attraction_id ?? a.id ?? 0),
    name: a.name?.trim() || "Attraction",
    quantity: Number(a.pivot?.quantity ?? 1),
    priceAtBooking: Number(a.pivot?.price_at_booking ?? 0),
  }));
}

export async function fetchBookingsForCheckIn({
  token,
  date,
  locationId,
  userId,
  signal,
}: {
  token: string;
  /** Venue day as YYYY-MM-DD. */
  date: string;
  locationId?: number | null;
  userId?: number;
  signal?: AbortSignal;
}): Promise<CalendarBooking[]> {
  const params = new URLSearchParams({
    booking_date: date,
    per_page: "100",
  });
  if (locationId != null) params.append("location_id", String(locationId));
  if (userId != null) params.append("user_id", String(userId));

  const res = await apiRequest<BookingsListResponse>(
    `/api/bookings?${params.toString()}`,
    { token, signal },
  );

  const out: CalendarBooking[] = [];
  for (const raw of res?.data?.bookings ?? []) {
    if (raw.status !== "confirmed" && raw.status !== "checked-in") continue;
    out.push(mapBooking(raw, toDateKey(raw.booking_date) ?? date));
  }

  return out.sort(compareCheckInRows);
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
  return mapBookingDetail(res.data);
}

/**
 * The booking model from `GET /api/bookings/{id}`, flattened for the Booking
 * Details screen. Kept separate from the request so the field-by-field parity
 * with the web admin's ViewBooking page can be unit-tested.
 */
export function mapBookingDetail(b: RawBookingDetail): BookingDetail {
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
    packageCategory: normalizeCategory(b.package?.category) || null,
    locationId: b.location_id ?? null,
    locationName: b.location?.name?.trim() || "",
    locationAddress: locationAddressLine(b.location),
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
    attractions: mapBookingAttractions(b),
    totalAmount: Number(b.total_amount ?? 0),
    paymentStatus: b.payment_status ?? "partial",
    paymentMethod: b.payment_method ?? null,
    cardLabel: cardLabelFromPayments(b.payments),
    amountPaid: Number(b.amount_paid ?? 0),
    discountAmount: Number(b.discount_amount ?? 0),
    appliedFees: (b.applied_fees ?? []).map((f) => ({
      name: f.fee_name ?? "Fee",
      amount: Number(f.fee_amount ?? 0),
      applicationType: f.fee_application_type ?? "additive",
      label: f.fee_label?.trim() || null,
    })),
    appliedDiscounts: (b.applied_discounts ?? []).map((d) => ({
      name: d.discount_name?.trim() || "Discount",
      type: d.discount_type?.trim() || "",
      amount: Number(d.discount_amount ?? 0),
    })),
    promo: b.promo?.code?.trim()
      ? {
          code: b.promo.code.trim(),
          discountPercentage:
            b.promo.discount_percentage != null
              ? Number(b.promo.discount_percentage)
              : null,
        }
      : null,
    giftCard: b.gift_card?.code?.trim()
      ? {
          code: b.gift_card.code.trim(),
          balance: Number(b.gift_card.balance ?? 0),
        }
      : null,
    payments: (b.payments ?? []).map((p) => ({
      id: p.id != null ? Number(p.id) : null,
      amount: Number(p.amount ?? 0),
      method: p.method?.trim() || null,
      status: p.status?.trim() || null,
      createdAt: p.created_at ?? null,
      paidAt: p.paid_at ?? null,
      cardType: p.card_type?.trim() || null,
      cardLastFour: p.card_last_four?.trim() || null,
      notes: p.notes?.trim() || null,
    })),
    customFieldResponses: (b.custom_field_responses ?? [])
      .filter((r) => !!r.label?.trim())
      .map((r, i) => ({
        id: r.id != null ? Number(r.id) : i,
        label: r.label!.trim(),
        // The column is a boolean cast, but a 0/1 or "1" still reaches us.
        value: r.value === true || r.value === 1 || r.value === "1",
      })),
    customerNotes: b.customer_notes ?? b.notes ?? null,
    specialRequests: b.special_requests?.trim() || null,
    internalNotes: b.internal_notes?.trim() || null,
    createdAt: b.created_at ?? null,
  };
}

export type BookingChangeValue = {
  from?: unknown;
  to?: unknown;
  redacted?: boolean;
};

/** One entry of a booking's immutable change history (backend activity_logs). */
export type BookingChangeLogEntry = {
  id: number;
  action: string;
  category: string | null;
  description: string | null;
  reason: string | null;
  employeeName: string;
  employeeRole: string | null;
  /** ISO timestamp, or null when the backend has none. */
  changedAt: string | null;
  changes: Record<string, BookingChangeValue> | null;
  changedFields: string[] | null;
  ipAddress: string | null;
};

type BookingChangeLogsResponse = {
  data?: {
    logs?: {
      id?: number | string;
      action?: string | null;
      category?: string | null;
      description?: string | null;
      reason?: string | null;
      employee_name?: string | null;
      employee_role?: string | null;
      changed_at?: string | null;
      changes?: unknown;
      changed_fields?: unknown;
      ip_address?: string | null;
    }[];
  } | null;
};

/** A plain `{ field: { from, to } }` map, or null for anything else the log
 *  metadata might hold (a list, a string, a missing key). */
function toChangeMap(
  value: unknown,
): Record<string, BookingChangeValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, BookingChangeValue> = {};
  for (const [field, change] of Object.entries(
    value as Record<string, unknown>,
  )) {
    out[field] =
      change && typeof change === "object" && !Array.isArray(change)
        ? (change as BookingChangeValue)
        : { from: undefined, to: change };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function fetchBookingChangeLogs(
  token: string,
  id: number,
  { perPage = 50, signal }: { perPage?: number; signal?: AbortSignal } = {},
): Promise<BookingChangeLogEntry[]> {
  const res = await apiRequest<BookingChangeLogsResponse>(
    `/api/bookings/${id}/change-logs?per_page=${perPage}`,
    { token, signal },
  );

  return (res?.data?.logs ?? []).map((log, index) => ({
    id: Number(log.id ?? index),
    action: log.action?.trim() || "Updated",
    category: log.category ?? null,
    description: log.description ?? null,
    reason: log.reason?.trim() || null,
    employeeName: log.employee_name?.trim() || "System",
    employeeRole: log.employee_role ?? null,
    changedAt: log.changed_at ?? null,
    changes: toChangeMap(log.changes),
    changedFields: Array.isArray(log.changed_fields)
      ? log.changed_fields.map((f) => String(f))
      : null,
    ipAddress: log.ip_address ?? null,
  }));
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

export async function deleteBooking(
  token: string,
  id: number,
  options?: { changeReason?: string },
): Promise<void> {
  await apiRequest(`/api/bookings/${id}`, {
    method: "DELETE",
    token,
    body: options?.changeReason
      ? { change_reason: options.changeReason }
      : undefined,
  });
}

export async function forceDeleteBooking(
  token: string,
  id: number,
): Promise<void> {
  await apiRequest(`/api/bookings/${id}/force-delete`, {
    method: "DELETE",
    token,
  });
}

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

/**
 * A booking's internal notes.
 *
 * These are a log, not a field. New information goes in as its own entry, a note can be corrected
 * but never emptied or deleted, and the version an edit replaces is kept with the editor's name on
 * it. The `internal_notes` column still exists as a readable digest the backend rebuilds after
 * every write — that is what the list rows and the note badge read, and what the cache holds.
 *
 * The old `PATCH /internal-notes` (replace the whole text) is gone; the backend answers it with a
 * 409 telling the caller to refresh, because that payload was the entire history plus an edit.
 */

/** A superseded version of a note, kept forever. */
export type InternalNoteRevision = {
  id: number;
  body: string;
  category: string | null;
  categoryLabel: string | null;
  editedByName: string | null;
  createdAt: string | null;
};

/** One entry in a booking's internal log. */
export type InternalNote = {
  id: number;
  body: string;
  category: string | null;
  categoryLabel: string | null;
  employeeName: string;
  employeeRole: string | null;
  createdAt: string | null;
  editedAt: string | null;
  editedByName: string | null;
  canEdit: boolean;
  /** Newest first. Empty when the note has never been corrected. */
  revisions: InternalNoteRevision[];
};

type RawInternalNoteRevision = {
  id?: number | string | null;
  body?: string | null;
  category?: string | null;
  category_label?: string | null;
  edited_by_name?: string | null;
  created_at?: string | null;
};

type RawInternalNote = RawInternalNoteRevision & {
  employee_name?: string | null;
  employee_role?: string | null;
  edited_at?: string | null;
  can_edit?: boolean | null;
  revisions?: RawInternalNoteRevision[] | null;
  /** The rebuilt digest, sent back on a write so a caller can refresh its copy. */
  internal_notes?: string | null;
};

function mapRevision(r: RawInternalNoteRevision): InternalNoteRevision {
  return {
    id: Number(r.id ?? 0),
    body: r.body ?? "",
    category: r.category ?? null,
    categoryLabel: r.category_label ?? null,
    editedByName: r.edited_by_name ?? null,
    createdAt: r.created_at ?? null,
  };
}

function mapInternalNote(n: RawInternalNote): InternalNote {
  return {
    ...mapRevision(n),
    employeeName: n.employee_name?.trim() || "Unknown employee",
    employeeRole: n.employee_role ?? null,
    editedAt: n.edited_at ?? null,
    editedByName: n.edited_by_name ?? null,
    canEdit: n.can_edit === true,
    revisions: (n.revisions ?? []).map(mapRevision),
  };
}

/** What a save gives back: the note itself, and the booking's rebuilt digest. */
export type InternalNoteSaved = {
  note: InternalNote;
  /**
   * The whole log as one readable block, straight from the server. Null once the log is empty.
   * `undefined` means the response carried none, and nothing should be written from it.
   */
  summary: string | null | undefined;
};

function mapSaved(res: { data?: RawInternalNote | null }): InternalNoteSaved {
  const data = res?.data ?? {};
  return {
    note: mapInternalNote(data),
    summary:
      "internal_notes" in data ? (data.internal_notes ?? null) : undefined,
  };
}

/** GET /api/bookings/{id}/internal-notes — the log, newest first, with each note's history. */
export async function fetchInternalNotes(
  token: string,
  bookingId: number,
  signal?: AbortSignal,
): Promise<{ notes: InternalNote[]; categories: Record<string, string> }> {
  const res = await apiRequest<{
    data?: {
      notes?: RawInternalNote[] | null;
      categories?: Record<string, string> | null;
    };
  }>(`/api/bookings/${bookingId}/internal-notes`, { token, signal });

  return {
    notes: (res?.data?.notes ?? []).map(mapInternalNote),
    categories: res?.data?.categories ?? {},
  };
}

/** POST /api/bookings/{id}/internal-notes — add a note. */
export async function addInternalNote(
  token: string,
  bookingId: number,
  body: string,
  category?: string | null,
): Promise<InternalNoteSaved> {
  const res = await apiRequest<{ data?: RawInternalNote | null }>(
    `/api/bookings/${bookingId}/internal-notes`,
    { method: "POST", token, body: { body, category: category || null } },
  );
  return mapSaved(res);
}

/** PUT /api/bookings/{id}/internal-notes/{noteId} — correct a note, keeping what it replaced. */
export async function updateInternalNote(
  token: string,
  bookingId: number,
  noteId: number,
  body: string,
  category?: string | null,
): Promise<InternalNoteSaved> {
  const res = await apiRequest<{ data?: RawInternalNote | null }>(
    `/api/bookings/${bookingId}/internal-notes/${noteId}`,
    { method: "PUT", token, body: { body, category: category || null } },
  );
  return mapSaved(res);
}

export type PackageOption = { id: number; name: string; price: number | null };
export type RoomOption = {
  id: number;
  name: string;
  bookingInterval: number | null;
};

/** Loosely pull an array out of the common `{data:{key:[]}}` / `{data:[]}` shapes. */
function extractList<T>(res: any, key: string): T[] {
  const d = res?.data ?? res;
  if (Array.isArray(d)) return d as T[];
  if (Array.isArray(d?.[key])) return d[key] as T[];
  return [];
}

const MAX_LOOKUP_PAGES = 20;

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

export type RoomOptions = {
  rooms: RoomOption[];
  slotCleanupMinutes: number | null;
};

export async function fetchRoomOptions(
  token: string,
  locationId?: number | null,
  /**
   * Restrict to rooms currently marked available. Off by default so the package
   * forms keep listing every room they can assign; the Change Location picker
   * turns it on, matching the web's `is_available` filter — offering a room a
   * venue has taken out of service would only produce a rejected save.
   */
  availableOnly = false,
): Promise<RoomOptions> {
  let slotCleanupMinutes: number | null = null;

  const out = await fetchAllPages<RoomOption>(
    async (page) => {
      const params = new URLSearchParams({
        per_page: "500",
        page: String(page),
      });
      if (locationId != null) params.append("location_id", String(locationId));
      if (availableOnly) params.append("is_available", "1");
      const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, {
        token,
      });
      const cleanup = res?.data?.slot_cleanup_minutes;
      if (slotCleanupMinutes == null && cleanup != null) {
        const minutes = Number(cleanup);
        if (Number.isFinite(minutes)) slotCleanupMinutes = minutes;
      }
      return {
        items: extractList<any>(res, "rooms").map((r) => ({
          id: Number(r.id),
          name: (r.name ?? "").toString().trim() || `Space #${r.id}`,
          bookingInterval:
            r.booking_interval != null &&
            Number.isFinite(Number(r.booking_interval))
              ? Number(r.booking_interval)
              : null,
        })),
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: MAX_LOOKUP_PAGES },
  );

  return { rooms: out, slotCleanupMinutes };
}

/** Just the spaces, for callers with no interest in the booking rules. */
export async function fetchRooms(
  token: string,
  locationId?: number | null,
): Promise<RoomOption[]> {
  return (await fetchRoomOptions(token, locationId)).rooms;
}

export type SpaceBreak = {
  days: string[];
  startTime: string;
  endTime: string;
};

export type Space = {
  id: number;
  name: string;
  capacity: number | null;
  locationId: number | null;
  breaks: SpaceBreak[];
  /** False for an out-of-service space — only present when fetched with
   *  `includeUnavailable` (the Space Schedule's own display fetch); the
   *  shared bookable-only fetch never returns one of these in the first place. */
  isAvailable: boolean;
};

type RawRoom = {
  id: number;
  name?: string | null;
  capacity?: number | string | null;
  area_group?: string | { name?: string | null } | null;
  booking_interval?: number | string | null;
  is_active?: boolean | number | null;
  is_available?: boolean | number | null;
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

export async function fetchSpaces({
  token,
  userId,
  includeUnavailable,
  signal,
}: {
  token: string;
  userId?: number;
  /** The Space Schedule needs out-of-service rooms too, so it can show them as
   *  unavailable — every other caller (the room picker, the Calendar tab) wants
   *  the default bookable-only list, so this stays opt-in. */
  includeUnavailable?: boolean;
  signal?: AbortSignal;
}): Promise<Space[]> {
  return fetchAllPages<Space>(
    async (page) => {
      const params = new URLSearchParams({
        per_page: "100",
        page: String(page),
      });
      if (userId != null) params.append("user_id", String(userId));
      if (includeUnavailable) params.append("include_unavailable", "true");
      const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, {
        token,
        signal,
      });
      return {
        items: extractList<RawRoom>(res, "rooms").map((r) => ({
          id: Number(r.id),
          name: (r.name ?? "").toString().trim() || `Space #${r.id}`,
          capacity: r.capacity != null ? Number(r.capacity) : null,
          locationId:
            r.location_id != null
              ? Number(r.location_id)
              : r.location?.id != null
                ? Number(r.location.id)
                : null,
          breaks: (r.break_time ?? []).map((b) => ({
            days: Array.isArray(b.days)
              ? b.days.map((d) => String(d).toLowerCase())
              : [],
            startTime: toTime(b.start_time) ?? String(b.start_time ?? ""),
            endTime: toTime(b.end_time) ?? String(b.end_time ?? ""),
          })),
          isAvailable: r.is_available !== false,
        })),
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: MAX_LOOKUP_PAGES },
  );
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
    days: Array.isArray(b.days)
      ? b.days.map((d) => String(d).toLowerCase())
      : [],
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
    bookingInterval:
      r.booking_interval != null ? Number(r.booking_interval) : null,
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
export function breaksToPayload(breaks: SpaceBreak[]): RoomInput["break_time"] {
  return breaks.map((b) => ({
    days: b.days,
    start_time: b.startTime,
    end_time: b.endTime,
  }));
}

export async function fetchSpaceList({
  token,
  userId,
  signal,
}: {
  token: string;
  userId?: number;
  signal?: AbortSignal;
}): Promise<SpaceRow[]> {
  return fetchAllPages<SpaceRow>(
    async (page) => {
      const params = new URLSearchParams({
        per_page: "100",
        page: String(page),
      });
      if (userId != null) params.append("user_id", String(userId));
      const res = await apiRequest<any>(`/api/rooms?${params.toString()}`, {
        token,
        signal,
      });
      return {
        items: extractList<RawRoom>(res, "rooms").map(mapSpaceRow),
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: MAX_LOOKUP_PAGES },
  );
}

type RoomMutationResponse = {
  success?: boolean;
  data?: RawRoom;
  message?: string;
};

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

export async function createPackageSpace(
  token: string,
  input: { name: string; locationId: number; packageId: number },
): Promise<PackageRoom> {
  const res = await apiRequest<RoomMutationResponse>("/api/rooms", {
    method: "POST",
    token,
    body: {
      location_id: input.locationId,
      name: input.name,
      is_available: true,
    },
  });
  const created = res?.data;
  if (!created?.id) throw new Error("Space was not created");

  try {
    await apiRequest("/api/packages/room/create", {
      method: "POST",
      token,
      body: { package_id: input.packageId, room_id: created.id },
    });
  } catch {
    // Linking is not fatal; the space exists and stays selectable.
  }

  return {
    id: Number(created.id),
    name: created.name?.trim() || input.name,
  };
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
  /** Assigned room name, when the endpoint eager-loads the relation. */
  roomName: string | null;
  packageId: number | null;
  packageCategory: string;
  referenceNumber: string | null;
  status: string;
  time: string | null;
  durationMinutes: number;
  participants: number;
  totalAmount: number;
  amountPaid: number;
  paymentStatus: string;
  packageName: string;
  customerName: string;
  guestOfHonorName: string | null;
  guestOfHonorAge: number | null;
  customerNotes: string | null;
  specialRequests: string | null;
  internalNotes: string | null;
};

type RawScheduleBooking = {
  id: number;
  reference_number?: string | null;
  status?: string | null;
  booking_time?: string | null;
  room_id?: number | null;
  room?: { id?: number | null; name?: string | null } | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  participants?: number | string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
  guest_name?: string | null;
  guest_of_honor_name?: string | null;
  guest_of_honor_age?: number | string | null;
  notes?: string | null;
  special_requests?: string | null;
  internal_notes?: string | null;
  package?: {
    id?: number | null;
    name?: string | null;
    category?: string | null;
  } | null;
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
    roomName: raw.room?.name?.trim() || null,
    packageId: raw.package?.id ?? null,
    packageCategory: raw.package?.category?.trim() || "",
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
    guestOfHonorName: raw.guest_of_honor_name?.trim() || null,
    guestOfHonorAge: Number(raw.guest_of_honor_age) || null,
    customerNotes: raw.notes?.trim() || null,
    specialRequests: raw.special_requests?.trim() || null,
    internalNotes: raw.internal_notes?.trim() || null,
  };
}

export async function fetchDaySchedule({
  token,
  date,
  userId,
  locationId,
  signal,
}: {
  token: string;
  date: string;
  userId?: number;
  locationId?: number;
  signal?: AbortSignal;
}): Promise<ScheduleBooking[]> {
  return fetchAllPages<ScheduleBooking>(
    async (page) => {
      const params = new URLSearchParams({
        booking_date: date,
        per_page: String(PER_PAGE),
        page: String(page),
      });
      if (userId != null) params.append("user_id", String(userId));
      if (locationId != null) params.append("location_id", String(locationId));
      const res = await apiRequest<{
        data?: {
          bookings?: RawScheduleBooking[];
          pagination?: { last_page?: number };
        };
      }>(`/api/bookings?${params.toString()}`, { token, signal });
      return {
        items: (res?.data?.bookings ?? []).map(mapScheduleBooking),
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: SYNC_MAX_PAGES },
  );
}

/** Statuses that occupy a space, so only these are counted per day. */
const COUNTED_SCHEDULE_STATUSES = new Set([
  "confirmed",
  "checked-in",
  "pending",
]);

export async function fetchBookingCountsByDate({
  token,
  from,
  to,
  userId,
  locationId,
  signal,
}: {
  token: string;
  from: string;
  to: string;
  userId?: number;
  locationId?: number;
  signal?: AbortSignal;
}): Promise<Record<string, number>> {
  // Each page contributes the date keys of its countable bookings; the tally
  // happens once at the end so pages can land in any order.
  const dateKeys = await fetchAllPages<string>(
    async (page) => {
      const params = new URLSearchParams({
        date_from: from,
        date_to: to,
        per_page: String(PER_PAGE),
        page: String(page),
      });
      if (userId != null) params.append("user_id", String(userId));
      if (locationId != null) params.append("location_id", String(locationId));
      const res = await apiRequest<{
        data?: {
          bookings?: { booking_date?: string | null; status?: string | null }[];
          pagination?: { last_page?: number };
        };
      }>(`/api/bookings?${params.toString()}`, { token, signal });
      const keys: string[] = [];
      for (const raw of res?.data?.bookings ?? []) {
        // booking_date comes back as a bare date, but tolerate a timestamp.
        const key = String(raw.booking_date ?? "").split("T")[0];
        if (!key || !COUNTED_SCHEDULE_STATUSES.has(String(raw.status ?? "")))
          continue;
        keys.push(key);
      }
      return {
        items: keys,
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: SYNC_MAX_PAGES },
  );

  const counts: Record<string, number> = {};
  for (const key of dateKeys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

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

export type PackageAvailabilitySchedule = {
  availabilityType: "daily" | "weekly" | "monthly" | string;
  dayConfiguration: string[] | null;
  isActive: boolean;
  timeSlotStart: string | null;
  timeSlotEnd: string | null;
};

export type AvailableSlot = {
  startTime: string;
  endTime: string;
  roomId: number | null;
  roomName: string | null;
  remainingTickets: number | null;
  /**
   * Every space still free for this start, not just the one the server picked.
   *
   * `roomId` is only the first of these. The whole set is what says whether a
   * booking taking one space would strip this start from the website or merely
   * narrow the choice — which is the difference between warning staff and
   * saying nothing. Empty for a slot the client synthesised.
   */
  availableRoomIds: number[];
  /**
   * The smallest party the package accepts on THIS date — special pricing can
   * raise a package's own minimum for a given day, which is why it rides on the
   * slot rather than on the package. Null for a slot the client synthesised.
   */
  minParticipants: number | null;
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
    timeSlotStart: s.time_slot_start ?? null,
    timeSlotEnd: s.time_slot_end ?? null,
  }));
}

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
  return (Array.isArray(slots) ? slots : []).map((s: any) => {
    const left =
      s.remaining_tickets == null ? null : Number(s.remaining_tickets);
    const min = s.min_participants == null ? null : Number(s.min_participants);
    return {
      startTime: toTime(s.start_time) ?? String(s.start_time ?? ""),
      endTime: toTime(s.end_time) ?? String(s.end_time ?? ""),
      roomId: s.room_id ?? null,
      roomName: s.room_name ?? null,
      availableRoomIds: Array.isArray(s.available_room_ids)
        ? s.available_room_ids
            .map((id: unknown) => Number(id))
            .filter((id: number) => Number.isFinite(id))
        : [],
      remainingTickets: left != null && !Number.isNaN(left) ? left : null,
      minParticipants: min != null && !Number.isNaN(min) ? min : null,
    };
  });
}

export type BookingUpdateInput = {
  locationId?: number | null;
  packageId?: number | null;
  roomId?: number | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  date?: string;
  time?: string;
  duration?: number;
  durationUnit?: string;
  participants?: number;
  status?: string;
  guestOfHonorName?: string | null;
  guestOfHonorAge?: number | null;
  guestOfHonorGender?: string | null;
  customerNotes?: string | null;
  // No internalNotes here on purpose: notes are an append-only log now, written only through
  // addInternalNote/updateInternalNote. The backend leaves internal_notes out of this endpoint's
  // validation precisely so an ordinary save cannot replace the whole history.
  sendEmail?: boolean;
  additionalAddons?: {
    addon_id: number;
    quantity: number;
    price_at_booking: number;
  }[];

  additionalAttractions?: {
    attraction_id: number;
    quantity: number;
    price_at_booking?: number;
  }[];

  totalAmount?: number;
  discountAmount?: number;
  appliedFees?: BookingQuoteFee[] | null;
  amountPaid?: number;
  paymentStatus?: string;
  /** Sent up front only when retrying with a reason already given, so it is not asked twice. */
  changeReason?: string;
  /** A manager's approval, when moving this booking onto a time that is already taken. */
  overlapOverrideToken?: string;
};

/** One reason the destination room can't take this booking, from a 409. */
export type LocationConflict = { type: string; message: string };

/**
 * PATCH /api/bookings/{id}/location — move a booking to another venue.
 *
 * The backend answers 409 with `{ conflict: true, conflicts: [...] }` when the
 * destination room is already occupied, too close to a neighbouring booking in
 * the same area group, or overlapping a scheduled break. That is a question,
 * not a failure: resending with `force` overrides it, which is what the web's
 * "Change anyway" button does. Read the list with {@link locationConflictsOf}.
 *
 * `roomId: null` clears the assignment, but the backend refuses that for a
 * booking that currently HAS a room (422) rather than silently unassigning it.
 */
export async function updateBookingLocation(
  token: string,
  id: number,
  {
    locationId,
    roomId,
    force,
  }: { locationId: number; roomId: number | null; force?: boolean },
): Promise<void> {
  await apiRequest(`/api/bookings/${id}/location`, {
    method: "PATCH",
    token,
    body: {
      location_id: locationId,
      room_id: roomId,
      ...(force ? { force: true } : {}),
    },
  });
}

/**
 * The conflicts behind a rejected location change, or [] for any other error.
 * Only a 409 carries them, so anything else is a real failure to surface.
 */
export function locationConflictsOf(err: unknown): LocationConflict[] {
  if (!(err instanceof ApiError) || err.status !== 409) return [];
  const list = (err.body as { conflicts?: unknown } | undefined)?.conflicts;
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({
      type: String((c as LocationConflict)?.type ?? ""),
      message: String((c as LocationConflict)?.message ?? "").trim(),
    }))
    .filter((c) => !!c.message);
}

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
  if (input.duration != null) body.duration = input.duration;
  if (input.durationUnit != null) body.duration_unit = input.durationUnit;
  if (input.participants != null) body.participants = input.participants;
  if (input.status != null) body.status = input.status;
  if (input.guestOfHonorName !== undefined)
    body.guest_of_honor_name = input.guestOfHonorName;
  if (input.guestOfHonorAge !== undefined)
    body.guest_of_honor_age = input.guestOfHonorAge;
  if (input.guestOfHonorGender !== undefined)
    body.guest_of_honor_gender = input.guestOfHonorGender;
  if (input.customerNotes !== undefined) body.notes = input.customerNotes;
  if (input.sendEmail != null) body.send_notification = input.sendEmail;
  if (input.additionalAddons !== undefined)
    body.additional_addons = input.additionalAddons;
  if (input.additionalAttractions !== undefined)
    body.additional_attractions = input.additionalAttractions;
  if (input.totalAmount !== undefined) body.total_amount = input.totalAmount;
  if (input.discountAmount !== undefined)
    body.discount_amount = input.discountAmount;
  if (input.appliedFees !== undefined) {
    body.applied_fees =
      input.appliedFees && input.appliedFees.length > 0
        ? input.appliedFees.map((fee) => ({
            fee_name: fee.feeName,
            fee_amount: fee.feeAmount,
            fee_application_type: fee.feeApplicationType,
            ...(fee.feeLabel != null ? { fee_label: fee.feeLabel } : {}),
            ...(fee.feeCalculationType != null
              ? { fee_calculation_type: fee.feeCalculationType }
              : {}),
          }))
        : null;
  }
  if (input.amountPaid !== undefined) body.amount_paid = input.amountPaid;
  if (input.paymentStatus !== undefined)
    body.payment_status = input.paymentStatus;
  if (input.changeReason) body.change_reason = input.changeReason;
  if (input.overlapOverrideToken)
    body.overlap_override_token = input.overlapOverrideToken;

  await apiRequest(`/api/bookings/${id}`, { method: "PUT", token, body });
}

export type BookingQuoteFee = {
  feeName: string;
  feeLabel: string | null;
  feeAmount: number;
  feeCalculationType: "fixed" | "percentage" | null;
  feeApplicationType: "additive" | "inclusive";
};

/** One priced line (the package itself, an add-on, or an attraction). */
export type BookingQuoteLine = {
  type: "package" | "addon" | "attraction";
  id: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type BookingQuote = {
  subtotal: number;
  lines: BookingQuoteLine[];
  fees: BookingQuoteFee[];
  persistFees: BookingQuoteFee[];
  additiveFees: number;
  specialPricingDiscount: number;
  membershipDiscount: number;
  redeemedCredit: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  remainingBalance: number;
  paymentStatus: string;
  delta: number | null;
  pricingConsistent: boolean | null;
};

export type BookingRepriceIntent = {
  participants?: number;
  packageId?: number | null;
  date?: string;
  locationId?: number;
  additionalAddons?: { addon_id: number; quantity: number }[];
  additionalAttractions?: { attraction_id: number; quantity: number }[];
};

function toQuoteFee(raw: Record<string, unknown>): BookingQuoteFee {
  return {
    feeName: String(raw.fee_name ?? ""),
    feeLabel: (raw.fee_label as string | null) ?? null,
    feeAmount: Number(raw.fee_amount ?? 0),
    feeCalculationType:
      (raw.fee_calculation_type as "fixed" | "percentage" | null) ?? null,
    feeApplicationType:
      raw.fee_application_type === "inclusive" ? "inclusive" : "additive",
  };
}

export async function repriceBooking(
  token: string,
  id: number,
  intent: BookingRepriceIntent,
  signal?: AbortSignal,
): Promise<BookingQuote> {
  const body: Record<string, unknown> = {};
  if (intent.participants != null) body.participants = intent.participants;
  if (intent.packageId !== undefined) body.package_id = intent.packageId;
  if (intent.date != null) body.booking_date = intent.date;
  if (intent.locationId != null) body.location_id = intent.locationId;
  if (intent.additionalAddons !== undefined)
    body.additional_addons = intent.additionalAddons;
  if (intent.additionalAttractions !== undefined)
    body.additional_attractions = intent.additionalAttractions;

  const res = await apiRequest<{ data?: Record<string, unknown> }>(
    `/api/bookings/${id}/reprice`,
    { method: "POST", token, body, signal },
  );

  const q = res?.data;
  if (!q) throw new Error("The server returned no price for this change.");

  return {
    subtotal: Number(q.subtotal ?? 0),
    lines: Array.isArray(q.lines)
      ? (q.lines as Record<string, unknown>[]).map((l) => ({
          type: l.type as BookingQuoteLine["type"],
          id: Number(l.id ?? 0),
          unitPrice: Number(l.unit_price ?? 0),
          quantity: Number(l.quantity ?? 0),
          lineTotal: Number(l.line_total ?? 0),
        }))
      : [],
    fees: Array.isArray(q.fees)
      ? (q.fees as Record<string, unknown>[]).map(toQuoteFee)
      : [],
    persistFees: Array.isArray(q.persist_fees)
      ? (q.persist_fees as Record<string, unknown>[]).map(toQuoteFee)
      : [],
    additiveFees: Number(q.additive_fees ?? 0),
    specialPricingDiscount: Number(q.special_pricing_discount ?? 0),
    membershipDiscount: Number(q.membership_discount ?? 0),
    redeemedCredit: Number(q.redeemed_credit ?? 0),
    discountAmount: Number(q.discount_amount ?? 0),
    totalAmount: Number(q.total_amount ?? 0),
    amountPaid: Number(q.amount_paid ?? 0),
    remainingBalance: Number(q.remaining_balance ?? 0),
    paymentStatus: String(q.payment_status ?? "pending"),
    delta: q.delta == null ? null : Number(q.delta),
    pricingConsistent:
      q.pricing_consistent == null ? null : Boolean(q.pricing_consistent),
  };
}

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

export type TrashedBooking = CalendarBooking & { deletedAt: string | null };

export async function fetchTrashedBookings({
  token,
  locationId,
  signal,
}: FetchParams): Promise<TrashedBooking[]> {
  return fetchAllPages<TrashedBooking>(
    async (page) => {
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
      return {
        items: (res?.data?.bookings ?? []).map((raw) => ({
          ...mapBooking(raw, toDateKey(raw.booking_date) ?? ""),
          deletedAt: raw.deleted_at ?? null,
        })),
        lastPage: res?.data?.pagination?.last_page ?? page,
      };
    },
    { maxPages: SYNC_MAX_PAGES },
  );
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

export type ReportPeriod = "today" | "monthly" | "custom";

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

/** Payment methods the Process Payment form offers (mirrors the web modal). */
export type BookingPaymentMethod = "in-store" | "authorize.net";

export async function recordBookingPayment(
  token: string,
  params: {
    bookingId: number;
    amount: number;
    locationId: number | null;
    customerId: number | null;
    method?: BookingPaymentMethod;
    notes?: string | null;
    referenceNumber?: string | null;
  },
): Promise<void> {
  const method = params.method ?? "in-store";
  const defaultNote = params.referenceNumber
    ? `${method === "in-store" ? "In-store" : "Authorize.net"} payment for booking ${params.referenceNumber}`
    : "Recorded from analytics app";

  await apiRequest(`/api/payments`, {
    method: "POST",
    token,
    body: {
      payable_id: params.bookingId,
      payable_type: "booking",
      customer_id: params.customerId ?? undefined,
      location_id: params.locationId ?? undefined,
      amount: params.amount,
      currency: "USD",
      method,
      status: "completed",
      notes: params.notes?.trim() || defaultNote,
    },
  });
}

export type PackageAddOn = {
  id: number;
  name: string;
  price: number;
  image: string | null;
  pricingType: string;
  minQuantity: number | null;
  maxQuantity: number | null;
  isForced: boolean;
  priceEachPackages:
    { package_id: number; price?: number; minimum_quantity?: number }[] | null;
};
export type PackageAttraction = {
  id: number;
  name: string;
  price: number;
  pricingType: string;
  image: string | null;
  minQuantity: number | null;
  maxQuantity: number | null;
};

export type BookablePackage = {
  id: number;
  name: string;
  category: string;
  description: string;
  image: string | null;
  price: number;
  pricePerAdditional: number;
  pricingType: "base" | "per_person";
  minParticipants: number;
  maxParticipants: number;

  maxTicketsPerSlot: number | null;
  participantLabel: string;
  duration: number;
  durationUnit: "hours" | "minutes" | "hours and minutes";
  hasGuestOfHonor: boolean;
  timeSlotInterval: number;
  partialPaymentPercentage: number | null;
  partialPaymentFixed: number | null;
  locationId: number | null;
  isActive: boolean;
  addOns: PackageAddOn[];
  attractions: PackageAttraction[];
  rooms: PackageRoom[];
};

/** A bookable space attached to a package. */
export type PackageRoom = {
  id: number;
  name: string;
};

type RawPackage = {
  id: number;
  name?: string | null;
  description?: string | null;
  category?: string | null;

  image?: string | string[] | null;
  is_active?: boolean | number | null;
  price?: number | string | null;
  price_per_additional?: number | string | null;
  pricing_type?: string | null;
  min_participants?: number | string | null;
  max_participants?: number | string | null;
  max_tickets_per_slot?: number | string | null;
  participant_label?: string | null;
  duration?: number | string | null;
  duration_unit?: string | null;
  has_guest_of_honor?: boolean | null;
  time_slot_interval?: number | string | null;
  partial_payment_percentage?: number | string | null;
  partial_payment_fixed?: number | string | null;
  location_id?: number | null;
  location?: { id?: number | null; name?: string | null } | null;
  add_ons?: RawPackageAddOn[] | null;
  attractions?: RawPackageAttraction[] | null;
  rooms?: { id: number; name?: string | null }[] | null;
};

type RawPackageAddOn = {
  id: number;
  name?: string | null;
  price?: number | string | null;
  image?: string | string[] | null;
  pricing_type?: string | null;
  min_quantity?: number | string | null;
  max_quantity?: number | string | null;
  is_force_add_on?: boolean | number | null;
  price_each_packages?:
    { package_id: number; price?: number; minimum_quantity?: number }[] | null;
};

type RawPackageAttraction = {
  id: number;
  name?: string | null;
  price?: number | string | null;
  pricing_type?: string | null;
  image?: string | string[] | null;
  min_quantity?: number | string | null;
  max_quantity?: number | string | null;
};

function optionalCount(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapBookablePackage(raw: RawPackage): BookablePackage {
  const unit = raw.duration_unit;
  const durationUnit: BookablePackage["durationUnit"] =
    unit === "minutes" || unit === "hours and minutes" ? unit : "hours";
  const ticketCap =
    raw.max_tickets_per_slot == null || raw.max_tickets_per_slot === ""
      ? null
      : Number(raw.max_tickets_per_slot);
  return {
    id: raw.id,
    name: raw.name?.trim() || `Package #${raw.id}`,
    category: raw.category?.trim() || "",
    description: raw.description?.trim() || "",
    image: firstMediaUrl(raw.image),
    price: Number(raw.price ?? 0),
    pricePerAdditional: Number(raw.price_per_additional ?? 0),
    pricingType: raw.pricing_type === "per_person" ? "per_person" : "base",
    minParticipants: Number(raw.min_participants ?? 1) || 1,
    maxParticipants: Number(raw.max_participants ?? 0) || 0,
    maxTicketsPerSlot:
      ticketCap != null && !Number.isNaN(ticketCap) ? ticketCap : null,
    participantLabel: raw.participant_label?.trim() || "",
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
    isActive: raw.is_active !== false && raw.is_active !== 0,
    addOns: (raw.add_ons ?? []).map((a) => ({
      id: Number(a.id),
      name: a.name?.trim() || `Add-on #${a.id}`,
      price: Number(a.price ?? 0),
      image: firstMediaUrl(a.image),
      pricingType: a.pricing_type ?? "flat",
      minQuantity: optionalCount(a.min_quantity),
      maxQuantity: optionalCount(a.max_quantity),
      isForced: a.is_force_add_on === true || a.is_force_add_on === 1,
      priceEachPackages: Array.isArray(a.price_each_packages)
        ? a.price_each_packages
        : null,
    })),
    attractions: (raw.attractions ?? []).map((a) => ({
      id: Number(a.id),
      name: a.name?.trim() || `Attraction #${a.id}`,
      price: Number(a.price ?? 0),
      pricingType: a.pricing_type ?? "flat",
      image: firstMediaUrl(a.image),
      minQuantity: optionalCount(a.min_quantity),
      maxQuantity: optionalCount(a.max_quantity),
    })),
    rooms: (raw.rooms ?? []).map((r) => ({
      id: Number(r.id),
      name: r.name?.trim() || `Space #${r.id}`,
    })),
  };
}

export type PackageListItem = {
  id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  duration: number;
  durationUnit: BookablePackage["durationUnit"];
  minParticipants: number;
  maxParticipants: number;
  isActive: boolean;
  locationId: number | null;
  locationName: string;
};

function mapPackageListItem(raw: RawPackage): PackageListItem {
  const unit = raw.duration_unit;
  return {
    id: raw.id,
    name: raw.name?.trim() || `Package #${raw.id}`,
    description: raw.description?.trim() || "",
    category: raw.category?.trim() || "",
    price: Number(raw.price ?? 0),
    duration: Number(raw.duration ?? 0),
    durationUnit:
      unit === "minutes" || unit === "hours and minutes" ? unit : "hours",
    minParticipants: Number(raw.min_participants ?? 1) || 1,
    maxParticipants: Number(raw.max_participants ?? 0) || 0,
    isActive: raw.is_active !== false && raw.is_active !== 0,
    locationId: raw.location?.id ?? raw.location_id ?? null,
    locationName: raw.location?.name?.trim() || "",
  };
}

export type PackageListPage = {
  items: PackageListItem[];
  page: number;
  lastPage: number;
};

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

export type CreateBookingInput = {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  location_id: number;
  package_id: number;
  room_id?: number;
  type: "package";
  booking_date: string;
  booking_time: string;
  participants: number;
  duration: number;
  duration_unit: string;
  total_amount: number;
  amount_paid: number;
  payment_method: "authorize.net" | "in-store" | "paylater";
  status?: BookingStatus;
  payment_status?: "paid" | "partial" | "pending";
  is_manual_entry?: boolean;
  skip_date_validation?: boolean;
  /** proof a manager approved saving this on top of a detected overlap */
  overlap_override_token?: string;
  notes?: string;
  // No internal_notes: a booking is never created with one. Notes are an append-only
  // log, added after the fact through addInternalNote.
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

export type ChangeReasonOptions = {
  presets: string[];
  policy: "off" | "guest_visible" | "all";
};

export async function fetchChangeReasonOptions(
  token: string,
  signal?: AbortSignal,
): Promise<ChangeReasonOptions> {
  const res = await apiRequest<{
    success: boolean;
    data: { presets?: string[] | null; policy?: string | null };
  }>("/api/bookings/change-reason-options", { token, signal });
  const policy = res?.data?.policy;
  return {
    presets: Array.isArray(res?.data?.presets) ? res.data.presets : [],
    policy: policy === "off" || policy === "all" ? policy : "guest_visible",
  };
}
