import { useMemo } from "react";

import { useLocationOptions } from "./useLocationOptions";

/**
 * Name and phone for one venue, for the Call to Book card's dial button.
 *
 * Reads the lightweight `/api/mobile/locations` list `useLocationOptions`
 * already fetches — `LocationOption.phone` is the venue's own number, so the
 * button always dials the location being booked and there is no default or
 * hardcoded fallback anywhere.
 *
 * Returns nulls until the list arrives, or when that venue has no number on
 * file; the card treats a null phone as "hide the call button".
 */
export function useVenuePhone(locationId: number | null | undefined): {
  name: string | null;
  phone: string | null;
} {
  const { locations } = useLocationOptions();

  return useMemo(() => {
    if (locationId == null) return { name: null, phone: null };
    const venue = locations.find((l) => l.id === locationId);
    return {
      name: venue?.name?.trim() || null,
      phone: venue?.phone?.trim() || null,
    };
  }, [locations, locationId]);
}
