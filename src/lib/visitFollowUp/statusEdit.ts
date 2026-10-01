export function changedStatusField<S extends string>(
  status: S,
  originalStatus: string | null | undefined,
): { status?: S } {
  return status !== originalStatus ? { status } : {};
}

/** True when this save moves the visit to Completed (and so triggers the follow-up emails). */
export const completesVisit = (
  status: string,
  originalStatus: string | null | undefined,
): boolean => status === "completed" && originalStatus !== "completed";

/** Completing sends the Thanks for Playing email instead of a booking update email. */
export const bookingUpdateEmailWanted = (
  sendEmail: boolean,
  status: string,
  originalStatus: string | null | undefined,
): boolean =>
  sendEmail && !(status !== originalStatus && status === "completed");

export const COMPLETING_BOOKING_HINT =
  "Saving as Completed emails the guest the Thanks for Playing email now and a review request later, instead of a booking update email. Escape-room bookings send it from the game screen instead, and visits more than 3 days old are not emailed automatically.";

export const COMPLETING_BOOKING_EMAIL_LABEL =
  "No update email: completing sends the Thanks for Playing email instead";

export const EVENT_PURCHASE_EMAIL_NOTICE =
  "Changing the date or time will automatically notify the customer by email. Setting the status to Cancelled will also send a cancellation email, and setting it to Completed sends the Thanks for Playing email now and a review request later.";
