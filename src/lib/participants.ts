/**
 * Player-count limits for a package.
 *
 * A package stores its floor in `min_participants` and its ceiling in
 * `max_participants`; both arrive as 0 or null when the package sets none, so
 * the two helpers below are the only place that "0 means unset" is decided.
 */
export type ParticipantLimits = {
  minParticipants?: number | null;
  maxParticipants?: number | null;
};

/** Lower bound — the package minimum, or 1 when it sets none. */
export function participantMin(limits: ParticipantLimits | null | undefined): number {
  const min = Number(limits?.minParticipants);
  return Number.isFinite(min) && min > 0 ? Math.floor(min) : 1;
}

/** Upper bound, or null when the package is unbounded. */
export function participantMax(
  limits: ParticipantLimits | null | undefined,
): number | null {
  const max = Number(limits?.maxParticipants);
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : null;
}

/**
 * Clamp a player count into the package's range as a whole number.
 *
 * Anything unparseable — an empty field, stray text, a partially typed value —
 * falls back to the minimum rather than 0, so the count is always bookable.
 * Fractions truncate, matching the web's `parseInt`.
 *
 * When a package is misconfigured with max below min, the maximum wins; that is
 * the order the web's `Math.min(max, Math.max(min, v))` produces, and it keeps
 * the count inside the hard ceiling the server enforces.
 */
export function clampParticipants(
  value: number | string | null | undefined,
  limits: ParticipantLimits | null | undefined,
): number {
  const min = participantMin(limits);
  const max = participantMax(limits);

  const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
  let next = Number.isFinite(parsed) ? Math.trunc(parsed) : min;

  if (next < min) next = min;
  if (max != null && next > max) next = max;
  return next;
}

/** The "Min: 8 • Max: 25" hint under a player-count field; omits an unset max. */
export function participantLimitsLabel(
  limits: ParticipantLimits | null | undefined,
): string {
  const max = participantMax(limits);
  return `Min: ${participantMin(limits)}${max != null ? ` • Max: ${max}` : ""}`;
}
