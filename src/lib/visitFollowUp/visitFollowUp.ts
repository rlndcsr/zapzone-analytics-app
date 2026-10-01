import { formatDateET, formatTimeET } from "../date/venueTime.ts";

export type VisitType = "booking" | "escape_room_session" | "event_purchase";
export type FollowUpKind = "thanks" | "review";
export type FollowUpStatus =
  "scheduled" | "sending" | "sent" | "failed" | "skipped" | "canceled";

export type FollowUpReason =
  | "reopened"
  | "switched_off"
  | "visit_date"
  | "opted_out"
  | "asked_recently"
  | "redirected"
  | "left_game"
  | "recipient_changed"
  | "visit_gone"
  | "staff";

export type FollowUpRow = {
  id: number;
  kind: FollowUpKind;
  visit_type: VisitType;
  visit_id: number;
  recipient_name: string | null;
  recipient_email_masked: string;
  waiver_id: number | null;
  status: FollowUpStatus;
  gave_up: boolean;
  due_at: string | null;
  sent_at: string | null;
  attempts: number;
  error: string | null;
  reason: FollowUpReason | null;
  rating: number | null;
  comment: string | null;
  rated_at: string | null;
  email_notification_id: number | null;
  sent_in_this_action?: boolean;
  is_current_recipient?: boolean;
};

export type FollowUpPromoInfo = {
  id: number;
  code: string | null;
  offer: string | null;
  name: string | null;
  ends_on: string | null;
  terms?: string;
  location_note?: string | null;
  problem: string | null;
};

export type FollowUpEmailInfo = {
  active: boolean;
  id: number | null;
  name: string | null;
  hours: number | null;
  promo: FollowUpPromoInfo | null;
};

export type VisitFollowUpSummary = {
  available: boolean;
  visit_type: VisitType;
  visit_id: number;
  completed: boolean;
  handled_by_game: boolean;
  is_ticket_order_line?: boolean;
  recipient_email_masked: string | null;
  max_visit_age_days?: number;
  thanks_email: FollowUpEmailInfo;
  review_email: FollowUpEmailInfo;
  thanks: FollowUpRow[];
  reviews: FollowUpRow[];
  can_send_thanks: boolean;
};

export type GameReviewCounts = {
  scheduled: number;
  sent: number;
  skipped: number;
  failed: number;
  rated: number;
  average_rating: number | null;
  next_due_at: string | null;
};

export type GameFollowUp = {
  available: boolean;
  thanks_email: FollowUpEmailInfo;
  review_email: FollowUpEmailInfo;
  reviews: GameReviewCounts | null;
};

/** Visits staff see a follow-up card on (escape-room games use the game screen). */
export type StaffVisitType = Exclude<VisitType, "escape_room_session">;

export const followUpEmailName = (
  name: string | null | undefined,
  fallback: string,
): string =>
  (name ?? "").replace(/\s*\((Customer|Guest)\)\s*$/i, "").trim() || fallback;

/** "Oct 1, 3:05 PM" in venue time — the web's toLocaleString(America/Detroit) output. */
export const formatFollowUpTime = (value: string | null): string => {
  if (!value) return "";
  const day = formatDateET(value, { month: "short", fallback: "" }).replace(
    /, \d{4}$/,
    "",
  );
  return day
    ? `${day}, ${formatTimeET(value, { showZone: false, fallback: "" })}`
    : "";
};

const when = formatFollowUpTime;

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Not delivered",
  skipped: "Not sent",
  canceled: "Canceled",
};

export const followUpStatusLine = (row: FollowUpRow): string => {
  switch (row.status) {
    case "scheduled":
      return `Goes out ${formatFollowUpTime(row.due_at)}`;
    case "sent":
      return `Sent ${formatFollowUpTime(row.sent_at)}`;
    case "failed":
      return row.gave_up
        ? "Could not be delivered after 3 tries"
        : "Delivery failed, trying again soon";
    default:
      return row.error ?? FOLLOW_UP_STATUS_LABELS[row.status];
  }
};

