import { useEffect, useState } from "react";
import {
  fetchWaiverSettings,
  type WaiverSettings,
} from "../../services/waiversService";
import { getToken } from "../session";

// Company settings rarely change during a session — cache for the whole run so
// every waiver screen shares one fetch when deciding which actions to surface.
let cache: WaiverSettings | null = null;

/**
 * Company waiver permission flags (admin_delete_enabled, manager_* toggles).
 * Screens use these to mirror the backend's role gating — hiding actions the
 * caller's role would be rejected for. Falls back to permissive-but-safe
 * defaults (matching the backend migration defaults) until loaded.
 */
export function useWaiverSettings() {
  const [settings, setSettings] = useState<WaiverSettings | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let active = true;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchWaiverSettings(token)
      .then((s) => {
        cache = s;
        if (active) setSettings(s);
      })
      .catch(() => {
        /* Non-fatal: keep null; screens use conservative defaults. */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}
