export function credentialsMatchChargeLocation(
  credentialsLocationId: number | null,
  chargeLocationId: number | null,
): boolean {
  return (
    credentialsLocationId != null &&
    chargeLocationId != null &&
    credentialsLocationId === chargeLocationId
  );
}

/** Shown when a submit is attempted before the right location's credentials have loaded. */
export const STALE_GATEWAY_LOCATION_MESSAGE =
  "Payment system is still loading this location. Please wait a moment and try again.";
