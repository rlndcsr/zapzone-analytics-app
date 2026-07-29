import { ApiError, apiRequest } from "../lib/api";

/*
 * Location change requests — staff asking to move a booking to another location.
 * Mirrors the web `LocationChangeRequestService` against the same endpoints:
 *   GET   /api/location-change-requests[?status=]
 *   PATCH /api/location-change-requests/{id}/approve   (body: { force })
 *   PATCH /api/location-change-requests/{id}/reject    (body: { review_notes })
 *
 * The backend scopes the list itself: company admins see every request for the
 * company, everyone else sees requests touching their own location (or ones they
 * raised), so the client never filters by role.
 */

export type LocationChangeRequestStatus = "pending" | "approved" | "rejected";

/** A destination clash reported when approving (HTTP 409). */
export type LocationChangeConflict = { message: string };

/** One request, flattened for the list screen. */
export type LocationChangeRequest = {
  id: number;
  status: LocationChangeRequestStatus;
  bookingId: number;
  /** "BK2026… · Jane Doe" — reference plus whoever the booking is for. */
  bookingLabel: string;
  bookingPackageName: string | null;
  bookingDate: string | null;
  fromLocationName: string;
  toLocationName: string;
  roomName: string | null;
  reason: string | null;
  requesterName: string | null;
  createdAt: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  /** Destination location id — drives who may review the request. */
  toLocationId: number | null;
};

type RawPerson = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type RawRequest = {
  id: number;
  status?: string | null;
  booking_id?: number | null;
  from_location_id?: number | null;
  to_location_id?: number | null;
  reason?: string | null;
  review_notes?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  booking?: {
    reference_number?: string | null;
    guest_name?: string | null;
    booking_date?: string | null;
    package?: { name?: string | null } | null;
    customer?: RawPerson | null;
  } | null;
  from_location?: { name?: string | null } | null;
  to_location?: { name?: string | null } | null;
  room?: { name?: string | null } | null;
  requester?: RawPerson | null;
  reviewer?: RawPerson | null;
};

const personName = (p: RawPerson | null | undefined): string | null => {
  if (!p) return null;
  const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return p.name?.trim() || full || null;
};

function mapRequest(raw: RawRequest): LocationChangeRequest {
  const reference =
    raw.booking?.reference_number?.trim() || `#${raw.booking_id ?? raw.id}`;
  const customer =
    personName(raw.booking?.customer) || raw.booking?.guest_name?.trim() || "";

  return {
    id: raw.id,
    status: (raw.status ?? "pending") as LocationChangeRequestStatus,
    bookingId: raw.booking_id ?? 0,
    bookingLabel: customer ? `${reference} · ${customer}` : reference,
    bookingPackageName: raw.booking?.package?.name?.trim() || null,
    bookingDate: raw.booking?.booking_date ?? null,
    fromLocationName:
      raw.from_location?.name?.trim() || `Location #${raw.from_location_id ?? "?"}`,
    toLocationName:
      raw.to_location?.name?.trim() || `Location #${raw.to_location_id ?? "?"}`,
    roomName: raw.room?.name?.trim() || null,
    reason: raw.reason?.trim() || null,
    requesterName: personName(raw.requester),
    createdAt: raw.created_at ?? null,
    reviewerName: personName(raw.reviewer),
    reviewedAt: raw.reviewed_at ?? null,
    reviewNotes: raw.review_notes?.trim() || null,
    toLocationId: raw.to_location_id ?? null,
  };
}

/** GET /api/location-change-requests — omit `status` for the "All" tab. */
export async function fetchLocationChangeRequests({
  token,
  status,
  signal,
}: {
  token: string;
  status?: LocationChangeRequestStatus;
  signal?: AbortSignal;
}): Promise<LocationChangeRequest[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await apiRequest<{ success: boolean; data?: RawRequest[] }>(
    `/api/location-change-requests${qs}`,
    { token, signal },
  );
  return (res?.data ?? []).map(mapRequest);
}

/** Thrown when approving hits destination conflicts (HTTP 409). */
export class LocationChangeConflictError extends Error {
  readonly conflicts: LocationChangeConflict[];
  constructor(conflicts: LocationChangeConflict[]) {
    super("Scheduling conflict at destination");
    this.name = "LocationChangeConflictError";
    this.conflicts = conflicts;
  }
}

/**
 * PATCH …/approve. Without `force` the backend validates the destination and
 * answers 409 with the clashes; pass `force` to override them.
 */
export async function approveLocationChangeRequest(
  token: string,
  id: number,
  force = false,
): Promise<void> {
  try {
    await apiRequest(`/api/location-change-requests/${id}/approve`, {
      method: "PATCH",
      token,
      body: force ? { force: true } : {},
    });
  } catch (err) {
    // A 409 body carries the clash list; surface it as its own error type so the
    // screen can offer "Approve anyway".
    if (err instanceof ApiError && err.status === 409) {
      const body = err.body as { conflicts?: LocationChangeConflict[] } | null;
      throw new LocationChangeConflictError(body?.conflicts ?? []);
    }
    throw err;
  }
}

/** PATCH …/reject — `reason` is required by the backend. */
export async function rejectLocationChangeRequest(
  token: string,
  id: number,
  reason: string,
): Promise<void> {
  await apiRequest(`/api/location-change-requests/${id}/reject`, {
    method: "PATCH",
    token,
    body: { review_notes: reason },
  });
}
