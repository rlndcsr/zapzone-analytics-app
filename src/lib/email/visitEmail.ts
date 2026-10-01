/*
 * Visit Completed / Visit Follow-up email settings — web parity with
 * Create/Edit/EmailNotificationDetails/EmailNotifications and
 * PromoCodePicker (2ce6f97). Pure, so it runs under `node --test`.
 */

export type VisitTriggerType = "visit_completed" | "visit_followup";
export type VisitActivityFilter = "escape_room" | "not_escape_room";
export type NotificationEntity = "all" | "package" | "attraction" | "event" | "waiver";

export const isVisitTrigger = (trigger: string | null | undefined): trigger is VisitTriggerType =>
  trigger === "visit_completed" || trigger === "visit_followup";

type TriggerOption = { value: string; label: string };
export type TriggerGroup = { label: string; options: TriggerOption[] };

const BOOKING_TRIGGERS: TriggerOption[] = [
  { value: "booking_created", label: "Booking Created" },
  { value: "booking_confirmed", label: "Booking Confirmed" },
  { value: "booking_updated", label: "Booking Updated" },
  { value: "booking_rescheduled", label: "Booking Rescheduled" },
  { value: "booking_cancelled", label: "Booking Cancelled" },
  { value: "booking_checked_in", label: "Booking Checked In" },
  { value: "booking_reminder", label: "Booking Reminder" },
  { value: "booking_no_show", label: "Booking No-Show" },
];

const PURCHASE_TRIGGERS: TriggerOption[] = [
  { value: "purchase_created", label: "Purchase Created" },
  { value: "purchase_confirmed", label: "Purchase Confirmed" },
  { value: "purchase_cancelled", label: "Purchase Cancelled" },
  { value: "purchase_checked_in", label: "Purchase Checked In" },
  { value: "purchase_refunded", label: "Purchase Refunded" },
  { value: "purchase_reminder", label: "Purchase Reminder" },
];

const PAYMENT_TRIGGERS: TriggerOption[] = [
  { value: "payment_received", label: "Payment Received" },
  { value: "payment_failed", label: "Payment Failed" },
  { value: "payment_refunded", label: "Payment Refunded" },
  { value: "payment_partial", label: "Partial Payment" },
  { value: "payment_pending", label: "Payment Pending" },
];

const REPORT_TRIGGERS: TriggerOption[] = [
  { value: "end_of_day_sales_report", label: "End of Day Sales Report" },
];

export const VISIT_TRIGGERS: TriggerOption[] = [
  { value: "visit_completed", label: "Visit Completed: Thanks for Playing" },
  { value: "visit_followup", label: "Visit Follow-up: Review Request" },
];

/** Every trigger group, for "All" — the full picker. */
export const ALL_TRIGGER_GROUPS: TriggerGroup[] = [
  { label: "Booking Events", options: BOOKING_TRIGGERS },
  { label: "Purchase Events", options: PURCHASE_TRIGGERS },
  { label: "Payment Events", options: PAYMENT_TRIGGERS },
  { label: "Reports", options: REPORT_TRIGGERS },
  { label: "After the Visit", options: VISIT_TRIGGERS },
];

/** The triggers an "Apply To" choice allows — web `triggersFor`. */
export function triggerGroupsFor(entity: string | null | undefined): TriggerGroup[] {
  if (entity === "package") {
    return [
      { label: "Booking Events", options: BOOKING_TRIGGERS },
      { label: "Payment Events", options: PAYMENT_TRIGGERS },
      { label: "After the Visit", options: VISIT_TRIGGERS },
    ];
  }
  if (entity === "attraction") {
    return [
      { label: "Purchase Events", options: PURCHASE_TRIGGERS },
      { label: "Payment Events", options: PAYMENT_TRIGGERS },
    ];
  }
  if (entity === "event") return [{ label: "After the Visit", options: VISIT_TRIGGERS }];
  return ALL_TRIGGER_GROUPS;
}

/** Keeps the trigger when the new entity allows it, else falls back to its first. */
export function triggerForEntity(entity: string, current: string): string {
  const allowed = triggerGroupsFor(entity).flatMap((g) => g.options.map((o) => o.value));
  return allowed.includes(current) ? current : allowed[0];
}

