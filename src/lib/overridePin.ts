export function validateOverridePin(
  pin: string,
  confirmPin: string,
): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "The PIN must be 4 to 6 digits.";
  if (pin !== confirmPin) return "The two PINs do not match.";
  return null;
}

/**
 * The conflicts behind the server's overlap gate — a 409 that says a manager can approve it —
 * worded for the approval dialog. Null for every other failure, so a plain 409 stays an error.
 */
export function overlapGateConflicts(
  status: number,
  body: unknown,
): string[] | null {
  if (status !== 409) return null;
  const data = body as
    | { requires_override?: unknown; conflicts?: unknown }
    | null
    | undefined;
  if (!data?.requires_override) return null;
  return (Array.isArray(data.conflicts) ? data.conflicts : [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => {
      const reason = c.trim();
      return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`;
    });
}
