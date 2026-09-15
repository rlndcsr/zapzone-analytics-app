export type DurationUnit = "hours" | "minutes";

/**
 * Seed the "Edit Duration" form from what the booking already has.
 *
 * The web's `handleOpenDurationModal` parses its own rendered duration string
 * and falls back to 2 hours when that fails; reading the stored number and unit
 * directly gets to the same place without the round-trip through display text.
 *
 * The editor offers only Hours and Minutes — the same two the web offers — but
 * the backend also stores "hours and minutes" (a 1.5h booking). Presenting that
 * as whole minutes keeps the value exact; rounding it to hours would silently
 * shorten or lengthen the booking the moment the operator pressed Save. The
 * same applies to a fractional value stored under a plain "hours" unit.
 */
export function seedDuration(
  duration: number | null | undefined,
  unit: string | null | undefined,
): { value: number; unit: DurationUnit } {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return { value: 2, unit: "hours" };
  }
  // Rounding can land on 0 for a sub-minute duration, and the form's minimum —
  // like the web input's `min="1"` — is 1, so never seed a value it rejects.
  const wholeMinutes = (value: number) => Math.max(1, Math.round(value));

  if (unit === "minutes") {
    return { value: wholeMinutes(duration), unit: "minutes" };
  }
  if (unit === "hours and minutes" || !Number.isInteger(duration)) {
    return { value: wholeMinutes(duration * 60), unit: "minutes" };
  }
  return { value: duration, unit: "hours" };
}
