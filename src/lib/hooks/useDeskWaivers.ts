import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api";
import {
  mergeDeskWaivers,
  WAIVER_PAGE_SIZE,
  waiverSignerName,
  type DeskWaiverDay,
} from "../checkin/checkInWaiverList";
import type { ResultTone } from "../checkin/checkInPhase";
import { getToken } from "../session";
import {
  checkInWaiver,
  fetchWaivers,
  undoWaiverCheckIn,
  type Waiver,
} from "../../services/waiversService";

const EMPTY_DAY: DeskWaiverDay = {
  waivers: [],
  total: 0,
  truncated: false,
  unsignedComplete: true,
};

/** Prefer the server's own words ("This waiver has already been checked in."). */
const reason = (err: unknown, fallback: string): string =>
  err instanceof ApiError && err.message ? err.message : fallback;

/**
 * The check-in desk's waivers for one day and location (web parity:
 * CheckIn.tsx `loadWaivers`, `checkInWaiverRow`, `undoWaiverRow`).
 *
 * Unsigned and signed are fetched as separate pages and merged unsigned-first
 * (see `mergeDeskWaivers`). Loads are sequence-guarded and keyed to date +
 * location, so a slow reply can neither overwrite a newer one nor leave the
 * previous location's rows on screen.
 */
export function useDeskWaivers(
  date: string,
  locationId: number | undefined,
  notify: (tone: ResultTone, message: string) => void,
) {
  const [day, setDay] = useState<DeskWaiverDay>(EMPTY_DAY);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const requestRef = useRef(0);
  const shownScopeRef = useRef("");
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const scopeKey = `${date}|${locationId ?? "all"}`;

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const isCurrent = () => request === requestRef.current;
    // Another day or location: never show the last scope's rows under it.
    if (shownScopeRef.current !== scopeKey) setDay(EMPTY_DAY);

    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const base = { date, locationId };
      const [unsigned, signed] = await Promise.allSettled([
        fetchWaivers(
          token,
          { ...base, status: "pending" },
          1,
          WAIVER_PAGE_SIZE,
        ),
        fetchWaivers(
          token,
          { ...base, status: "completed" },
          1,
          WAIVER_PAGE_SIZE,
        ),
      ]);
      if (!isCurrent()) return;

      if (unsigned.status === "rejected" && signed.status === "rejected") {
        throw unsigned.reason;
      }

      const outcome = (r: typeof unsigned) =>
        r.status === "fulfilled"
          ? { waivers: r.value.waivers, total: r.value.total }
          : null;

      shownScopeRef.current = scopeKey;
      setDay(mergeDeskWaivers(outcome(unsigned), outcome(signed)));

      if (unsigned.status === "rejected") {
        notifyRef.current(
          "error",
          "Unsigned waivers could not be loaded — this list is incomplete.",
        );
      } else if (signed.status === "rejected") {
        notifyRef.current(
          "error",
          "Signed waivers could not be loaded — this list is incomplete.",
        );
      }
    } catch (err) {
      if (!isCurrent()) return;
      notifyRef.current("error", reason(err, "Failed to load waivers"));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [date, locationId, scopeKey]);

  useEffect(() => {
    load();
    // Leaving this day/location outdates whatever reply is still on its way.
    const requests = requestRef;
    return () => {
      requests.current++;
    };
  }, [load]);

  const act = useCallback(
    async (
      waiver: Waiver,
      run: (token: string, id: number) => Promise<void>,
      success: string,
      fallback: string,
    ) => {
      const token = getToken();
      if (!token) return;
      setBusyId(waiver.id);
      try {
        await run(token, waiver.id);
        notifyRef.current("success", success);
      } catch (err) {
        notifyRef.current("error", reason(err, fallback));
      } finally {
        // Either way, re-read the day so the row agrees with the database.
        await load();
        setBusyId((current) => (current === waiver.id ? null : current));
      }
    },
    [load],
  );

  const checkIn = useCallback(
    (waiver: Waiver) =>
      act(
        waiver,
        checkInWaiver,
        `${waiverSignerName(waiver)} checked in`,
        "Could not check in that waiver.",
      ),
    [act],
  );

  const undo = useCallback(
    (waiver: Waiver) =>
      act(
        waiver,
        undoWaiverCheckIn,
        `Check-in reverted for ${waiverSignerName(waiver)}`,
        "Could not undo that check-in.",
      ),
    [act],
  );

  return { day, loading, busyId, reload: load, checkIn, undo };
}
