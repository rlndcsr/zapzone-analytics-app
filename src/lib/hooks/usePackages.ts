import { useCallback, useEffect, useRef, useState } from "react";
import { createPatchLog } from "../packages/patchLog";
import {
  fetchPackages,
  isRegularPackage,
  type PackageRow,
} from "../../services/packagesService";
import { getCurrentUser, getToken } from "../session";

// Session cache of the package list, keyed by location; views filter it
// client-side. Mirrors the caching approach used by useEvents.
type Cache = { key: string; fetchedAt: number; data: PackageRow[] };
let cache: Cache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
// The kind is part of the key: the two screens hold different slices of the
// same endpoint, and sharing one cache entry would serve each other's rows. The
// signed-in user is too, so switching accounts never serves the previous one's.
const cacheKey = (locationId: number | undefined, kind: PackageKind) =>
  `${getCurrentUser()?.id ?? "anon"}|${kind}:${locationId ?? "all"}`;

// Set after a mutation (e.g. toggling status) so the list screen knows to
// force a refetch the next time it regains focus.
let stale = false;

// A switch flipped while a quiet refresh is in flight would be undone by that
// refresh's older answer, so each change is replayed over any fetch begun first.
const patches = createPatchLog<PackageRow>();

/** Mark the cached package list stale so it refetches on next focus. */
export function markPackagesStale(): void {
  cache = null;
  stale = true;
}

/** Consume the stale flag (true once after a mutation, then resets). */
export function consumePackagesStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

/** Which slice of the catalog a screen wants. */
export type PackageKind = "regular" | "custom";

type UsePackagesParams = { locationId?: number; kind?: PackageKind };

/** Loads + caches the package list (pull-to-refresh via `refetch`) from the
 *  lightweight GET /api/mobile/packages in one request; views filter/sort client-side. */
export function usePackages({
  locationId,
  kind = "regular",
}: UsePackagesParams = {}) {
  const key = cacheKey(locationId, kind);
  const cacheFresh =
    !!cache && cache.key === key && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

  const [packages, setPackages] = useState<PackageRow[]>(
    cache && cache.key === key ? cache.data : [],
  );
  const [loading, setLoading] = useState(!cacheFresh);
  const [error, setError] = useState<string | null>(null);

  // Only the latest sync may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  // Resolves true once the list holds what the server has now, false when the
  // load failed — so a caller can say the list is out of date.
  const sync = useCallback(
    async ({ force = false }: { force?: boolean } = {}): Promise<boolean> => {
      const k = cacheKey(locationId, kind);
      const fresh =
        !!cache && cache.key === k && Date.now() - cache.fetchedAt < CACHE_TTL_MS;

      if (fresh && !force) {
        setPackages(cache!.data);
        setError(null);
        setLoading(false);
        return true;
      }

      const requestId = ++requestIdRef.current;
      const isCurrent = () => requestId === requestIdRef.current;

      const token = getToken();
      // The backend resolves the user from the Bearer token; `user_id` is only
      // a fallback hint, so a token alone is enough to load the list.
      if (!token) {
        if (isCurrent()) {
          setError("Not authenticated");
          setLoading(false);
        }
        return false;
      }
      const user = getCurrentUser();

      // Show stale cache instantly and refresh quietly; else show the skeleton.
      if (cache && cache.key === k && !force) {
        setPackages(cache.data);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const startedAt = patches.mark();
      try {
        // One endpoint serves both screens: /packages shows the regular
        // catalog, Custom Packages everything with another package_type.
        const all = await fetchPackages({
          token,
          userId: user?.id,
          locationId,
        });
        const data = patches.replay(
          all.filter((p) =>
            kind === "custom" ? !isRegularPackage(p) : isRegularPackage(p),
          ),
          startedAt,
        );
        cache = { key: k, fetchedAt: Date.now(), data };
        if (isCurrent()) {
          setPackages(data);
          setError(null);
        }
        return true;
      } catch (err) {
        console.error("Packages error:", err);
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "Failed to load packages",
          );
          if (!cache) setPackages([]);
        }
        return false;
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [locationId, kind],
  );

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current += 1;
    };
  }, [sync]);

  const refetch = useCallback(() => {
    cache = null;
    return sync({ force: true });
  }, [sync]);

  // Patch one package in the cache + local list without a full refetch (used
  // after the toggle-status and online-availability calls).
  const applyPatch = useCallback((id: number, changes: Partial<PackageRow>) => {
    patches.record(id, changes);
    const patch = (rows: PackageRow[]) =>
      rows.map((p) => (p.id === id ? { ...p, ...changes } : p));
    if (cache) cache = { ...cache, data: patch(cache.data) };
    setPackages((prev) => patch(prev));
  }, []);

  const applyStatus = useCallback(
    (id: number, active: boolean) => applyPatch(id, { status: active ? "active" : "inactive" }),
    [applyPatch],
  );

  const applyOnline = useCallback(
    (id: number, availableOnline: boolean) => applyPatch(id, { availableOnline }),
    [applyPatch],
  );

  return { packages, loading, error, refetch, applyStatus, applyOnline };
}
