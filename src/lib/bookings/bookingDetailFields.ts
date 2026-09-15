/**
 * The two field derivations on the Booking Details screen that are more than a
 * field copy, kept here (rather than inline in `services/bookingsService`) so
 * their parity with the web admin's ViewBooking page can be unit-tested — the
 * service module can't be imported in tests because it reaches the API layer,
 * which needs `EXPO_PUBLIC_API_URL` at import time.
 */

/** Just the venue fields the address line reads. */
export type AddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
} | null | undefined;

/**
 * "123 Main St, Farmington, MI" — the second line under Location on the web.
 *
 * The web only renders this line when `address` is present, so a venue with a
 * city but no street shows nothing rather than a bare ", Farmington, MI".
 * Blank parts are dropped so a missing state can't leave a trailing comma.
 */
export function locationAddressLine(location: AddressParts): string | null {
  if (!location?.address?.trim()) return null;
  return [location.address, location.city, location.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/** Just the add-on fields the unit price reads. */
export type PricedAddOn = {
  price?: number | string | null;
  is_force_add_on?: boolean | number | null;
  price_each_packages?:
    | { package_id?: number | null; price?: number | string | null }[]
    | null;
  pivot?: {
    price_at_booking?: number | string | null;
    price?: number | string | null;
  } | null;
};

/**
 * What one unit of a booked add-on was charged at, in the web's order of
 * preference: a forced add-on priced specifically for this package wins,
 * otherwise the price frozen onto the pivot when the booking was taken, then
 * the pivot's plain price, then the catalog price.
 *
 * The web expresses the first step as "compute it, and if it came out 0 fall
 * through", so a forced add-on whose package entry is missing — or priced at
 * zero — lands on the same fallback chain as any other add-on. This mirrors
 * that rather than branching on `is_force_add_on` alone.
 */
export function addOnUnitPrice(
  addOn: PricedAddOn,
  packageId: number | null | undefined,
): number {
  if (
    addOn.is_force_add_on &&
    Array.isArray(addOn.price_each_packages) &&
    packageId
  ) {
    const match = addOn.price_each_packages.find(
      (p) => p.package_id === packageId,
    );
    if (match) {
      const forced = Number(match.price);
      if (Number.isFinite(forced) && forced !== 0) return forced;
    }
  }

  const fallback = Number(
    addOn.pivot?.price_at_booking ?? addOn.pivot?.price ?? addOn.price ?? 0,
  );
  return Number.isFinite(fallback) ? fallback : 0;
}
