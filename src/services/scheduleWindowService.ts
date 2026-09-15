import { apiRequest } from "../lib/api";

export type ScheduleClosedRange = {
  start_minutes: number;
  end_minutes: number;
  reason: string | null;
};

export type ScheduleRoomWindow = {
  room_id: number;
  location_id: number;
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
