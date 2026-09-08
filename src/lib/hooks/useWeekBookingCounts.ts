import { useCallback, useEffect, useRef, useState } from "react";

import { fetchBookingCountsByDate } from "../../services/bookingsService";
import { getCurrentUser, getToken } from "../session";

// The week strip is visible on every Space Schedule render, so its counts are
// cached per (user, range, location) the same way useSpaceSchedule caches a
// day — navigating dates inside the loaded week must not refetch.
const CACHE_TTL_MS = 5 * 60 * 1000;

type CountsCache = { fetchedAt: number; data: Record<string, number> };
const cache = new Map<string, CountsCache>();

const cacheKey = (
  userId: number | undefined,
  from: string,
  to: string,
  locationId?: number,
) => `${userId ?? "me"}|${from}|${to}|${locationId ?? "all"}`;

/**
 * Booking counts per date across an inclusive range, keyed by "YYYY-MM-DD" —
 * the badges on the Space Schedule's week strip. `from`/`to` are date keys;
 * `locationId` is the active workspace location (undefined = all / server
 * scoped), matching `useSpaceSchedule`.
 */
export function useWeekBookingCounts(
  from: string,
  to: string,
  locationId?: number,
) {
  const userId = getCurrentUser()?.id;
  const key = cacheKey(userId, from, to, locationId);

  const seed = cache.get(key);
  const [counts, setCounts] = useState<Record<string, number>>(seed ? seed.data : {});

  // Only the newest request may write state, so a slow earlier range can't
  // overwrite the one the user is actually looking at.
  const requestIdRef = useRef(0);

  const sync = useCallback(
    async (force: boolean) => {
      const cached = cache.get(key);
      const fresh = !!cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
      if (cached) setCounts(cached.data);
      if (fresh && !force) return;

      const token = getToken();
      if (!token) return;

      const requestId = ++requestIdRef.current;
      try {
        const data = await fetchBookingCountsByDate({
          token,
          from,
          to,
          userId,
          locationId,
        });
        cache.set(key, { fetchedAt: Date.now(), data });
        if (requestId === requestIdRef.current) setCounts(data);
      } catch (err) {
        // The strip is supplementary — a failure just leaves the badges off.
        console.error("Week booking counts error:", err);
      }
    },
    [key, from, to, userId, locationId],
  );

  useEffect(() => {
    sync(false);
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  const refetch = useCallback(() => sync(true), [sync]);

  return { counts, refetch };
}
