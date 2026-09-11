export type MembershipChargeGateInput = {
  chargeRequested: boolean;
  hasGateway: boolean;
  gatewayRequestSignature: string;
  currentRequestSignature: string;
  cardNumberValid: boolean;
  cardMonth: string;
  cardYear: string;
  cardCvv: string;
};

export function isMembershipChargeReady(
  input: MembershipChargeGateInput,
): boolean {
  if (!input.chargeRequested) return true;
  if (!input.hasGateway) return false;
  if (
    !input.gatewayRequestSignature ||
    input.gatewayRequestSignature !== input.currentRequestSignature
  ) {
    return false;
  }
  if (!input.cardNumberValid) return false;
  return !!(input.cardMonth && input.cardYear && input.cardCvv);
}
