import { useEffect, useState } from "react";

import { resolveBrandLogoPath, resolveEffectiveLocationId } from "../branding/brandLogo";
import { fetchUserProfile } from "../../services/profileService";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import { useActiveLocation } from "../location/activeLocationStore";
import { getCurrentUser, getToken, useCurrentUserId } from "../session";

let cachedCompanyLogo: string | null = null;
let companyLogoUserId: number | null = null;
let companyLogoInFlight: Promise<void> | null = null;

function loadCompanyLogo(userId: number, token: string): Promise<void> {
  if (companyLogoInFlight) return companyLogoInFlight;
  companyLogoInFlight = fetchUserProfile(userId, token)
    .then((profile) => {
      cachedCompanyLogo = profile.company?.logo_path ?? null;
      companyLogoUserId = userId;
    })
    .catch(() => {
      // Best-effort — the header just keeps the bundled default.
    })
    .finally(() => {
      companyLogoInFlight = null;
    });
  return companyLogoInFlight;
}

/** Call after a successful logo save so the header updates without a refetch. */
export function setCachedCompanyLogo(logoPath: string | null): void {
  cachedCompanyLogo = logoPath;
}

/**
 * The signed-in user's company logo — fetched at most once per session (GET
 * /api/users/{id}, the same endpoint the Profile tab already uses) and shared
 * by every screen that renders the brand logo.
 */
function useCompanyLogo(): string | null {
  const userId = useCurrentUserId();
  const [logoPath, setLogoPath] = useState<string | null>(
    userId && userId === companyLogoUserId ? cachedCompanyLogo : null,
  );

  useEffect(() => {
    if (!userId) {
      cachedCompanyLogo = null;
      companyLogoUserId = null;
      setLogoPath(null);
      return;
    }
    if (companyLogoUserId === userId) {
      setLogoPath(cachedCompanyLogo);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    loadCompanyLogo(userId, token).then(() => {
      if (!cancelled) setLogoPath(cachedCompanyLogo);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return logoPath;
}

let cachedLocations: LocationOption[] | null = null;
let locationsInFlight: Promise<LocationOption[]> | null = null;

function loadLocations(token: string): Promise<LocationOption[]> {
  if (cachedLocations) return Promise.resolve(cachedLocations);
  if (locationsInFlight) return locationsInFlight;
  locationsInFlight = fetchLocations(token)
    .then((list) => {
      cachedLocations = list;
      return list;
    })
    .finally(() => {
      locationsInFlight = null;
    });
  return locationsInFlight;
}

/**
 * Call after saving a location's logo so the header stops showing the old one.
 * Patches the cached list in place — the counterpart to
 * {@link setCachedCompanyLogo}, and like it, it takes effect the next time a
 * consumer renders rather than pushing an update into mounted ones.
 */
export function setCachedLocationLogo(
  locationId: number,
  logoPath: string | null,
): void {
  if (!cachedLocations) return;
  cachedLocations = cachedLocations.map((l) =>
    l.id === locationId ? { ...l, logoPath } : l,
  );
}

/** The given location's logo, from the same lightweight list the location picker uses. */
function useLocationLogo(locationId: number | null): string | null {
  const [logoPath, setLogoPath] = useState<string | null>(
    cachedLocations?.find((l) => l.id === locationId)?.logoPath ?? null,
  );

  useEffect(() => {
    if (locationId == null) {
      setLogoPath(null);
      return;
    }
    const cached = cachedLocations?.find((l) => l.id === locationId);
    if (cached) {
      setLogoPath(cached.logoPath);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    loadLocations(token).then((list) => {
      if (cancelled) return;
      setLogoPath(list.find((l) => l.id === locationId)?.logoPath ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  return logoPath;
}

/**
 * The brand logo to show wherever Mobile renders app-wide branding: the
 * active location's own logo for a company_admin, the assigned location's
 * for a manager/attendant, falling back to the company logo and finally to
 * the caller's bundled default (this returns null in that last case).
 */
export function useBrandLogo(): string | null {
  const user = getCurrentUser();
  const active = useActiveLocation();
  const effectiveLocationId = resolveEffectiveLocationId(user, active.id);

  const locationLogo = useLocationLogo(effectiveLocationId);
  const companyLogo = useCompanyLogo();

  return resolveBrandLogoPath(locationLogo, companyLogo);
}
