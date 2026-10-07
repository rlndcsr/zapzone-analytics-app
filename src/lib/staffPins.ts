/**
 * Rules behind the Employee PINs screen (the web's StaffPins page), kept apart
 * from the screen so they can be unit-tested.
 */

/** The web's ROLE_LABELS, word for word. */
export const STAFF_ROLE_LABELS: Record<string, string> = {
  company_admin: "Administrator",
  location_manager: "Location manager",
  attendant: "Attendant",
};

export function staffRoleLabel(role: string): string {
  return STAFF_ROLE_LABELS[role] ?? role;
}

/** The roles the backend lets manage PINs and terminals (config staff_pins.manager_roles). */
export function canManageStaffPins(role: string | null | undefined): boolean {
  return role === "company_admin" || role === "location_manager";
}

/** Used until /staff-pin/status reports the server's length (config staff_pins.length). */
export const DEFAULT_PIN_LENGTH = 6;

/** Null when the PIN is exactly `length` digits, else the message to show. */
export function validateStaffPin(pin: string, length: number): string | null {
  return new RegExp(`^\\d{${length}}$`).test(pin)
    ? null
    : `The PIN must be ${length} digits.`;
}

/**
 * What the terminal's "Lock after" box shows when nothing is saved — the web
 * shows 60, which is also the backend's staff_pins.idle.default_seconds.
 */
export const DEFAULT_IDLE_SECONDS = 60;
export const MIN_IDLE_SECONDS = 15;
export const MAX_IDLE_SECONDS = 3600;

/**
 * The typed "Lock after (seconds)" value as a number, or an error message. The
 * backend clamps silently (an empty box would become 15 seconds), so the app
 * refuses anything outside the range instead of saving a surprise.
 */
export function parseIdleSeconds(
  input: string,
): { ok: true; seconds: number } | { ok: false; error: string } {
  const trimmed = input.trim();
  const range = `Enter a number of seconds from ${MIN_IDLE_SECONDS} to ${MAX_IDLE_SECONDS}.`;
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: range };
  const seconds = Number(trimmed);
  if (seconds < MIN_IDLE_SECONDS || seconds > MAX_IDLE_SECONDS) {
    return { ok: false, error: range };
  }
  return { ok: true, seconds };
}

/**
 * GET /staff-terminals returns revoked terminals too (the controller does not
 * apply StaffTerminal::active()), so a terminal that was just removed would
 * stay on the list. Only live terminals are shown.
 */
export function activeTerminals<T extends { revoked_at?: string | null }>(
  terminals: T[],
): T[] {
  return terminals.filter((t) => !t.revoked_at);
}

/** Case-insensitive match on name or email for the roster search box. */
export function matchesStaffSearch(
  entry: { name: string; email: string },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.email.toLowerCase().includes(q)
  );
}
