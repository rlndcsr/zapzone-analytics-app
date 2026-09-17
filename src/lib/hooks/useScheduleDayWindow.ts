import { useEffect, useState } from "react";

import {
  fetchScheduleDayWindow,
  type ScheduleDayWindow,
} from "../../services/scheduleWindowService";
import { getToken } from "../session";

/** `date` may be null for a screen that only needs the window some of the time
 *  (the Calendar tab's Day view) — nothing is fetched until it has one. */
export function useScheduleDayWindow(
  date: string | null,
  locationId?: number | null,
) {
  const [dayWindow, setDayWindow] = useState<ScheduleDayWindow | null>(null);
  const [windowLoading, setWindowLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!date) {
      setDayWindow(null);
      setWindowLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setDayWindow(null);
      setWindowLoading(false);
      return;
    }
    setWindowLoading(true);
    const controller = new AbortController();
    fetchScheduleDayWindow({
      token,
      date,
      locationId,
      signal: controller.signal,
    })
      .then((result) => {
        if (!cancelled) setDayWindow(result);
      })
      .catch(() => {
        if (!cancelled) setDayWindow(null);
      })
      .finally(() => {
        if (!cancelled) setWindowLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [date, locationId]);

  return { dayWindow, windowLoading };
}
