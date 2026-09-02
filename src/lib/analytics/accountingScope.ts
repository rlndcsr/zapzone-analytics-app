export const ALL_LOCATIONS_SCOPE = "all";

export function accountingLocationParam(locationId: number | null): string {
  return locationId === null ? ALL_LOCATIONS_SCOPE : String(locationId);
}
