// Slug helpers mirrored 1:1 from the web project (zappoint `src/utils/slug.ts`)
// so mobile-built purchase links match the URLs the web frontend routes on.

/** `name` slugified + `-id` suffix (e.g. "Unlimited Wristband #10 in Arcade", 18
 *  -> "unlimited-wristband-10-in-arcade-18"). Matches web `generateSlug`. */
export function createSlugWithId(name: string, id: number | string): string {
  const slugName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slugName}-${id}`;
}

/**
 * Location path segment for a purchase link. Mirrors the web ManageAttractions
 * `buildLocationSlug`: lowercase, spaces -> hyphens, then strip any remaining
 * non-alphanumeric/hyphen chars. Falls back to `location-<id>` when unnamed.
 */
export function buildLocationSlug(
  locationName: string,
  locationId: number | null,
): string {
  return locationName
    ? locationName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    : `location-${locationId ?? "1"}`;
}
