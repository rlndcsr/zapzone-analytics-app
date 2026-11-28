/**
 * The booking-restore request and what follows it (spec 002, plan Design §4).
 *
 * The request function is injected (the service passes `apiRequest`). The
 * shared client's change-reason and blocked-period continuations — its single
 * follow-up after a refusal the server made before changing anything — happen
 * inside that one call, before an outcome exists, and are left as they are.
 * Once an outcome is classified, nothing here sends another restore request.
 */
import type { SingleFlight } from "../singleFlight.ts";
import {
  classifyRestoreOutcome,
  restoreAttemptFromError,
  type RestoreOutcome,
} from "./restoreOutcome.ts";

/** The slice of `apiRequest` restore needs (structurally the refund flow's RequestFn). */
export type RestoreRequestFn = (
  path: string,
  options: { method: "POST"; token?: string },
) => Promise<unknown>;

/** POST /api/bookings/{id}/restore — one request, default wait, then classified. Never throws for HTTP/transport. */
export async function executeRestore(
  request: RestoreRequestFn,
  token: string,
  bookingId: number,
): Promise<RestoreOutcome> {
  try {
    const body = await request(`/api/bookings/${bookingId}/restore`, { method: "POST", token });
    return classifyRestoreOutcome({ kind: "ok", body });
  } catch (err) {
    return classifyRestoreOutcome(restoreAttemptFromError(err));
  }
}

export type RestoreFlowDeps = {
  key: string;
  owner: unknown;
  guard: SingleFlight;
  restore: () => Promise<RestoreOutcome>;
  isSessionCurrent: () => boolean;
  setBusy: (busy: boolean) => void;
  closeSheet: () => void;
  notify: (title: string, message: string) => void;
  noticeFor: (outcome: RestoreOutcome) => { title: string; message: string };
  /** Reload the Deleted list and sync the active list (existing read-only mechanisms). */
  refresh: () => Promise<unknown>;
};

/**
 * One restore attempt. A confirmed rejection only shows its alert (today's
 * behaviour); a restore — with or without a clash warning — or an unknown
 * outcome closes the sheet, shows the alert, then refreshes both lists. A
 * failed refresh never repeats or alters the alert, and a late answer for a
 * session that has ended shows nothing. Resolves `null` when this session
 * already has a restore of this booking in flight.
 */
export function runRestoreFlow(deps: RestoreFlowDeps): Promise<RestoreOutcome | null> {
  return deps.guard.run(deps.key, deps.owner, async () => {
    deps.setBusy(true);
    try {
      const outcome = await deps.restore();
      if (!deps.isSessionCurrent()) return outcome;

      const { title, message } = deps.noticeFor(outcome);
      if (outcome.kind === "rejected") {
        deps.notify(title, message);
        return outcome;
      }

      deps.closeSheet();
      deps.notify(title, message);
      try {
        await deps.refresh();
      } catch {
        // Each list shows its own error state; the restore alert stands.
      }
      return outcome;
    } finally {
      deps.setBusy(false);
    }
  });
}
