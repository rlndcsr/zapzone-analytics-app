import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTemplates,
  type TemplateListFilters,
  type WaiverTemplate,
} from "../../services/waiversService";
import { getToken } from "../session";

// Set after a template mutation so the list refetches on next focus.
let stale = false;

export function markTemplatesStale(): void {
  stale = true;
}

export function consumeTemplatesStale(): boolean {
  if (!stale) return false;
  stale = false;
  return true;
}

/** Loads waiver templates (server-side search/status filtered, per_page=100). */
export function useWaiverTemplates(filters: TemplateListFilters = {}) {
  const [templates, setTemplates] = useState<WaiverTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const key = JSON.stringify(filters);

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
      const data = await fetchTemplates(token, filters);
      if (isCurrent()) {
        setTemplates(data);
        setError(null);
      }
    } catch (err) {
      console.error("Templates error:", err);
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : "Failed to load templates");
        setTemplates([]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    sync();
    return () => {
      requestIdRef.current++;
    };
  }, [sync]);

  return { templates, loading, error, refetch: sync };
}
