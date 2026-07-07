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
const dayKey = (userId: number | undefined, date: string) =>
  `${userKey(userId)}|${date}`;

/**
 * Loads the spaces and the selected day's bookings for the Space Schedule.
 * `date` is a YYYY-MM-DD key. Scoped by the current user (backend limits to the
 * user's location), so no location filter is needed — matching the web.
 */
export function useSpaceSchedule(date: string) {
  const userId = getCurrentUser()?.id;
  const dKey = dayKey(userId, date);
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
      const fresh =
        !!spacesCache &&
        spacesCache.key === uKey &&
        Date.now() - spacesCache.fetchedAt < CACHE_TTL_MS;
      if (fresh && !force) {
        setSpaces(spacesCache!.data);
        return;
      }
      const token = getToken();
      if (!token) return;
      try {
        const data = await fetchSpaces({ token, userId });
        spacesCache = { key: uKey, fetchedAt: Date.now(), data };
        setSpaces(data);
      } catch (err) {
        console.error("Spaces load error:", err);
      }
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
        const data = await fetchDaySchedule({ token, date, userId });
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
    [dKey, date, userId],
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