/** The one-line "what happened to the emails" notice after a visit is completed. */
export const describeFollowUp = (
  summary: VisitFollowUpSummary | null | undefined,
): string | null => {
  if (!summary || !summary.available) return null;

  const thanksName = followUpEmailName(
    summary.thanks_email.name,
    "Thanks for Playing",
  );

  if (summary.handled_by_game) {
    return summary.thanks_email.active
      ? `This is an escape-room booking, so the ${thanksName} email goes out from the game screen with the group photo.`
      : `This is an escape-room booking, and the ${thanksName} email is switched off, so nothing is emailed from the game screen.`;
  }

  const thanks =
    summary.thanks.find((row) => row.is_current_recipient) ??
    summary.thanks[summary.thanks.length - 1];
  const review = summary.reviews.find((row) => row.status === "scheduled");
  const parts: string[] = [];

  if (thanks?.status === "sent" && thanks.sent_in_this_action) {
    parts.push(
      `The ${thanksName} email went to ${thanks.recipient_email_masked}.`,
    );
  } else if (thanks?.status === "sent") {
    parts.push(
      `The ${thanksName} email was already sent to ${thanks.recipient_email_masked} on ${when(thanks.sent_at)}, so it was not sent again.`,
    );
  } else if (thanks?.status === "failed") {
    parts.push(
      `The ${thanksName} email could not be sent yet and will be retried.`,
    );
  } else if (thanks?.status === "skipped" && thanks.reason === "visit_date") {
    parts.push(
      thanks.error ??
        "Nothing was sent automatically because of the visit date.",
    );
  } else if (!summary.thanks_email.active) {
    parts.push(
      `The ${thanksName} email is switched off, so no thank-you email went out.`,
    );
  } else if (!summary.recipient_email_masked) {
    parts.push("No email address on file, so no follow-up email went out.");
  }

  if (review) {
    parts.push(`Review request goes out ${when(review.due_at)}.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
};

// ── Follow-up card (booking / event purchase details) ──────────────────────

/** Whether a row offers Send now — web VisitFollowUpCard `canSendNow`. */
export const canSendFollowUpNow = (
  row: FollowUpRow,
  completed: boolean,
): boolean =>
  completed &&
  ["scheduled", "failed", "skipped", "canceled"].includes(row.status) &&
  row.is_current_recipient !== false &&
  !["opted_out", "redirected", "left_game"].includes(
    row.reason ?? "",
  ) &&
  !(row.kind === "review" && row.reason === "asked_recently");

export const followUpSendLabel = (row: FollowUpRow): string =>
  row.status === "failed"
    ? "Try again"
    : row.attempts > 0
      ? "Send again"
      : "Send now";

export const canCancelFollowUp = (row: FollowUpRow): boolean =>
  row.status === "scheduled";

export type FollowUpCardText = {
  thanksName: string;
  reviewName: string;
  /** The explanatory paragraph, or null when rows are listed instead. */
  intro: string | null;
  /** Amber "switched off" note, or null. */
  switchedOff: string | null;
  /** Amber promo problem, or null. */
  promoProblem: string | null;
  /** Label for the "send the thank-you" button, or null when it is hidden. */
  sendThanksLabel: string | null;
};

/** Every piece of copy the follow-up card shows, worked out from the summary. */
export function followUpCardText(
  summary: VisitFollowUpSummary,
  visitType: StaffVisitType,
): FollowUpCardText {
  const thanksName = followUpEmailName(
    summary.thanks_email.name,
    "Thanks for Playing",
  );
  const reviewName = followUpEmailName(
    summary.review_email.name,
    "Review Request",
  );
  const hours = summary.review_email.hours ?? 24;
  const noun = visitType === "booking" ? "booking" : "purchase";
  const rowCount = summary.thanks.length + summary.reviews.length;
  const maxAge = summary.max_visit_age_days ?? 3;
  const hasCurrentThanks = summary.thanks.some(
    (row) => row.is_current_recipient,
  );
  const oldAddressOnly = summary.thanks.length > 0 && !hasCurrentThanks;

  let intro: string | null = null;
  if (summary.is_ticket_order_line) {
    intro =
      "This ticket belongs to a bulk ticket order. Orders are checked in but never marked Completed, so follow-up emails are not sent for them.";
  } else if (summary.handled_by_game) {
    intro =
      (summary.thanks_email.active
        ? `This is an escape-room booking. ${thanksName} goes to the players from the game screen when staff press Complete & Send, with the group photo and finish time.`
        : `This is an escape-room booking, and ${thanksName} is switched off, so the group photo cannot be emailed from the game screen.`) +
      (summary.review_email.active
        ? ` Each player gets ${reviewName} afterwards.`
        : "");
  } else if (rowCount === 0) {
    intro = summary.completed
      ? summary.recipient_email_masked
        ? `Nothing has been sent for this ${noun} yet.`
        : `This ${noun} has no email address, so no follow-up emails can be sent.`
      : `When this ${noun} is set to Completed, ${thanksName} goes to ${summary.recipient_email_masked ?? "the guest"} right away and ${reviewName} follows about ${hours} ${hours === 1 ? "hour" : "hours"} later (never overnight). Visits more than ${maxAge} days old or still ahead are not emailed automatically.`;
  }

  const switchedOff =
    !summary.is_ticket_order_line &&
    (!summary.thanks_email.active || !summary.review_email.active)
      ? `${!summary.thanks_email.active ? `${thanksName} is switched off in Email Notifications. ` : ""}${!summary.review_email.active ? `${reviewName} is switched off in Email Notifications.` : ""}`.trim()
      : null;

  const promoProblem =
    summary.thanks_email.promo?.problem && !summary.handled_by_game
      ? summary.thanks_email.promo.problem
      : null;

  const sendThanksLabel =
    summary.can_send_thanks && !hasCurrentThanks
      ? oldAddressOnly && summary.recipient_email_masked
        ? `Send ${thanksName} to ${summary.recipient_email_masked}`
        : `Send ${thanksName} now`
      : null;

  return {
    thanksName,
    reviewName,
    intro,
    switchedOff,
    promoProblem,
    sendThanksLabel,
  };
}

// ── Completing visits ──────────────────────────────────────────────────────

/** The confirm shown before bulk Complete — web Bookings / EventPurchases. */
export const bulkCompleteConfirmMessage = (
  count: number,
  noun: "booking" | "purchase",
): string =>
  `Mark ${count} ${count === 1 ? noun : `${noun}s`} as Completed? Guests of visits from the last 3 days get the Thanks for Playing email right away and a review request later. Older or future visits are marked Completed without emailing anyone.`;

/**
 * What bulk-completing bookings emailed, or null when nothing worth reporting
 * happened — web Bookings handleBulkStatusChange.
 */
export function bulkCompleteBookingsNotice(
  followUps: (VisitFollowUpSummary | null | undefined)[],
  total: number,
): string | null {
  let thanksSent = 0;
  let reviewsScheduled = 0;
  let heldForDate = 0;
  for (const followUp of followUps) {
    if (followUp?.thanks.some((row) => row.sent_in_this_action)) thanksSent++;
    if (followUp?.reviews.some((row) => row.status === "scheduled"))
      reviewsScheduled++;
    if (followUp?.thanks.some((row) => row.reason === "visit_date"))
      heldForDate++;
  }
  if (thanksSent === 0 && reviewsScheduled === 0 && heldForDate === 0)
    return null;
  return (
    `Thanks for Playing sent for ${thanksSent} of ${total} ${total === 1 ? "booking" : "bookings"}; ${reviewsScheduled} review ${reviewsScheduled === 1 ? "request" : "requests"} scheduled.` +
    (heldForDate > 0
      ? ` ${heldForDate} ${heldForDate === 1 ? "visit was" : "visits were"} not emailed because of the visit date.`
      : "")
  );
}

/** Reads the `follow_up` a status / update response carries, if any. */
export const followUpOf = (
  response: unknown,
): VisitFollowUpSummary | undefined => {
  const value = (response as { follow_up?: unknown } | null | undefined)
    ?.follow_up;
  return value && typeof value === "object"
    ? (value as VisitFollowUpSummary)
    : undefined;
};

// ── Guest ratings (Visit Follow-up details) ────────────────────────────────

export type GuestRatingRow = FollowUpRow & {
  location_name: string | null;
  visit_path: string;
};

export type GuestRatingsResponse = {
  summary: {
    requested: number;
    rated: number;
    average: number | null;
    distribution: Record<string, number>;
  };
  ratings: GuestRatingRow[];
  pagination: { current_page: number; last_page: number; per_page: number; total: number };
};

/** "requested · N% answered" under the ratings count. */
export const ratingsRequestedLine = (summary: GuestRatingsResponse["summary"]): string => {
  const rate =
    summary.requested > 0 ? Math.round((summary.rated / summary.requested) * 100) : null;
  return `${summary.requested} requested${rate !== null ? ` · ${rate}% answered` : ""}`;
};

/** The app route that opens a rated visit (the web's `visit_path` is a web URL). */
export function visitRoute(
  row: Pick<FollowUpRow, "visit_type" | "visit_id">,
): { pathname: string; params: Record<string, string> } {
  switch (row.visit_type) {
    case "booking":
      return { pathname: "/bookings/bookings", params: { openId: String(row.visit_id) } };
    case "event_purchase":
      return { pathname: "/events/purchase-details", params: { id: String(row.visit_id) } };
    default:
      return { pathname: "/photos/escape-rooms", params: { session: String(row.visit_id) } };
  }
}
