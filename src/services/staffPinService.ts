import { apiRequest } from "../lib/api";
import { activeTerminals, DEFAULT_PIN_LENGTH } from "../lib/staffPins";

/**
 * Employee PINs and shared terminals — the same endpoints the web's
 * StaffPinService calls (StaffPinController / StaffTerminalController). All of
 * them are limited to location managers and administrators server-side.
 */

export type StaffPinRosterEntry = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  location_id: number | null;
  has_pin: boolean;
  pin_set_at: string | null;
  locked: boolean;
  locked_until: string | null;
};

export type StaffTerminal = {
  id: number;
  label: string;
  device_id: string;
  location_id: number;
  ceiling_role: string;
  idle_seconds: number | null;
  idle_disabled: boolean;
  elevated_idle_seconds: number | null;
  last_seen_at: string | null;
  revoked_at?: string | null;
  location?: { id: number; name: string } | null;
};

export type StaffTerminalChanges = Partial<{
  label: string;
  idle_seconds: number | null;
  idle_disabled: boolean;
  elevated_idle_seconds: number | null;
}>;

type ListResponse<T> = { success?: boolean; data?: T[] | null };

export async function fetchStaffPinRoster(
  token: string,
): Promise<StaffPinRosterEntry[]> {
  const res = await apiRequest<ListResponse<StaffPinRosterEntry>>(
    "/api/staff-pin/roster",
    { token },
  );
  return res?.data ?? [];
}

/** The PIN length the server enforces (config staff_pins.length, 6 by default). */
export async function fetchStaffPinLength(token: string): Promise<number> {
  const res = await apiRequest<{ data?: { pin_length?: number } | null }>(
    "/api/staff-pin/status",
    { token },
  );
  const length = Number(res?.data?.pin_length);
  return Number.isInteger(length) && length > 0 ? length : DEFAULT_PIN_LENGTH;
}

export async function issueStaffPin(
  token: string,
  userId: number,
  pin: string,
): Promise<void> {
  await apiRequest(`/api/staff-pin/users/${userId}`, {
    method: "POST",
    token,
    body: { pin },
  });
}

export async function clearStaffPin(token: string, userId: number): Promise<void> {
  await apiRequest(`/api/staff-pin/users/${userId}`, {
    method: "DELETE",
    token,
  });
}

export async function unlockStaffPin(token: string, userId: number): Promise<void> {
  await apiRequest(`/api/staff-pin/users/${userId}/unlock`, {
    method: "POST",
    token,
  });
}

/** Shared terminals still in use — revoked ones are dropped (see activeTerminals). */
export async function fetchStaffTerminals(token: string): Promise<StaffTerminal[]> {
  const res = await apiRequest<ListResponse<StaffTerminal>>(
    "/api/staff-terminals",
    { token },
  );
  return activeTerminals(res?.data ?? []);
}

export async function updateStaffTerminal(
  token: string,
  id: number,
  changes: StaffTerminalChanges,
): Promise<void> {
  await apiRequest(`/api/staff-terminals/${id}`, {
    method: "PATCH",
    token,
    body: changes,
  });
}

export async function revokeStaffTerminal(token: string, id: number): Promise<void> {
  await apiRequest(`/api/staff-terminals/${id}`, {
    method: "DELETE",
    token,
  });
}
