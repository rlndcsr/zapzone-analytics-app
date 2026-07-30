import { useEffect, useMemo, useState } from "react";

import { getCurrentUser, getToken } from "../session";
import { timeToMinutes } from "../time";
import {
  fetchAttractionPurchases,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import {
  fetchEventPurchases,
  type EventPurchaseRow,
} from "../../services/eventPurchasesService";

/*
 * The non-booking activity the Booking Calendar overlays on each day — the
 * mobile port of the web's `useScheduledExtras`: attraction tickets (summed by
 * quantity, keyed by scheduled date falling back to purchase date) and event
 * registrations (counted, keyed by purchase date).
 *
 * Both legs are fetched for the VISIBLE WINDOW only, exactly like the web —
 * attractions via `scheduled_from`/`scheduled_to` (the backend filters on
 * COALESCE(scheduled_date, purchase_date), matching the bucketing below), events
 * via `start_date`/`end_date`. Paging the entire purchase history instead cost
 * dozens of requests per mount and timed the API out. A failure on either leg is
 * swallowed — the calendar still renders its bookings.
 */

/** Inclusive visible window, both ends YYYY-MM-DD. */
export type ScheduledRange = { from: string; to: string };

/** Per-day counts for one date key (YYYY-MM-DD), plus the rows behind them. */
export type DayExtras = {
  attractionTickets: number;
  eventRegistrations: number;
  /** The purchases scheduled that day, for the day-detail list. */
  attractionPurchases: PurchaseRow[];
  /** The registrations on that day, for the day-detail list. */
  eventPurchases: EventPurchaseRow[];
};

const dayKey = (raw: string | null | undefined): string | null =>
  raw ? raw.substring(0, 10) : null;

export function useScheduledExtras(
  range: ScheduledRange | null,
  locationId?: number | null,
) {
  const [byDate, setByDate] = useState<Record<string, DayExtras>>({});
  const user = useMemo(() => getCurrentUser(), []);

  const from = range?.from;
  const to = range?.to;

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id || !from || !to) return;
    const controller = new AbortController();
    let active = true;

    (async () => {
      const [attractions, events] = await Promise.all([
        fetchAttractionPurchases({
          token,
          userId: user.id,
          locationId: locationId ?? undefined,
          scheduledFrom: from,
          scheduledTo: to,
          signal: controller.signal,
        }).catch(() => []),
        fetchEventPurchases({
          token,
          userId: user.id,
          locationId: locationId ?? undefined,
          startDate: from,
          endDate: to,
          signal: controller.signal,
        }).catch(() => []),
      ]);
      if (!active) return;

      const map: Record<string, DayExtras> = {};
      const bucket = (key: string) =>
        (map[key] ??= {
          attractionTickets: 0,
          eventRegistrations: 0,
          attractionPurchases: [],
          eventPurchases: [],
        });

      for (const p of attractions) {
        const key = dayKey(p.scheduledDate) ?? dayKey(p.purchaseDate);
        if (!key) continue;
        const day = bucket(key);
        day.attractionTickets += p.quantity || 0;
        day.attractionPurchases.push(p);
      }
      for (const e of events) {
        const key = dayKey(e.purchaseDate);
        if (!key) continue;
        const day = bucket(key);
        day.eventRegistrations += 1;
        day.eventPurchases.push(e);
      }

      // Each day ordered by time ascending, untimed last — as the web's
      // attractionsForDate / eventsForDate selectors sort them.
      for (const day of Object.values(map)) {
        day.attractionPurchases.sort(
          (a, b) => timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime),
        );
        day.eventPurchases.sort(
          (a, b) => timeToMinutes(a.purchaseTime) - timeToMinutes(b.purchaseTime),
        );
      }
      setByDate(map);
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [from, to, locationId, user?.id]);

  return byDate;
}