/** Labels for retired triggers an existing email may still carry (edit picker). */
export const RETIRED_TRIGGER_LABELS: Record<string, string> = {
  booking_completed: "Booking Completed (never sent, use Visit Completed)",
  booking_followup: "Booking Follow-up (never sent, use Visit Follow-up)",
  purchase_completed: "Purchase Completed (never sent)",
  purchase_followup: "Purchase Follow-up (never sent, use Visit Follow-up)",
};

/** Trigger labels the list / details screens show for the visit and retired triggers. */
export const TRIGGER_LABEL_OVERRIDES: Record<string, string> = {
  booking_completed: "Booking Completed (never sent)",
  booking_followup: "Booking Follow-up (never sent)",
  purchase_completed: "Purchase Completed (never sent)",
  purchase_followup: "Purchase Follow-up (never sent)",
  visit_completed: "Visit Completed: Thanks for Playing",
  visit_followup: "Visit Follow-up: Review Request",
};

export const APPLY_TO_OPTIONS: { label: string; value: NotificationEntity }[] = [
  { label: "All (Packages, Attractions & Events)", value: "all" },
  { label: "Packages Only", value: "package" },
  { label: "Attractions Only", value: "attraction" },
  { label: "Events Only", value: "event" },
];

// ── Permissions ────────────────────────────────────────────────────────────

export const canCreateVisitEmail = (role: string | null | undefined): boolean =>
  role === "company_admin" || role === "location_manager";

export const VISIT_EMAIL_CREATE_DENIED = "Only a manager or company admin can set up follow-up emails.";

/** The read-only banner on an email this user cannot change. */
export const readOnlyVisitEmailMessage = (locationId: number | null | undefined): string =>
  locationId === null || locationId === undefined
    ? "This follow-up email goes to guests of every location, so only a company admin can change it. A manager can duplicate it to make a version for their own location."
    : "Only a manager of this location or a company admin can change this follow-up email.";

/** Why a toggle is refused for an email this user cannot change. */
export const lockedToggleMessage = (locationId: number | null | undefined): string =>
  locationId === null || locationId === undefined
    ? "This follow-up email goes to guests of every location, so only a company admin can switch it on or off."
    : "Only a manager of this location or a company admin can change this follow-up email.";

export type BulkToggleRow = { id: number; isActive: boolean; canEdit: boolean };

/** Splits a bulk activate/deactivate into rows to toggle and rows this user may not change. */
export function planBulkToggle(
  rows: BulkToggleRow[],
  selected: Set<number>,
  active: boolean,
): { targets: number[]; locked: number } {
  const chosen = rows.filter((n) => selected.has(n.id) && n.isActive !== active);
  const targets = chosen.filter((n) => n.canEdit).map((n) => n.id);
  return { targets, locked: chosen.length - targets.length };
}

export const BULK_TOGGLE_ALL_LOCKED =
  "You cannot switch the selected follow-up emails on or off. Ask a company admin.";

export const bulkToggleSkippedNote = (locked: number): string =>
  locked > 0
    ? ` — ${locked} follow-up email(s) skipped because only a company admin can change them`
    : "";

// ── Payload ────────────────────────────────────────────────────────────────

export type VisitFieldsInput = {
  triggerType: string;
  entityType: string;
  promoId: number | null;
  fromName: string;
  reviewUrl: string;
  activityFilter: VisitActivityFilter | null;
};

export type VisitPayloadFields = {
  recipient_types?: string[];
  custom_emails?: string[];
  include_qr_code?: boolean;
  promo_id?: number | null;
  from_name?: string | null;
  review_url?: string | null;
  activity_filter?: VisitActivityFilter | null;
  location_id?: number | null;
};

/**
 * A company admin's location choice, sent explicitly so All Locations (null)
 * is saved instead of the server falling back to the admin's own location.
 */
export const adminLocationField = (
  role: string | null | undefined,
  locationId: number | null | undefined,
): { location_id?: number | null } =>
  role === "company_admin" ? { location_id: locationId ?? null } : {};

/**
 * The visit-email keys of a create / non-default edit payload. Visit emails
 * always go to the guest; any other trigger clears the visit-only settings.
 */
export function visitPayloadFields(input: VisitFieldsInput): VisitPayloadFields {
  const promo = { promo_id: input.triggerType === "visit_completed" ? input.promoId : null };
  if (!isVisitTrigger(input.triggerType)) {
    return { from_name: null, review_url: null, activity_filter: null, ...promo };
  }
  return {
    recipient_types: ["customer"],
    custom_emails: [],
    include_qr_code: false,
    from_name: input.fromName.trim() || null,
    review_url: input.reviewUrl.trim() || null,
    activity_filter: input.entityType === "event" ? null : input.activityFilter,
    ...promo,
  };
}

