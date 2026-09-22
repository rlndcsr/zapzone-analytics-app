import { apiRequest } from "../lib/api";

export type OverridePinStatus = {
  canHoldPin: boolean;
  hasPin: boolean;
  setAt: string | null;
};

type OverridePinStatusResponse = {
  success?: boolean;
  data?: {
    can_hold_pin: boolean;
    has_pin: boolean;
    set_at: string | null;
  } | null;
};

export async function getOverridePinStatus(
  token: string,
): Promise<OverridePinStatus> {
  const res = await apiRequest<OverridePinStatusResponse>("/api/override-pin", {
    token,
  });
  const data = res?.data;
  return {
    canHoldPin: data?.can_hold_pin ?? false,
    hasPin: data?.has_pin ?? false,
    setAt: data?.set_at ?? null,
  };
}

export async function setOverridePin(
  token: string,
  pin: string,
  currentPassword: string,
): Promise<void> {
  await apiRequest<{ success?: boolean; message?: string }>(
    "/api/override-pin",
    {
      method: "POST",
      token,
      body: { pin, current_password: currentPassword },
    },
  );
}

export type OverrideApproval = {
  token: string;
  approvedBy: string;
  expiresIn: number;
};

type OverrideApprovalResponse = {
  success?: boolean;
  message?: string;
  data?: {
    token: string;
    approved_by: string;
    expires_in: number;
  } | null;
};
export async function verifyOverridePin(
  token: string,
  pin: string,
  locationId: number,
  reason?: string,
): Promise<OverrideApproval> {
  const res = await apiRequest<OverrideApprovalResponse>(
    "/api/override-pin/verify",
    {
      method: "POST",
      token,
      body: { pin, location_id: locationId, reason },
    },
  );
  const data = res?.data;
  if (!data) throw new Error("That PIN could not be checked. Try again.");
  return {
    token: data.token,
    approvedBy: data.approved_by,
    expiresIn: data.expires_in,
  };
}
