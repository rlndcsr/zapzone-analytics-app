import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentUser, getToken } from "../session";

type LoaderContext = {
  token: string;
  userId: number;
  signal?: AbortSignal;
};

/**
 * Generic list loader for the catalog management screens (Spaces, Add-ons,
 * Promos, Gift Cards). Handles auth, loading/error state, stale-response
 * guarding, and pull-to-refresh. Pass a memoized `loader` (wrap the service call
 * in `useCallback`) so the effect doesn't re-run every render.
 */
export function useAsyncList<T>(loader: (ctx: LoaderContext) => Promise<T[]>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only the latest load may write state (guards against stale responses).
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
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

    setLoading(true);
    try {
      const rows = await loader({ token, userId: user.id });
      if (isCurrent()) {
        setData(rows);
        setError(null);
      }
    } catch (err) {
      console.error("List load error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current++;
    };
  }, [load]);

  const refetch = useCallback(() => load(), [load]);

  return { data, loading, error, refetch };
}
