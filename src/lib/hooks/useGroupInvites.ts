import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGroupInvites,
  type GroupInvite,
} from "../../services/waiversService";
import { getToken } from "../session";

// Set after creating/resending an invite so the list refetches on next focus.
let stale = false;

export function markGroupInvitesStale(): void {
  stale = true;
}

export function consumeGroupInvitesStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

/** Loads group (chaperone) invites (per_page=100, newest first). */
export function useGroupInvites() {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const sync = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchGroupInvites(token);
      if (isCurrent()) {
        setInvites(data);
        setError(null);
      }
    } catch (err) {
      console.error("Group invites error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load invites");
        setInvites([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  return { invites, loading, error, refetch: sync };
}
