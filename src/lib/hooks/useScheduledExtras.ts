import { useEffect, useMemo, useState } from "react";

import { getCurrentUser, getToken } from "../session";
import {
  fetchAttractionPurchases,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import { fetchEventPurchases } from "../../services/eventPurchasesService";

/*
 * The non-booking activity the Booking Calendar overlays on each day — the
 * mobile port of the web's `useScheduledExtras`: attraction tickets (summed by
 * quantity, keyed by scheduled date falling back to purchase date) and event
 * registrations (counted, keyed by purchase date).
 *
 * Both mobile services page the full list rather than accepting a date range,
 * so we fetch once and bucket by day here; the calendar then reads whichever
 * window it is showing. A failure on either leg is swallowed — the calendar
 * still renders its bookings.
 */

/** Per-day counts for one date key (YYYY-MM-DD), plus the rows behind them. */
export type DayExtras = {
  attractionTickets: number;
  eventRegistrations: number;
  /** The purchases scheduled that day, for the day-detail list. */
  attractionPurchases: PurchaseRow[];
};

const dayKey = (raw: string | null | undefined): string | null =>
  raw ? raw.substring(0, 10) : null;

export function useScheduledExtras(locationId?: number | null) {
  const [byDate, setByDate] = useState<Record<string, DayExtras>>({});
  const user = useMemo(() => getCurrentUser(), []);

  useEffect(() => {
    const token = getToken();
    if (!token || !user?.id) return;
    const controller = new AbortController();
    let active = true;

    (async () => {
      const [attractions, events] = await Promise.all([
        fetchAttractionPurchases({
          token,
          userId: user.id,
          locationId: locationId ?? undefined,
          signal: controller.signal,
        }).catch(() => []),
        fetchEventPurchases({
          token,
          userId: user.id,
          locationId: locationId ?? undefined,
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
        if (key) bucket(key).eventRegistrations += 1;
      }
      setByDate(map);
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [locationId, user?.id]);

  return byDate;
}
