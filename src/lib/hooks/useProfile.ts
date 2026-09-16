import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCompanyStatistics,
  fetchUserProfile,
  type CompanyStatistics,
  type ProfileUser,
} from "../../services/profileService";
import { fetchStaffCount } from "../../services/usersService";
import { getCurrentUser, getToken } from "../session";

/**
 * Loads the signed-in user's profile plus their company's auto-calculated
 * stats (best-effort: stats failing is non-fatal, the profile still renders).
 *
 * `companyAdminCount` exists to turn the API's `total_users` — every account on
 * the company — into the web admin's "Total Employees", which is every account
 * *except* the company admins. The statistics endpoint has no such field, so it
 * is counted here with a `per_page=1` request that reads `pagination.total`.
 * Subtracting rather than adding up the other roles keeps it right if a new
 * staff role is ever introduced.
 *
 * Only meaningful for a company admin: `/api/users` scopes a manager or
 * attendant to their own location, so the count would be of that location, not
 * the company. Callers gate the metric on the role, as the web does.
 */
export function useProfile() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [stats, setStats] = useState<CompanyStatistics | null>(null);
  const [companyAdminCount, setCompanyAdminCount] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track the first successful fetch so focus/refresh revalidations don't
  // flip `loading` back on and re-show the skeleton over existing data.
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    const token = getToken();
    const session = getCurrentUser();

    if (!token || !session?.id) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Only show the full-screen loading state on the very first fetch.
    if (!hasLoaded.current) setLoading(true);
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

      if (profile.role === "company_admin") {
        try {
          setCompanyAdminCount(
            await fetchStaffCount(token, { role: "company_admin" }),
          );
        } catch {
          // Also best-effort — the counters fall back to the raw user total.
          setCompanyAdminCount(null);
        }
      } else {
        setCompanyAdminCount(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      hasLoaded.current = true;
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

  return { user, stats, companyAdminCount, loading, error, refresh: load };
}
