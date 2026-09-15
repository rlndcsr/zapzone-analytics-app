/**
 * Which location's branding applies, and which logo wins — ported from the
 * web admin's location-aware logo rules (sidebar selection for a company
 * admin, own location for everyone else; location logo over company logo).
 */

export type BrandLogoUser = {
  role?: string | null;
  location_id?: number | null;
};

/**
 * The location whose logo should show: a company_admin's active selection,
 * or everyone else's own assigned location. Null means no location context —
 * the company logo applies instead.
 */
export function resolveEffectiveLocationId(
  user: BrandLogoUser | null,
  activeLocationId: number | "all" | null | undefined,
): number | null {
  if (!user) return null;
  if (user.role === "company_admin") {
    return typeof activeLocationId === "number" ? activeLocationId : null;
  }
  return user.location_id ?? null;
}

/** location logo -> company logo -> null (the caller renders the bundled default). */
export function resolveBrandLogoPath(
  locationLogoPath: string | null | undefined,
  companyLogoPath: string | null | undefined,
): string | null {
  return locationLogoPath || companyLogoPath || null;
}
