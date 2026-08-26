const LAUNCH_AT = Date.now();

let seq = 0;

export type AuthDebugSnapshot = {
  authed: boolean;
  hasToken: boolean;
  userId: number | null;
  invalidated: boolean;
  expiresInMin: number | null;
};

let readSnapshot: (() => AuthDebugSnapshot) | null = null;

/**
 * `lib/session.ts` registers itself here at module scope so every log line can
 * carry the live auth state without each call site gathering it — and without
 * this module importing session (which would create a cycle).
 */
export function registerAuthDebugSource(fn: () => AuthDebugSnapshot): void {
  readSnapshot = fn;
}

/** The last snapshot printed, so a line can show what the state changed FROM. */
let previous: AuthDebugSnapshot | null = null;

function fmt(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "-";
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * Log one event on the auth/navigation path. Self-guards on `__DEV__`, so call
 * sites stay a single line.
 */
export function authDebug(
  event: string,
  detail?: Record<string, unknown>,
): void {
  if (!__DEV__) return;

  seq += 1;
  const id = String(seq).padStart(3, "0");
  const elapsed = Date.now() - LAUNCH_AT;

  const now = readSnapshot?.() ?? null;
  let auth = "auth=unregistered";
  if (now) {
    auth = `authed=${now.authed} token=${now.hasToken} user=${fmt(now.userId)}`;
    if (now.invalidated) auth += " INVALIDATED";
    if (
      previous &&
      (previous.authed !== now.authed || previous.userId !== now.userId)
    ) {
      auth += ` (was authed=${previous.authed} user=${fmt(previous.userId)})`;
    }
    previous = now;
  }

  const extra = detail
    ? Object.entries(detail)
        .map(([key, value]) => `${key}=${fmt(value)}`)
        .join(" ")
    : "";

  console.log(
    `[AUTH-DEBUG #${id}] +${elapsed}ms ${event} | ${auth}${extra ? " | " + extra : ""}`,
  );
}

/** Milliseconds since this JS runtime started. A cold reopen resets it to ~0. */
export function sinceLaunch(): number {
  return Date.now() - LAUNCH_AT;
}
