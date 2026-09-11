export type PackagePriceInput = {
  pricingType?: string | null;
  price: number | string | null | undefined;
  minParticipants?: number | null;
  pricePerAdditional?: number | string | null;
  participants: number;
};

export function packagePriceForParticipants(input: PackagePriceInput): number {
  const price = Number(input.price ?? 0);
  const participants = Math.max(1, Number(input.participants) || 1);

  if (input.pricingType === "per_person") {
    return price * participants;
  }

  const minParticipants = Number(input.minParticipants ?? 0) || 1;
  const pricePerAdditional = Number(input.pricePerAdditional ?? 0);
  const additional = Math.max(0, participants - minParticipants);

  return price + additional * pricePerAdditional;
}

export function participantLabelFor(label?: string | null): string {
  const trimmed = (label || "").trim();
  return trimmed === "" ? "player" : trimmed.toLowerCase();
}
