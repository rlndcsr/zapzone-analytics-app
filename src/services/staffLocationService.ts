import * as SecureStore from "expo-secure-store";

import { markBookingsStale } from "../lib/bookings/bookingListCache";
import { markAttractionPurchasesStale } from "../lib/hooks/useAttractionPurchases";
import { markAttractionsStale } from "../lib/hooks/useAttractions";
import { markEventPurchasesStale } from "../lib/hooks/useEventPurchases";
import { markEventsStale } from "../lib/hooks/useEvents";
import { markFeeSupportsStale } from "../lib/hooks/useFeeSupports";
import { clearMembershipPlansCache } from "../lib/hooks/useMembershipPlans";
import { clearMembershipsCache } from "../lib/hooks/useMemberships";
import { markPackagesStale } from "../lib/hooks/usePackages";
import { clearSpaceScheduleCache } from "../lib/hooks/useSpaceSchedule";
import { markSpecialPricingsStale } from "../lib/hooks/useSpecialPricings";
import { markWaiversStale } from "../lib/hooks/useWaivers";
import { clearWeekBookingCountsCache } from "../lib/hooks/useWeekBookingCounts";
import { apiRequest, apiUrl } from "../lib/api";
import {
  reopenTarget,
  withStaffLocation,
  type StaffLocationState,
} from "../lib/location/staffLocation";
import { getCurrentUser, getToken, updateSessionUser } from "../lib/session";
import type { AuthUser } from "./auth";
import { metricsCacheService } from "./metricsCacheService";
import { clearVisitorSessionsCache } from "./visitorTrackingService";

const RESOLVE_TIMEOUT_MS = 8000;

const preferenceKey = (userId: number) => `zapzone_manager_location_${userId}`;

/** PUT /api/staff-locations/active — the server refuses a location the manager is not assigned to. */
export async function activateStaffLocation(
  token: string,
  locationId: number,
): Promise<StaffLocationState> {
  const res = await apiRequest<{ data: StaffLocationState }>(
    "/api/staff-locations/active",
    { method: "PUT", token, body: { location_id: locationId } },
  );
  return res.data;
}

// Raw fetch: this runs before setSession, where apiRequest's 401 teardown would hit whichever account is live.
async function requestStaffLocations(
  token: string,
  locationId: number | null,
): Promise<StaffLocationState | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(
      apiUrl(locationId == null ? "/api/staff-locations" : "/api/staff-locations/active"),
      {
        method: locationId == null ? "GET" : "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: locationId == null ? undefined : JSON.stringify({ location_id: locationId }),
        signal: controller.signal,
      },
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { data?: StaffLocationState } | null;
    return body?.data ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function rememberedManagerLocation(userId: number): Promise<number | null> {
  try {
    const value = Number(await SecureStore.getItemAsync(preferenceKey(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * A manager's user record pointed at the location the server has active for
 * `token`. On sign-in (`reopen`) it first reopens the last location picked on
 * this device, as the web does. Best-effort: any failure keeps `user`.
 */
export async function resolveStaffLocation(
  token: string,
  user: AuthUser,
  { reopen = false }: { reopen?: boolean } = {},
): Promise<AuthUser> {
  if (user.role !== "location_manager") return user;
  const target = reopen
    ? reopenTarget(user, await rememberedManagerLocation(user.id))
    : null;
  // A fresh sign-in's own payload is already authoritative unless reopening.
  if (reopen && target == null) return user;
  const state = await requestStaffLocations(token, target);
  return state ? withStaffLocation(user, state) : user;
}

function purgeLocationCaches(): Promise<void> {
  markBookingsStale();
  markAttractionPurchasesStale();
  markAttractionsStale();
  markEventPurchasesStale();
  markEventsStale();
  markFeeSupportsStale();
  markPackagesStale();
  markSpecialPricingsStale();
  markWaiversStale();
  clearMembershipsCache();
  clearMembershipPlansCache();
  clearSpaceScheduleCache();
  clearWeekBookingCountsCache();
  clearVisitorSessionsCache();
  return metricsCacheService.clearAllCaches();
}

/** Move the signed-in manager to another assigned location; the caller remounts the app afterwards. */
export async function switchStaffLocation(locationId: number): Promise<void> {
  const token = getToken();
  const user = getCurrentUser();
  if (!token || !user || user.role !== "location_manager") return;

  const state = await activateStaffLocation(token, locationId);
  await purgeLocationCaches();
  await updateSessionUser(withStaffLocation(user, state));
  SecureStore.setItemAsync(
    preferenceKey(user.id),
    String(state.active_location_id ?? locationId),
  ).catch(() => {});
}
