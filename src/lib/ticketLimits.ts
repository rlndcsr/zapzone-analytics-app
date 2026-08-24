import type { SlotAvailability } from "../services/attractionsService";

export type SlotRemainingMap = Record<string, number>;

const CAP_KEY = "__cap";

export function buildSlotRemainingMap(
  availability: SlotAvailability,
): SlotRemainingMap | null {
  if (availability.maxTicketsPerSlot == null) return null;
  return {
    [CAP_KEY]: availability.maxTicketsPerSlot,
    ...(availability.remainingBySlot ?? {}),
  };
}

export function remainingForSlot(
  map: SlotRemainingMap | null | undefined,
  time: string | null | undefined,
): number | null {
  if (!map || !time) return null;
  const key = time.substring(0, 5);
  return map[key] ?? map[CAP_KEY] ?? null;
}

export function quantityCeiling(
  left: number | null | undefined,
  fallback: number,
): number {
  if (left == null) return fallback;
  return Math.min(fallback, Math.max(1, left));
}

export function clampToRemaining(
  quantity: number,
  left: number | null | undefined,
): number {
  if (left == null) return quantity;
  return Math.min(quantity, Math.max(1, left));
}

export function isLowRemaining(left: number): boolean {
  return left <= 3;
}
