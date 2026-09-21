import { apiRequest } from "../lib/api";

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
