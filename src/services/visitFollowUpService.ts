import { apiRequest } from "../lib/api";
import type {
  GuestRatingsResponse,
  StaffVisitType,
  VisitFollowUpSummary,
  VisitType,
} from "../lib/visitFollowUp/visitFollowUp";

export async function fetchVisitFollowUp(
  token: string,
  visitType: VisitType,
  visitId: number,
  signal?: AbortSignal,
): Promise<VisitFollowUpSummary> {
  const res = await apiRequest<{ data: VisitFollowUpSummary }>(
    `/api/visit-follow-ups/visit?visit_type=${encodeURIComponent(visitType)}&visit_id=${visitId}`,
    { token, signal },
  );
  return res.data;
}

/** POST /api/visit-follow-ups/send-thanks — send the thank-you email for a completed visit. */
export async function sendVisitThanks(
  token: string,
  visitType: StaffVisitType,
  visitId: number,
): Promise<VisitFollowUpSummary> {
  const res = await apiRequest<{ data: VisitFollowUpSummary }>(
    "/api/visit-follow-ups/send-thanks",
    {
      method: "POST",
      token,
      body: { visit_type: visitType, visit_id: visitId },
    },
  );
  return res.data;
}

/** POST /api/visit-follow-ups/{id}/send-now — send one follow-up email right away. */
export async function sendFollowUpNow(
  token: string,
  followUpId: number,
): Promise<{ message: string; data: VisitFollowUpSummary }> {
  const res = await apiRequest<{
    message?: string;
    data: VisitFollowUpSummary;
  }>(`/api/visit-follow-ups/${followUpId}/send-now`, { method: "POST", token });
  return { message: res.message ?? "", data: res.data };
}

/** POST /api/visit-follow-ups/{id}/cancel — "Don't send" a scheduled follow-up email. */
export async function cancelFollowUp(
  token: string,
  followUpId: number,
): Promise<VisitFollowUpSummary> {
  const res = await apiRequest<{ data: VisitFollowUpSummary }>(
    `/api/visit-follow-ups/${followUpId}/cancel`,
    { method: "POST", token },
  );
  return res.data;
}

/** GET /api/visit-follow-ups/ratings — guest ratings for the Visit Follow-up email. */
export async function fetchGuestRatings(
  token: string,
  filters: { page: number; perPage: number; maxRating?: number; locationId?: number | null },
  signal?: AbortSignal,
): Promise<GuestRatingsResponse> {
  const qs = new URLSearchParams({ page: String(filters.page), per_page: String(filters.perPage) });
  if (filters.maxRating != null) qs.append("max_rating", String(filters.maxRating));
  if (filters.locationId != null) qs.append("location_id", String(filters.locationId));
  const res = await apiRequest<{ data: GuestRatingsResponse }>(
    `/api/visit-follow-ups/ratings?${qs.toString()}`,
    { token, signal },
  );
  return res.data;
}
