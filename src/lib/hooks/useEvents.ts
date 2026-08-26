import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEvents, type EventRow } from "../../services/eventsService";
import { getCurrentUser, getToken } from "../session";

// Session cache of the event list, keyed by location; views filter it
// client-side. Mirrors the caching approach used by useAttractions.
type Cache = { key: string; fetchedAt: number; data: EventRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheKey = (locationId?: number) => String(locationId ?? "all");

// Set after a mutation (e.g. creating an event) so the list screen knows to
// force a refetch the next time it regains focus.
let stale = false;

/** Mark the cached event list stale so it refetches on next focus. */
export function markEventsStale(): void {
  cache = null;
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeEventsStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

type UseEventsParams = { locationId?: number };

/** Loads + caches the event list, with pull-to-refresh (`refetch`). */
export function useEvents({ locationId }: UseEventsParams = {}) {
  const key = cacheKey(locationId);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [events, setEvents] = useState<EventRow[]>(
    cache && cache.key === key ? cache.data : [],
  );
  const [loading, setLoading] = useState(!cacheFresh);
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const k = cacheKey(locationId);
      const fresh =
        !!cache && cache.key === k && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

      if (fresh && !force) {
        setEvents(cache!.data);
        setError(null);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestId === requestIdRef.current;

      const token = getToken();
      const user = getCurrentUser();
      if (!token || !user) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return;
      }

      // Show stale cache instantly and refresh quietly; else show the spinner.
      if (cache && cache.key === k && !force) {
        setEvents(cache.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const data = await fetchEvents({ token, userId: user.id, locationId });
        cache = { key: k, fetchedAt: Date.now(), data };
        if (isCurrent()) {
          setEvents(data);
          setError(null);
        }
      } catch (err) {
        console.error("Events error:", err);
        if (isCurrent()) {
          setError(err instanceof Error ? err.message : "Failed to load events");
          if (!cache) setEvents([]);
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [locationId],
  );

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  const refetch = useCallback(() => sync({ force: true }), [sync]);

  // Patch one row's status in the cache + local list, so the status pill flips
  // instantly and survives a layout switch without a refetch.
  const applyStatus = useCallback((id: number, active: boolean) => {
    const patch = (rows: EventRow[]) =>
      rows.map((e) =>
        e.id === id ? { ...e, status: active ? "active" : "inactive" } : e,
      ) as EventRow[];
    if (cache) cache = { ...cache, data: patch(cache.data) };
    setEvents((prev) => patch(prev));
  }, []);

  // Drop a row from the cache + local list without a full refetch (used after
  // a delete).
  const remove = useCallback((id: number) => {
    const drop = (rows: EventRow[]) => rows.filter((e) => e.id !== id);
    if (cache) cache = { ...cache, data: drop(cache.data) };
    setEvents((prev) => drop(prev));
  }, []);

  return { events, loading, error, refetch, applyStatus, remove };
}