/** A default email's edit keeps its scope, so only the sender / promo / review link change. */
export function defaultVisitPayloadFields(input: VisitFieldsInput): VisitPayloadFields {
  return {
    ...(input.triggerType === "visit_completed" ? { promo_id: input.promoId } : {}),
    ...(isVisitTrigger(input.triggerType)
      ? {
          recipient_types: ["customer"],
          custom_emails: [],
          from_name: input.fromName.trim() || null,
          review_url: input.reviewUrl.trim() || null,
        }
      : {}),
  };
}

/** Visit Completed "How this email is sent" note on old, future and earlier-day visits. */
export const VISIT_COMPLETED_TIMING_NOTE =
  "Party bookings and event purchases more than 3 days old, or still in the future, are marked Completed without an email. Staff can still send it with Send now on the booking or purchase. Escape-room games from an earlier day are emailed when staff complete them on the game screen, which asks first.";

/** Details "Timing" for a visit follow-up. */
export const visitFollowupTiming = (hours: number): string =>
  `${hours} hours after staff mark the visit complete, never between 8 PM and 9 AM`;

// ── Promo picker ───────────────────────────────────────────────────────────

export type SharedPromo = {
  id: number;
  code: string;
  name: string | null;
  type: string;
  value: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  usageLimitTotal: number | null;
  currentUsage: number;
  locationIds: number[];
  itemLimited: boolean;
};

export const promoOfferLabel = (promo: Pick<SharedPromo, "type" | "value">): string => {
  const value = Number(promo.value);
  const amount = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return promo.type === "percentage" ? `${amount}% off` : `$${amount} off`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 1, 2026" for a date / datetime string. */
export const formatPromoDay = (value?: string | null): string => {
  if (!value) return "";
  const [year, month, date] = value.split("T")[0].split("-").map(Number);
  if (!year || !month || !date) return "";
  return `${MONTHS[month - 1]} ${date}, ${year}`;
};

/** Why the email would leave this code out — web PromoCodePicker `problemsFor`. */
export function promoProblems(
  promo: SharedPromo,
  locationId: number | null | undefined,
  locations: { id: number; name: string }[],
  today: string,
): string[] {
  const problems: string[] = [];
  const start = promo.startDate?.split("T")[0];
  const end = promo.endDate?.split("T")[0];

  if (promo.status !== "active") problems.push(`This code is ${promo.status}, so the email leaves it out until it is active again.`);
  if (start && start > today) problems.push(`This code starts on ${formatPromoDay(start)}. Emails sent before then leave it out.`);
  if (end && end < today) problems.push(`This code expired on ${formatPromoDay(end)}, so the email leaves it out.`);
  if (promo.usageLimitTotal && promo.currentUsage >= promo.usageLimitTotal) {
    problems.push("This code has been used the maximum number of times, so the email leaves it out.");
  }
  if (promo.locationIds.length > 0 && locationId && !promo.locationIds.includes(locationId)) {
    const name = locations.find((l) => l.id === locationId)?.name ?? "this email’s location";
    problems.push(`This code does not work at ${name}, so the email leaves it out there.`);
  }
  return problems;
}

/** One picker row: "CODE · 10% off · inactive · ends Oct 1, 2026". */
export const promoOptionLabel = (promo: SharedPromo): string =>
  `${promo.code} · ${promoOfferLabel(promo)}${promo.status !== "active" ? ` · ${promo.status}` : ""}${
    promo.endDate ? ` · ends ${formatPromoDay(promo.endDate)}` : ""
  }`;

/** "Valid until … Works only at …" under the chosen code. */
export function promoScopeLine(promo: SharedPromo, locations: { id: number; name: string }[]): string {
  const names = promo.locationIds
    .map((id) => locations.find((l) => l.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const until = promo.endDate ? `Valid until ${formatPromoDay(promo.endDate)}. ` : "No end date. ";
  const where =
    promo.locationIds.length === 0
      ? "Works at every location."
      : `Works only at ${names.length > 0 ? names.join(", ") : `${promo.locationIds.length} location(s)`}.`;
  return `${until}${where}`;
}
