export const normalizeBookingSearchTerm = (raw: string): string =>
  raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^| )#+ ?/g, "$1")
    .trim();

export const isIdTerm = (term: string): boolean => /^\d+$/.test(term);

/** What a booking with neither a guest nor a customer name is shown as. */
export const GUEST_NAME_FALLBACK = "Guest";

/**
 * The customer name a search may match: "" when the only name is the display
 * fallback, which the web never searches. A guest really named "Guest" is still
 * found through the guest name itself.
 */
export const searchableCustomerName = (
  customerName: string,
  guestName?: string | null,
): string =>
  customerName === GUEST_NAME_FALLBACK && !guestName ? "" : customerName;

export const matchesBookingId = (
  id: number | null | undefined,
  term: string,
): boolean => isIdTerm(term) && id != null && String(id) === term;

export function rankBookingSearchResults<
  T extends {
    id: number;
    guestEmail: string | null;
    customerEmail: string | null;
  },
>(bookings: T[], normalizedTerm: string): T[] {
  const term = normalizedTerm.toLowerCase();
  if (!term) return bookings;
  const isExact = (b: T): boolean =>
    matchesBookingId(b.id, term) ||
    [b.guestEmail, b.customerEmail].some(
      (email) => email?.trim().toLowerCase() === term,
    );
  const exact = bookings.filter(isExact);
  return exact.length === 0
    ? bookings
    : [...exact, ...bookings.filter((b) => !isExact(b))];
}
