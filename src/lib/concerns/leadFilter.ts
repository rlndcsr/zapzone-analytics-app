import type { ConcernRow } from "../../services/checkoutConcernsService";

/** The Customer Concerns "Lead" filter (web parity: CustomerConcerns.tsx). */
export type LeadFilter =
  | "completed"
  | "not_completed"
  | "requested_help"
  | "needs_follow_up";

export const LEAD_FILTER_OPTIONS: { label: string; value: LeadFilter | "all" }[] = [
  { label: "All leads", value: "all" },
  { label: "Completed booking", value: "completed" },
  { label: "Did not complete booking", value: "not_completed" },
  { label: "Requested help", value: "requested_help" },
  { label: "Needs a follow-up call", value: "needs_follow_up" },
];

export function matchesLeadFilter(
  concern: Pick<ConcernRow, "kind" | "status" | "completedBooking">,
  value: LeadFilter | "all",
): boolean {
  const booked = concern.completedBooking === true;
  switch (value) {
    case "completed":
      return booked;
    case "not_completed":
      return concern.kind === "abandoned_checkout" && !booked;
    case "requested_help":
      return concern.kind === "schedule_help" || concern.kind === "call_to_book";
    case "needs_follow_up":
      return concern.status !== "resolved" && !booked;
    default:
      return true;
  }
}

/** The "Booked?" column and export cell, in the web's wording. */
export const bookedLabel = (concern: Pick<ConcernRow, "completedBooking">): string =>
  concern.completedBooking ? "Completed booking" : "Not booked yet";
