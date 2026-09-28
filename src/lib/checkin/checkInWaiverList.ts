import type { CalendarBooking } from "../../services/bookingsService";
import type { Waiver } from "../../services/waiversService";

/*
 * The check-in desk's Waivers tab (web parity: pages/admin/bookings/CheckIn.tsx
 * — waiverSignerName, waiverLinkLabel, filteredWaivers, loadWaivers). Kept free
 * of React so the rules can be unit-tested.
 */

/** Waivers per status request — the web's WAIVER_PAGE_SIZE. */
export const WAIVER_PAGE_SIZE = 200;
/** A search term needs this many digits before it is matched as a phone. */
export const MIN_PHONE_DIGITS = 3;

export const digitsOnly = (value: string | null | undefined): string =>
  (value ?? "").replace(/\D/g, "");

/** "Rhian Baria", or "Signer" before anyone has signed. */
export function waiverSignerName(w: Waiver): string {
  return (
    [w.adultFirstName, w.adultLastName].filter(Boolean).join(" ") || "Signer"
  );
}

/** What the waiver is for: "Booking BK…", "Ticket #12", an event name, or null. */
export function waiverLinkLabel(w: Waiver): string | null {
  if (w.bookingReference) return `Booking ${w.bookingReference}`;
  if (w.bookingId != null) return `Booking #${w.bookingId}`;
  if (w.attractionPurchaseId != null)
    return `Ticket #${w.attractionPurchaseId}`;
  if (w.eventName) return w.eventName;
  return null;
}

const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A visit date ("2026-09-28", or a timestamp starting with one) as
 * "September 28, 2026" — read as the calendar day it names, never as an
 * instant, which would slide it to the day before in Michigan.
 */
export function visitDateLabel(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return "—";
  const month = MONTHS_LONG[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : "—";
}

/** The adult plus any minors on the waiver. */
export function peopleCovered(w: Waiver): { count: number; detail: string } {
  const minors = w.minorsCount;
  return {
    count: 1 + minors,
    detail:
      minors === 0
        ? "(adult)"
        : `(adult + ${minors} minor${minors === 1 ? "" : "s"})`,
  };
}

export type DeskWaiverState = "checked-in" | "signed" | "not-signed";

/** Checked In beats Signed beats Not Signed, as the web's pill reads. */
export function deskWaiverState(w: Waiver): DeskWaiverState {
  if (w.checkedInAt) return "checked-in";
  return w.status === "completed" ? "signed" : "not-signed";
}

export const DESK_WAIVER_LABEL: Record<DeskWaiverState, string> = {
  "checked-in": "Checked In",
  signed: "Signed",
  "not-signed": "Not Signed",
};

/**
 * The filter box over the loaded waivers: every word must match the signer,
 * email, phone, reference, template, location or booking — and a word with
 * enough digits also matches the phone digit-for-digit, so 5864416556 finds
 * a number stored as 586-441-6556.
 */
export function filterDeskWaivers(waivers: Waiver[], search: string): Waiver[] {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return waivers;

  return waivers.filter((w) => {
    const text = [
      waiverSignerName(w),
      w.adultEmail,
      w.adultPhone,
      w.referenceNumber,
      w.templateTitle,
      w.locationName,
      w.bookingReference,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const phoneDigits = digitsOnly(w.adultPhone);

    return terms.every((term) => {
      if (text.includes(term)) return true;
      const termDigits = digitsOnly(term);
      return (
        termDigits.length >= MIN_PHONE_DIGITS &&
        phoneDigits.includes(termDigits)
      );
    });
  });
}

/**
 * The same filter box over the Bookings tab (web parity: utils/bookingSearch
 * `matchesBookingSearch`): every word must match the guest, the customer, the
 * guest of honour, the reference, package, room or location — and a word with
 * enough digits matches either phone digit-for-digit.
 */
export function matchesDeskBookingSearch(
  b: CalendarBooking,
  search: string,
): boolean {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = [
    b.guestName,
    b.guestEmail,
    b.guestPhone,
    b.guestOfHonorName,
    b.referenceNumber,
    b.customerName,
    b.customerEmail,
    b.customerPhone,
    b.packageNameRaw,
    b.roomName,
    b.locationName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const phones = [b.guestPhone, b.customerPhone]
    .map((p) => digitsOnly(p))
    .filter(Boolean)
    .join(" ");

  return terms.every((term) => {
    if (text.includes(term)) return true;
    const termDigits = digitsOnly(term);
    return termDigits.length >= MIN_PHONE_DIGITS && phones.includes(termDigits);
  });
}

/** One status request's outcome: its rows and the server's total, or null if it failed. */
export type WaiverPageOutcome = { waivers: Waiver[]; total: number } | null;

export type DeskWaiverDay = {
  /** Unsigned first, then signed — a busy day can hide a signature, never a missing one. */
  waivers: Waiver[];
  /** Waivers the day holds across both statuses. */
  total: number;
  /** Fewer rows loaded than the day holds (a page cap, or a failed request). */
  truncated: boolean;
  /** Every unsigned waiver is on screen. */
  unsignedComplete: boolean;
};

/**
 * Merge the separately fetched unsigned (`pending`) and signed (`completed`)
 * pages. They are fetched apart because the list sorts by `submitted_at`,
 * which is null until signing and sorts last — one capped request dropped
 * exactly the unsigned guests the desk still has to chase.
 */
export function mergeDeskWaivers(
  unsigned: WaiverPageOutcome,
  signed: WaiverPageOutcome,
): DeskWaiverDay {
  const unsignedRows = unsigned?.waivers ?? [];
  const signedRows = signed?.waivers ?? [];
  const unsignedTotal = unsigned ? unsigned.total : unsignedRows.length;
  const signedTotal = signed ? signed.total : signedRows.length;
  const unsignedComplete = !!unsigned && unsignedRows.length >= unsignedTotal;

  return {
    waivers: [...unsignedRows, ...signedRows],
    total: unsignedTotal + signedTotal,
    truncated: !unsignedComplete || signedRows.length < signedTotal,
    unsignedComplete,
  };
}

/** The note under a truncated Waivers tab, the web's wording. */
export function waiverTruncationNote(day: DeskWaiverDay): string {
  return day.unsignedComplete
    ? `Loaded ${day.waivers.length} of ${day.total} waivers for this day — every unsigned one is included, the rest are the most recently signed.`
    : `Loaded ${day.waivers.length} of ${day.total} waivers for this day — some unsigned ones are not listed here.`;
}
