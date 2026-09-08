import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDaySchedule,
  fetchSpaces,
  type ScheduleBooking,
  type Space,
} from "../../services/bookingsService";
import { getCurrentUser, getToken } from "../session";

// Spaces change rarely, so they're cached once per session (keyed by user).
// The day's bookings are cached per date. Both mirror the web Space Schedule's
// room/booking caches and keep date navigation from refetching needlessly.
const CACHE_TTL_MS = 5 * 60 * 1000;

type SpacesCache = { key: string; fetchedAt: number; data: Space[] };
let spacesCache: SpacesCache | null = null;

type DayCache = { key: string; fetchedAt: number; data: ScheduleBooking[] };
const dayCache = new Map<string, DayCache>();

const userKey = (userId?: number) => String(userId ?? "me");
const dayKey = (userId: number | undefined, date: string, locationId?: number) =>
  `${userKey(userId)}|${date}|${locationId ?? "all"}`;

/**
 * Read the session-wide spaces cache, refreshing it when stale (or when
 * `force` says to). Returns null when there is nothing to show — no token, or
 * the request failed and the cache was empty.
 */
async function loadSpaces(
  uKey: string,
  userId: number | undefined,
  force: boolean,
): Promise<Space[] | null> {
  const fresh =
    !!spacesCache &&
    spacesCache.key === uKey &&
    Date.now() - spacesCache.fetchedAt < CACHE_TTL_MS;
  if (fresh && !force) return spacesCache!.data;

  const token = getToken();
  if (!token) return null;
  try {
    const data = await fetchSpaces({ token, userId });
    spacesCache = { key: uKey, fetchedAt: Date.now(), data };
    return data;
  } catch (err) {
    console.error("Spaces load error:", err);
    return null;
  }
}

/**
 * Just the spaces, for screens that lay bookings out in space columns without
 * needing this hook's day fetch (the Calendar tab's day grid). Shares the same
 * session cache, so mounting it after the Space Schedule costs nothing.
 */
export function useSpaces() {
  const userId = getCurrentUser()?.id;
  const uKey = userKey(userId);

  const [spaces, setSpaces] = useState<Space[]>(
    spacesCache && spacesCache.key === uKey ? spacesCache.data : [],
  );
  const mountedRef = useRef(true);

  const sync = useCallback(
    async (force: boolean) => {
      const data = await loadSpaces(uKey, userId, force);
      if (data && mountedRef.current) setSpaces(data);
    },
    [uKey, userId],
  );

  useEffect(() => {
    mountedRef.current = true;
    sync(false);
    return () => {
      mountedRef.current = false;
    };
  }, [sync]);

  const refetch = useCallback(() => sync(true), [sync]);

  return { spaces, refetch };
}

/**
 * Loads the spaces and the selected day's bookings for the Space Schedule.
 * `date` is a YYYY-MM-DD key. Bookings are additionally scoped by
 * `locationId` when given — the active workspace location for a company_admin
 * (web parity: `effectiveLocationId`); managers/attendants are auto-scoped to
 * their own location server-side either way, so `locationId` stays undefined
 * for them. Spaces are NOT filtered here — like the web, every space loads
 * once and the screen filters `displaySpaces` itself, since a space has no
 * per-request location filter on its own list endpoint.
 */
export function useSpaceSchedule(date: string, locationId?: number) {
  const userId = getCurrentUser()?.id;
  const dKey = dayKey(userId, date, locationId);
  const uKey = userKey(userId);

  const daySeed = dayCache.get(dKey);
  const [spaces, setSpaces] = useState<Space[]>(
    spacesCache && spacesCache.key === uKey ? spacesCache.data : [],
  );
  const [bookings, setBookings] = useState<ScheduleBooking[]>(
    daySeed ? daySeed.data : [],
  );
  const [loading, setLoading] = useState(!daySeed);
  const [error, setError] = useState<string | null>(null);

  // Only the latest day-sync may write state (guards against stale responses
  // when the user taps through dates quickly).
  const requestIdRef = useRef(0);

  const syncSpaces = useCallback(
    async (force: boolean) => {
      const data = await loadSpaces(uKey, userId, force);
      if (data) setSpaces(data);
    },
    [uKey, userId],
  );

  const syncDay = useCallback(
    async (force: boolean) => {
      const cached = dayCache.get(dKey);
      const fresh = !!cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestId === requestIdRef.current;

      if (fresh && !force) {
        setBookings(cached!.data);
        setError(null);
        setLoading(false);
        return;
      }

      const token = getToken();
      if (!token) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      // Show cached data instantly and refresh quietly; else show the spinner.
      if (cached && !force) {
        setBookings(cached.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchDaySchedule({ token, date, userId, locationId });
        dayCache.set(dKey, { key: dKey, fetchedAt: Date.now(), data });
        if (isCurrent()) {
          setBookings(data);
          setError(null);
        }
      } catch (err) {
        console.error("Space schedule error:", err);
        if (isCurrent()) {
          setError(err instanceof Error ? err.message : "Failed to load schedule");
          if (!dayCache.has(dKey)) setBookings([]);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [dKey, date, userId, locationId],
  );

  useEffect(() => {
    syncSpaces(false);
    syncDay(false);
    return () => {
      requestIdRef.current++;
    };
  }, [syncSpaces, syncDay]);

  const refetch = useCallback(async () => {
    await Promise.all([syncSpaces(true), syncDay(true)]);
  }, [syncSpaces, syncDay]);

  return { spaces, bookings, loading, error, refetch };
}
