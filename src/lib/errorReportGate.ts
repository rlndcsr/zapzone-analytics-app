/**
 * How often the app may report an error to the backend (web parity:
 * utils/errorLogger.ts). Deliberately quiet: the same error at most once a
 * minute, and at most twenty-five reports per app session, so a screen stuck in
 * a failing loop cannot flood the server's log.
 */
export const MAX_REPORTS_PER_SESSION = 25;
export const REPEAT_WINDOW_MS = 60_000;

export type ReportGate = {
  /** True when a report with this key may go out now; records it if so. */
  admit: (key: string, now?: number) => boolean;
};

export function createReportGate(
  maxReports = MAX_REPORTS_PER_SESSION,
  repeatWindowMs = REPEAT_WINDOW_MS,
): ReportGate {
  const lastSeen = new Map<string, number>();
  let sent = 0;

  return {
    admit(key, now = Date.now()) {
      if (sent >= maxReports) return false;
      const previous = lastSeen.get(key);
      if (previous !== undefined && now - previous < repeatWindowMs) return false;
      lastSeen.set(key, now);
      sent += 1;
      return true;
    },
  };
}
