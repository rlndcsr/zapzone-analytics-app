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
  walkIn?: boolean;
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
  walkIn: boolean;
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
  if (Number.isFinite(prefill.minute))
    params.time = minutesToClock(prefill.minute);
  if (prefill.roomId != null) params.room_id = String(prefill.roomId);
  if (prefill.packageId != null) params.package_id = String(prefill.packageId);

  const candidates = (prefill.packageIds ?? []).filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (candidates.length > 1)
    params.package_ids = Array.from(new Set(candidates)).join(",");

  if (prefill.freeUntilMinute != null && Number.isFinite(prefill.freeUntilMinute)) {
    params.free_until_minutes = String(Math.round(prefill.freeUntilMinute));
  }
  if (prefill.walkIn) params.walk_in = "1";

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
    walkIn: first(params.walk_in) === "1",
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
