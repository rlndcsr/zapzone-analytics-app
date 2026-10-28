import { useEffect, useState } from "react";
import {
  fetchWaiverSettings,
  type WaiverSettings,
} from "../../services/waiversService";
import { getCurrentUser, getToken } from "../session";

// Company settings rarely change during a session — cache for the whole run so
// every waiver screen shares one fetch when deciding which actions to surface.
// Tagged with the account that loaded it: after switching to an account in
// another company, the previous company's flags must not apply.
let cache: { owner: number | null; settings: WaiverSettings } | null = null;

const currentOwner = () => getCurrentUser()?.id ?? null;
const ownSettings = () =>
  cache && cache.owner === currentOwner() ? cache.settings : null;

/**
 * Replace the shared cache after a save so permission-gated actions across the
 * waiver screens reflect the new settings without a refetch.
 */
export function primeWaiverSettings(next: WaiverSettings) {
  cache = { owner: currentOwner(), settings: next };
}

/**
 * Company waiver permission flags (admin_delete_enabled, manager_* toggles).
 * Screens use these to mirror the backend's role gating — hiding actions the
 * caller's role would be rejected for. Falls back to permissive-but-safe
 * defaults (matching the backend migration defaults) until loaded.
 */
export function useWaiverSettings() {
  const [settings, setSettings] = useState<WaiverSettings | null>(ownSettings);
  const [loading, setLoading] = useState(() => !ownSettings());

  useEffect(() => {
    if (ownSettings()) return;
    let active = true;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const owner = currentOwner();
    fetchWaiverSettings(token)
      .then((s) => {
        cache = { owner, settings: s };
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
