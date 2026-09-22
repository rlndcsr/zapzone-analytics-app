import {
  fetchAllBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import { mergeBookingInto } from "./patchBooking";

// Single source of truth for the full booking list. Manage Bookings and both
// calendars read/write this one cache, so navigating between them never re-pages.
type CacheEntry = { fetchedAt: number; data: CalendarBooking[] };

// One entry per location scope; `inFlight` lets two consumers share one trip.
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CalendarBooking[]>>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export const bookingCacheKey = (locationId?: number) =>
  String(locationId ?? "all");

export const getCachedBookings = (key: string): CacheEntry | undefined =>
  cache.get(key);

export const isBookingCacheFresh = (entry?: CacheEntry): boolean =>
  !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;

export const hasCachedBookings = (key: string): boolean => cache.has(key);

/** True while a sync is still running (TEMP: investigation logging). */
export const isBookingSyncInProgress = (key?: string): boolean =>
  key == null ? inFlight.size > 0 : inFlight.has(key);

// Set after a mutation so the list screen force-refetches on next focus.
let stale = false;

/** Mark the cached booking list stale so it refetches on next focus. */
export function markBookingsStale(): void {
  cache.clear();
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumeBookingsStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

// Mounted lists subscribe so a patched booking repaints without a refetch.
type CacheListener = () => void;
const listeners = new Set<CacheListener>();

/** Re-render on every cache patch. Returns the unsubscribe. */
export function subscribeToBookingCache(listener: CacheListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Merge a few fields into one cached booking, everywhere it is cached.
 *
 * A booking can sit in more than one scope entry (the "all" list and its location's list), so patch
 * each one rather than guessing which the caller is looking at. The merge itself — and why it is a
 * merge and not a replace — lives in mergeBookingInto.
 */
export function patchCachedBooking(
  bookingId: number,
  patch: Partial<CalendarBooking>,
): void {
  let touched = false;

  for (const [key, entry] of cache) {
    const data = mergeBookingInto(entry.data, bookingId, patch);
    if (data === entry.data) continue;

    // Keep fetchedAt: a patch refreshes a field, it does not re-date the fetch.
    cache.set(key, { ...entry, data });
    touched = true;
  }

  if (!touched) return;
  for (const listener of [...listeners]) listener();
}

/** Read this scope's entry, logging the hit/miss. TEMP: investigation logging. */
export function readBookingCache(
  key: string,
  caller: string,
): CacheEntry | undefined {
  const entry = cache.get(key);
  if (__DEV__) {
    const state = isBookingCacheFresh(entry) ? "HIT" : "MISS";
    console.log(`[BookingCache] Cache ${state} key=${key} caller=${caller}`);
  }
  return entry;
}

/** Fetch + cache this scope's list, joining any sync already in flight. */
export async function syncBookingList({
  token,
  locationId,
  force = false,
}: {
  token: string;
  locationId?: number;
  force?: boolean;
}): Promise<CalendarBooking[]> {
  const key = bookingCacheKey(locationId);

  const joined = force ? undefined : inFlight.get(key);
  if (joined) {
    if (__DEV__) console.log(`[BookingCache] Joined in-flight sync key=${key}`);
    return joined;
  }

  if (__DEV__) console.log(`[BookingCache] Sync started key=${key}`);
  const pending = fetchAllBookings({ token, locationId }).finally(() => {
    inFlight.delete(key);
    if (__DEV__) console.log(`[BookingCache] Sync finished key=${key}`);
  });
  inFlight.set(key, pending);

  const data = await pending;
  cache.set(key, { fetchedAt: Date.now(), data });
  return data;
}
