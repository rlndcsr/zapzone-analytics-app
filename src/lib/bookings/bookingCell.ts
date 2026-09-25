import type { PaymentStateView } from "../payments/paymentState.ts";

// What a schedule booking block carries, and how tall it has to be to carry it. Shared by the
// Calendar day grid and the Space Schedule so the two cells never disagree on either.

/** Line height of a block's small lines (time, package, head count, extras) — 10px text. */
export const SMALL_LINE_HEIGHT = 13;
/** Line height of the guest's name — 12px text. */
export const NAME_LINE_HEIGHT = 16;
/** Vertical padding inside a block, each side. */
export const CELL_PADDING_Y = 4;

/** The four always-on lines — time, guest, package, head count and balance — plus padding. */
export const BASE_CONTENT_HEIGHT =
  3 * SMALL_LINE_HEIGHT + NAME_LINE_HEIGHT + 2 * CELL_PADDING_Y;
/** A further line of detail: a clash, a note, the birthday child, the reference. */
export const EXTRA_LINE_HEIGHT = SMALL_LINE_HEIGHT;
/** Below this a block cannot hold two lines, so it shows only when and who. */
export const SLIVER_HEIGHT = SMALL_LINE_HEIGHT + NAME_LINE_HEIGHT + 2 * CELL_PADDING_Y;
/** The clash, the staff note and the guest note are guaranteed a line however short the booking. */
export const MAX_GUARANTEED_EXTRAS = 3;
/** Past this much of a booking with nobody checked in, the desk needs telling. */
export const LATE_AFTER_MINUTES = 10;

/** How many of the guaranteed extra lines this booking earns. */
export function guaranteedExtraLines({
  clashing,
  staffNote,
  guestNote,
}: {
  clashing: boolean;
  staffNote: string;
  guestNote: string;
}): number {
  return Number(clashing) + Number(!!staffNote) + Number(!!guestNote);
}

/** How tall a booking's minutes must be drawn: the four-line floor, its extras, and the block's own gap. */
export function cellSpanHeight(extraLines: number, inset: number): number {
  const lines = Math.min(Math.max(0, extraLines), MAX_GUARANTEED_EXTRAS);
  return BASE_CONTENT_HEIGHT + lines * EXTRA_LINE_HEIGHT + inset;
}

/** How many extra lines a block of this height has room for. */
export function extraLineRoom(blockHeight: number): number {
  // the scale is floating point, so a block sized for exactly n lines can land a hair short
  return Math.max(
    0,
    Math.floor((blockHeight - BASE_CONTENT_HEIGHT) / EXTRA_LINE_HEIGHT + 1e-6),
  );
}

/** "10:00–11:30 AM" when both ends share a meridiem, so the head count and balance fit beside it. */
export function compactTimeRange(from: string, to: string): string {
  return from.slice(-2) === to.slice(-2)
    ? `${from.slice(0, -3)}–${to}`
    : `${from}–${to}`;
}

export type BalanceTone = "terminal" | "owed" | "paid";

/** What is still owed — never the booking's total. */
export function balanceSummary(payment: PaymentStateView): {
  text: string;
  tone: BalanceTone;
} {
  if (payment.isTerminal) return { text: payment.label, tone: "terminal" };
  if (payment.balance > 0) {
    return { text: `$${payment.balance.toFixed(2)} due`, tone: "owed" };
  }
  return { text: "Paid", tone: "paid" };
}

/**
 * A day-grid block's colours, from the same tone as its balance line: green
 * when nothing is owed, yellow while money is still due, grey once refunded or
 * voided. `bar` is the thick left edge; `bg` fills the block; `text` is the
 * small print on it.
 */
export const BALANCE_CELL_COLORS: Record<
  BalanceTone,
  { bg: string; bar: string; text: string }
> = {
  paid: { bg: "#DCFCE7", bar: "#22C55E", text: "#166534" }, // green-100 / 500 / 800
  owed: { bg: "#FEF9C3", bar: "#EAB308", text: "#854D0E" }, // yellow-100 / 500 / 800
  terminal: { bg: "#F3F4F6", bar: "#9CA3AF", text: "#374151" }, // gray-100 / 400 / 700
};

