export const CAMPAIGN_REFUSED_FALLBACK =
  "Resend refused this campaign, so it was not sent. Open the campaign to see who it did not reach, then use Resend to Failed Recipients.";

export type CampaignSendOutcome =
  | { kind: "refused"; message: string }
  | { kind: "sending"; message: string }
  | { kind: "done"; message: string | null };

export function campaignSendOutcome(
  status: unknown,
  message: unknown,
): CampaignSendOutcome {
  const text = typeof message === "string" ? message.trim() : "";
  if (status === "failed")
    return { kind: "refused", message: text || CAMPAIGN_REFUSED_FALLBACK };
  if (status === "sending" && text) return { kind: "sending", message: text };
  return { kind: "done", message: text || null };
}
