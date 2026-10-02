type SessionConsent = {
  guestName: string;
  guestPhone: string;
  guestSmsConsent: boolean;
};

export const smsConsentLabel = (session: SessionConsent): string => {
  if (!(session.guestName || session.guestPhone)) return "";
  return session.guestSmsConsent ? "Opted In" : "No";
};

export const smsOptInLine = (detail: {
  smsConsent: boolean;
  smsConsentLabel: string;
}): string | null =>
  detail.smsConsent
    ? `SMS opted in${detail.smsConsentLabel ? ` · ${detail.smsConsentLabel} ET` : ""}`
    : null;
