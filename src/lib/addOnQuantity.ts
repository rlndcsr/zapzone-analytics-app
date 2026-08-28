/**
 * Add-on quantity rules, mirroring the web's `src/utils/addOnQuantity.ts` so the
 * app's Manual Booking enforces the same minimums, maximums and forced add-ons
 * the web on-site booking does.
 *
 * Fields are camelCase here because the services layer maps the API payload
 * before it reaches the screens; the semantics are otherwise identical.
 */
export type AddOnQtyRules = {
  minQuantity?: number | null;
  maxQuantity?: number | null;
  isForced?: boolean;
  /** Per-package price/minimum overrides, keyed by package. */
  priceEachPackages?:
    | { package_id: number; price?: number; minimum_quantity?: number }[]
    | null;
};

/** Default ceiling when an add-on sets no `max_quantity` (matches the web). */
export const DEFAULT_MAX_QUANTITY = 99;

/**
 * An add-on is only *forced* for packages it is explicitly priced for — the
 * flag alone is not enough, the package must appear in `price_each_packages`.
 */
export function isForceAddOn(
  addOn: AddOnQtyRules | null | undefined,
  packageId: number | null | undefined,
): boolean {
  if (!addOn?.isForced || packageId == null) return false;
  const rows = addOn.priceEachPackages;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.some((p) => Number(p.package_id) === Number(packageId));
}

/** Minimum for this package — the per-package override wins over the global one. */
export function getAddOnMinQuantity(
  addOn: AddOnQtyRules | null | undefined,
  packageId: number | null | undefined,
): number {
  const rows = addOn?.priceEachPackages;
  if (packageId != null && Array.isArray(rows) && rows.length > 0) {
    const match = rows.find((p) => Number(p.package_id) === Number(packageId));
    if (match) return Math.max(1, Number(match.minimum_quantity) || 1);
  }
  return Math.max(0, Number(addOn?.minQuantity) || 0);
}

/**
 * Clamp a requested quantity into the add-on's allowed range.
 *
 * Below the minimum the quantity snaps outward rather than to the minimum: a
 * decrease falls to 0 (deselecting), an increase jumps up to the minimum. A
 * forced add-on can never go below its minimum.
 */
export function clampAddOnQuantity(
  addOn: AddOnQtyRules | null | undefined,
  packageId: number | null | undefined,
  currentQty: number,
  requestedQty: number,
): number {
  const forced = isForceAddOn(addOn, packageId);
  const minQty = forced
    ? Math.max(1, getAddOnMinQuantity(addOn, packageId))
    : getAddOnMinQuantity(addOn, packageId);
  const maxQty = addOn?.maxQuantity ?? DEFAULT_MAX_QUANTITY;

  let qty = Number.isFinite(requestedQty) ? Math.floor(requestedQty) : 0;
  if (qty > maxQty) qty = maxQty;
  if (forced) return Math.max(minQty, qty);
  if (qty > 0 && qty < minQty) qty = qty < currentQty ? 0 : minQty;
  return Math.max(0, qty);
}

/** Starting quantities for a package's forced add-ons, keyed by add-on id. */
export function seedForcedAddOns(
  pkg: { id: number; addOns?: (AddOnQtyRules & { id: number })[] | null } | null | undefined,
): Record<number, number> {
  const seeded: Record<number, number> = {};
  if (!pkg) return seeded;
  for (const addOn of pkg.addOns ?? []) {
    if (isForceAddOn(addOn, pkg.id)) {
      seeded[addOn.id] = Math.max(1, getAddOnMinQuantity(addOn, pkg.id));
    }
  }
  return seeded;
}
