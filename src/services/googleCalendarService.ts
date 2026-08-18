import { apiRequest } from "../lib/api";

import { fetchLocations, type LocationOption } from "./locationsService";

/* ------------------------------------------------------------------ types -- */

export type GoogleCalendarStatus = {
  locationId: number | null;
  /** Whether the *server* has Google OAuth credentials configured at all. */
  credentialsConfigured: boolean;
  isConnected: boolean;
  googleAccountEmail: string | null;
  calendarId: string | null;
  lastSyncedAt: string | null;
  syncFromDate: string | null;
};

/** One row in "All Google Calendar Connections" — a location and its status. */
export type GoogleCalendarConnection = {
  location: LocationOption;
  status: GoogleCalendarStatus;
};

type RawStatus = {
  location_id?: unknown;
  credentials_configured?: unknown;
  is_connected?: unknown;
  google_account_email?: unknown;
  calendar_id?: unknown;
  last_synced_at?: unknown;
  sync_from_date?: unknown;
};

/* ---------------------------------------------------------------- mapping -- */

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function mapStatus(s: RawStatus | null | undefined): GoogleCalendarStatus {
  return {
    locationId: typeof s?.location_id === "number" ? s.location_id : null,
    credentialsConfigured:
      s?.credentials_configured === true || s?.credentials_configured === 1,
    isConnected: s?.is_connected === true || s?.is_connected === 1,
    googleAccountEmail: text(s?.google_account_email),
    calendarId: text(s?.calendar_id),
    lastSyncedAt: text(s?.last_synced_at),
    syncFromDate: text(s?.sync_from_date),
  };
}

/* --------------------------------------------------------------- requests -- */

/** GET /api/google-calendar/status?location_id= — sync state for one location. */
export async function fetchGoogleCalendarStatus(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<GoogleCalendarStatus> {
  const res = await apiRequest<{ data?: RawStatus } | RawStatus>(
    `/api/google-calendar/status?location_id=${locationId}`,
    { token, signal },
  );
  const raw = (res as { data?: RawStatus }).data ?? (res as RawStatus);
  return mapStatus(raw);
}

/**
 * GET /api/google-calendar/auth-url?location_id= — the Google consent URL to
 * open in a browser. The redirect lands on the backend callback, which stores
 * the tokens, so the app only has to re-read the status afterwards.
 */
export async function fetchGoogleCalendarAuthUrl(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await apiRequest<
    { data?: { auth_url?: unknown }; auth_url?: unknown }
  >(`/api/google-calendar/auth-url?location_id=${locationId}`, {
    token,
    signal,
  });
  return text(res.data?.auth_url) ?? text(res.auth_url);
}

/** POST /api/google-calendar/disconnect — accepts any location id. */
export async function disconnectGoogleCalendar(
  token: string,
  locationId: number,
): Promise<void> {
  await apiRequest("/api/google-calendar/disconnect", {
    method: "POST",
    token,
    body: { location_id: locationId },
  });
}

/** How many status requests to have in flight at once during the fan-out. */
const STATUS_BATCH_SIZE = 5;

/**
 * Every location that has Google Calendar connected.
 *
 * The web calls `/google-calendar/connections` for this, but that route does not
 * exist on the backend (its route group has status/auth-url/disconnect/calendars
 * /calendar/sync/resync only) — which is why the web modal always shows its
 * empty state. Since the backend must not change, this assembles the same list
 * from the per-location status endpoint instead, so the app shows real data.
 *
 * Locations are queried in small batches rather than all at once: a company can
 * hold a dozen-plus locations and one burst of parallel requests is the kind of
 * thing that trips a rate limiter.
 */
export async function fetchGoogleCalendarConnections(
  token: string,
  signal?: AbortSignal,
): Promise<GoogleCalendarConnection[]> {
  const locations = await fetchLocations(token, signal);
  const connections: GoogleCalendarConnection[] = [];

  for (let i = 0; i < locations.length; i += STATUS_BATCH_SIZE) {
    const batch = locations.slice(i, i + STATUS_BATCH_SIZE);
    const settled = await Promise.all(
      batch.map(async (location) => {
        try {
          const status = await fetchGoogleCalendarStatus(
            token,
            location.id,
            signal,
          );
          return { location, status };
        } catch {
          // A location the caller cannot read (403) simply has no row here.
          return null;
        }
      }),
    );
    for (const row of settled) {
      if (row?.status.isConnected) connections.push(row);
    }
  }

  return connections;
}
