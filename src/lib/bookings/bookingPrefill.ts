export const CREATE_BOOKING_PATH = "/bookings/create-booking";

export type SlotPrefill = {
  locationId?: number | null;
  date: string;
  minute: number;
  roomId?: number | null;
  packageId?: number | null;
  packageIds?: number[];
  /** How long the space stays free from `minute` — lets the form check a
   *  walk-in package actually fits before offering it. */
  freeUntilMinute?: number | null;
  /** The next booking's own start, never reduced by turnaround — an overlap
   *  warning is measured against this, not against the reset buffer. */
  nextBookingMinute?: number | null;
  walkIn?: boolean;
  /** Staff saw the overlap warning and chose to start anyway. */
  walkInOverride?: boolean;
};

export type BookingPrefill = {
  locationId: number | null;
  date: string | null;
  time: string | null;
  roomId: number | null;
  packageId: number | null;
  packageIds: number[];
  freeUntilMinutes: number | null;
  freeUntilKnown: boolean;
  nextBookingMinutes: number | null;
  startMinutes: number | null;
  walkIn: boolean;
  walkInOverride: boolean;
  hasAny: boolean;
};

export function minutesToClock(minute: number): string {
  if (!Number.isFinite(minute)) return "00:00";
  const wrapped = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function clockToMinutes(clock?: string | null): number | null {
  if (!clock) return null;
  const [h, m] = String(clock).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const minute = h * 60 + m;
  return minute >= 0 && minute < 1440 ? minute : null;
}

export function buildBookingParams(
  prefill: SlotPrefill,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (prefill.locationId != null)
    params.location_id = String(prefill.locationId);
  if (prefill.date) params.date = prefill.date;
  if (Number.isFinite(prefill.minute)) {
    params.time = minutesToClock(prefill.minute);
    params.start_minutes = String(Math.round(prefill.minute));
  }
  if (prefill.roomId != null) params.room_id = String(prefill.roomId);
  if (prefill.packageId != null) params.package_id = String(prefill.packageId);

  const candidates = (prefill.packageIds ?? []).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (candidates.length > 0)
    params.package_ids = Array.from(new Set(candidates)).join(",");

  if (
    prefill.freeUntilMinute != null &&
    Number.isFinite(prefill.freeUntilMinute)
  ) {
    params.free_until_minutes = String(Math.round(prefill.freeUntilMinute));
  }
  if (
    prefill.nextBookingMinute != null &&
    Number.isFinite(prefill.nextBookingMinute)
  ) {
    params.next_booking_minutes = String(Math.round(prefill.nextBookingMinute));
  }
  if (prefill.walkIn) params.walk_in = "1";
  if (prefill.walkInOverride) params.walk_in_override = "1";

  return params;
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const toId = (value: string | string[] | undefined): number | null => {
  const raw = first(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toIdList = (value: string | string[] | undefined): number[] => {
  const raw = first(value);
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
};

const toDate = (value: string | string[] | undefined): string | null => {
  const raw = first(value);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

/**
 * Whether the server's own availability list already offers this exact room
 * at this exact time. Availability is per package, not per space — a minute
 * offered because some OTHER room is free must not read as "this room too".
 */
export function slotsOfferRoom<T extends { startTime: string; roomId: number | null }>(
  slots: T[],
  time: string,
  roomId: number | null,
): boolean {
  return slots.some(
    (s) => s.startTime === time && (roomId == null || s.roomId === roomId),
  );
}

/**
 * True once some OTHER room already has this exact start officially listed
 * but the one picked does not — the selected space is already taken then.
 */
export function isRoomTakenAtTime<
  T extends { startTime: string; roomId: number | null },
>(slots: T[], time: string, roomId: number | null): boolean {
  return (
    roomId != null &&
    slots.some((s) => s.startTime === time) &&
    !slotsOfferRoom(slots, time, roomId)
  );
}

export function resolveClickedSlot<
  T extends { startTime: string; roomId: number | null },
>(
  slots: T[],
  time: string | null,
  roomId: number | null,
): { slot: T | null; roomChanged: boolean } {
  const clickedRoomSlot =
    time != null && roomId != null
      ? (slots.find((s) => s.startTime === time && s.roomId === roomId) ?? null)
      : null;

  const fallback =
    time != null
      ? (slots.find((s) => s.startTime === time) ?? null)
      : roomId != null
        ? (slots.find((s) => s.roomId === roomId) ?? null)
        : null;

  const slot = clickedRoomSlot ?? fallback;
  return {
    slot,
    roomChanged: slot != null && roomId != null && slot.roomId !== roomId,
  };
}

export function readBookingPrefill(params: RawParams): BookingPrefill {
  const minute = clockToMinutes(first(params.time));
  const freeUntilRaw = first(params.free_until_minutes);
  const freeUntilParsed = freeUntilRaw === null ? NaN : Number(freeUntilRaw);
  const freeUntilMinutes =
    Number.isFinite(freeUntilParsed) && freeUntilParsed >= 0
      ? Math.round(freeUntilParsed)
      : null;
  const prefill: BookingPrefill = {
    locationId: toId(params.location_id),
    date: toDate(params.date),
    time: minute === null ? null : minutesToClock(minute),
    roomId: toId(params.room_id),
    packageId: toId(params.package_id),
    packageIds: toIdList(params.package_ids),
    freeUntilMinutes,
    freeUntilKnown: freeUntilMinutes !== null,
    nextBookingMinutes: (() => {
      const raw = first(params.next_booking_minutes);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    })(),
    startMinutes: (() => {
      const raw = first(params.start_minutes);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : minute;
    })(),
    walkIn: first(params.walk_in) === "1",
    walkInOverride: first(params.walk_in_override) === "1",
    hasAny: false,
  };

  prefill.hasAny =
    prefill.locationId !== null ||
    prefill.date !== null ||
    prefill.time !== null ||
    prefill.roomId !== null ||
    prefill.packageId !== null ||
    prefill.packageIds.length > 0;

  return prefill;
}
