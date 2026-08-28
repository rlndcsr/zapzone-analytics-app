/**
 * Bounds for the money fields staff type on an order.
 *
 * The web clamps these inline on every keystroke; the app clamps on blur and
 * again at submit instead, so a value can still be retyped from empty without
 * the field fighting the typing.
 */

/**
 * Clamp a typed money value into [0, max].
 *
 * A blank or unparseable field reads as 0 rather than NaN, so a half-typed
 * amount never reaches the payload. `max` of null leaves the value uncapped.
 */
export function clampAmount(
  value: string | number | null | undefined,
  max?: number | null,
): number {
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
  let next = Number.isFinite(parsed) ? parsed : 0;
  if (next < 0) next = 0;
  if (max != null && Number.isFinite(max) && next > max) next = Math.max(0, max);
  return next;
}

/**
 * The same clamp, rendered back into a text field. Whole amounts lose their
 * trailing ".00" so a field staff never touched still reads "0", not "0.00".
 */
export function clampAmountText(
  value: string | number | null | undefined,
  max?: number | null,
): string {
  const n = clampAmount(value, max);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
