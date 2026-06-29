import { useCallback, useEffect, useState } from "react";
import {
  fetchCompanyStatistics,
  fetchUserProfile,
  type CompanyStatistics,
  type ProfileUser,
} from "../../services/profileService";
import { getCurrentUser, getToken } from "../session";

/**
 * Loads the signed-in user's full profile and (if they belong to a company)
 * the company's auto-calculated statistics. Company stats failing is
 * non-fatal — the profile still renders.
 */
export function useProfile() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState<CompanyStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    const session = getCurrentUser();

    if (!token || !session?.id) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const profile = await fetchUserProfile(session.id, token);
      setUser(profile);
      setError(null);

      const companyId = profile.company_id ?? profile.company?.id ?? null;
      if (companyId) {
        try {
          setStats(await fetchCompanyStatistics(companyId, token));
        } catch {
          // Stats are best-effort; leave them null and keep the profile.
          setStats(null);
        }
      } else {
        setStats(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load().catch(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  return { user, stats, loading, error, refresh: load };
}
