import { apiRequest } from "../lib/api";

export type ScheduleClosedRange = {
  start_minutes: number;
  end_minutes: number;
  reason: string | null;
};

export type ScheduleRoomWindow = {
  room_id: number;
  location_id: number;
  /** The room's own turnaround/interval — a deliberate 0 means no gap. */
  interval_minutes?: number | null;
  open_minutes: number | null;
  close_minutes: number | null;
  closed_all_day: boolean;
  closed_ranges?: ScheduleClosedRange[];
  bookable?: boolean;
  reason: string | null;
};

export type SchedulePackageWindow = {
  package_id: number;
  name: string;
  location_id: number;
  open_minutes: number;
  close_minutes: number;
  interval_minutes: number;
  /** How long a booking of this package actually runs — used to check whether
   *  it fits in a free stretch before offering it for a walk-in. */
  duration_minutes?: number;
  /** Real start times the booking page will accept — snapping a click to one
   *  of these (rather than raw interval arithmetic) is what keeps the two in
   *  sync when duration+cleanup isn't a whole number of intervals. */
  start_minutes?: number[];
  /** Offered starts already in the past today — shown, but never snapped to. */
  past_start_minutes?: number[];
  closed_ranges?: ScheduleClosedRange[];
  room_ids: number[];
};

export type ScheduleDayWindow = {
  date: string;
  weekday: string;
  location_id: number | null;
  open_minutes: number;
  close_minutes: number;
  interval_minutes: number;
  has_schedule: boolean;
  location_closed: boolean;
  rooms: ScheduleRoomWindow[];
  packages: SchedulePackageWindow[];
};

export async function fetchScheduleDayWindow({
  token,
  date,
  locationId,
  signal,
}: {
  token: string;
  date: string;
  locationId?: number | null;
  signal?: AbortSignal;
}): Promise<ScheduleDayWindow | null> {
  const params = new URLSearchParams({ date });
  if (locationId != null) params.append("location_id", String(locationId));
  const res = await apiRequest<{ data?: ScheduleDayWindow }>(
    `/api/schedule/day-window?${params.toString()}`,
    { token, signal },
  );
  const data = res?.data;
  if (!data || typeof data.open_minutes !== "number") return null;
  return data;
}