/** The party against the space's limit, when the space has one. */
export function headCount(
  participants: number,
  capacity: number | null | undefined,
): { text: string; overCapacity: boolean } {
  return {
    text: `${participants}${capacity ? `/${capacity}` : ""} pax`,
    overCapacity: capacity != null && Number(participants) > capacity,
  };
}

export function hasArrived(status: string): boolean {
  return status === "checked-in" || status === "completed";
}

/** "late": should be in the room and nobody has checked in. "in": running and checked in. */
export function arrivalFlag({
  status,
  isToday,
  nowMinutes,
  startMin,
  endMin,
}: {
  status: string;
  isToday: boolean;
  nowMinutes: number;
  startMin: number;
  endMin: number;
}): "late" | "in" | null {
  if (!isToday) return null;
  const arrived = hasArrived(status);
  const settled = arrived || status === "cancelled";
  if (
    !settled &&
    nowMinutes >= startMin + LATE_AFTER_MINUTES &&
    nowMinutes < endMin + LATE_AFTER_MINUTES
  ) {
    return "late";
  }
  return arrived && nowMinutes >= startMin && nowMinutes < endMin ? "in" : null;
}

/** "Sam at 3:00 PM (15 min over), Lee at 4:00 PM (no gap between them)". */
export function describeClashes(
  clashes: readonly { name: string; startLabel: string; overlapMinutes: number }[],
): string {
  return clashes
    .map(
      (clash) =>
        `${clash.name} at ${clash.startLabel}` +
        (clash.overlapMinutes > 0
          ? ` (${clash.overlapMinutes} min over)`
          : " (no gap between them)"),
    )
    .join(", ");
}

/**
 * What an open booking runs into, for reading rather than hovering: "Overlaps" when any clash
 * really double-books the space, otherwise "No turnaround". Null when it clashes with nothing.
 */
export function clashSummary(
  clashes: readonly { name: string; startLabel: string; overlapMinutes: number }[],
): { heading: "Overlaps" | "No turnaround"; doubleBooked: boolean; text: string } | null {
  if (clashes.length === 0) return null;
  const doubleBooked = clashes.some((clash) => clash.overlapMinutes > 0);
  return {
    heading: doubleBooked ? "Overlaps" : "No turnaround",
    doubleBooked,
    text: describeClashes(clashes),
  };
}

export type CellExtraTone = "overlap" | "gap" | "staff" | "guest" | "honoree" | "muted";

export type CellExtra = { key: string; tone: CellExtraTone; text: string };

export const EXTRA_TONE_CLASS: Record<CellExtraTone, string> = {
  overlap: "text-rose-700",
  gap: "text-amber-700",
  staff: "text-amber-800",
  guest: "text-blue-800",
  honoree: "text-pink-700",
  muted: "text-gray-500",
};

export const BALANCE_TONE_CLASS: Record<BalanceTone, string> = {
  terminal: "text-slate-500",
  owed: "text-red-600",
  paid: "text-green-600",
};

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The extra lines, in the order they earn their space; the block shows as many as it can hold. */
export function cellExtras({
  clash,
  staffNote,
  guestNote,
  honoreeName,
  honoreeAge,
  referenceNumber,
}: {
  clash: { doubleBooked: boolean; label: string } | null;
  staffNote: string;
  guestNote: string;
  honoreeName?: string | null;
  honoreeAge?: number | null;
  referenceNumber?: string | null;
}): CellExtra[] {
  const extras: CellExtra[] = [];
  if (clash) {
    extras.push({
      key: "clash",
      tone: clash.doubleBooked ? "overlap" : "gap",
      text: `${clash.doubleBooked ? "Overlaps" : "No gap"} ${clash.label}`,
    });
  }
  if (staffNote) extras.push({ key: "staff", tone: "staff", text: `Staff: ${oneLine(staffNote)}` });
  if (guestNote) extras.push({ key: "guest", tone: "guest", text: `Guest: ${oneLine(guestNote)}` });
  const honoree = (honoreeName ?? "").trim();
  if (honoree) {
    extras.push({
      key: "honoree",
      tone: "honoree",
      text: `Birthday: ${honoree}${honoreeAge ? `, ${honoreeAge}` : ""}`,
    });
  }
  if (referenceNumber) {
    extras.push({ key: "ref", tone: "muted", text: `#${referenceNumber.slice(-6)}` });
  }
  return extras;
}
