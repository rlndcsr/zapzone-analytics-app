import { useCallback, useEffect, useRef, useState } from "react";

import { getActiveLocationId } from "../location/activeLocationStore";
import { getToken } from "../../lib/session";
import {
  searchAttractionPurchases,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import {
  searchBookings,
  type CalendarBooking,
} from "../../services/bookingsService";
import {
  searchEventPurchases,
  type EventPurchaseRow,
} from "../../services/eventPurchasesService";
import {
  listTicketOrders,
  type TicketOrderDetail,
} from "../../services/ticketOrdersService";
import { fetchWaivers, type Waiver } from "../../services/waiversService";

/** Shortest term the desk will search on, matching the web's guard. */
export const MIN_GUEST_QUERY = 2;

/** One page of everything a guest's name, phone or email turned up. */
export type GuestResults = {
  bookings: CalendarBooking[];
  waivers: Waiver[];
  tickets: PurchaseRow[];
  orders: TicketOrderDetail[];
  events: EventPurchaseRow[];
};

const EMPTY: GuestResults = {
  bookings: [],
  waivers: [],
  tickets: [],
  orders: [],
  events: [],
};

export function guestResultCount(r: GuestResults): number {
  return (
    r.bookings.length +
    r.waivers.length +
    r.tickets.length +
    r.orders.length +
    r.events.length
  );
}

export type UseGuestLookup = {
  results: GuestResults;
  searching: boolean;
  /** True once a search has run, so "no matches" can be told from "not yet". */
  searched: boolean;
  /** Set when the term was too short to search on. */
  hint: string | null;
  search: (term: string) => Promise<void>;
  clear: () => void;
};

const PER_SOURCE = 25;

/**
 * The "No ticket or QR? Find the guest" lookup behind the unified check-in
 * desk — the web's `runGuestSearch`, one page from each source.
 *
 * Every source is settled independently: a desk that can still find the guest's
 * booking is more useful than one that shows nothing because the waiver index
 * happened to fail, so a rejected source contributes an empty list rather than
 * failing the search.
 */
export function useGuestLookup(): UseGuestLookup {
  const [results, setResults] = useState<GuestResults>(EMPTY);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const search = useCallback(async (raw: string) => {
    const term = raw.trim();
    if (term.length < MIN_GUEST_QUERY) {
      setHint(`Type at least ${MIN_GUEST_QUERY} characters to search.`);
      return;
    }

    const token = getToken();
    if (!token) {
      setHint("Your session has expired. Please sign in again.");
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setHint(null);
    setSearching(true);
    setSearched(true);

    const locationId = getActiveLocationId();

    const [bookings, waivers, tickets, orders, events] = await Promise.allSettled([
      searchBookings({ token, term, locationId, limit: PER_SOURCE, signal }),
      // `all: true` drops the date scope — the guest in front of you may be
      // here on a waiver signed weeks ago.
      fetchWaivers(token, { search: term, all: true }, 1, PER_SOURCE, signal),
      searchAttractionPurchases({ token, term, limit: PER_SOURCE, signal }),
      listTicketOrders(
        token,
        { locationId, perPage: PER_SOURCE, search: term },
        signal,
      ),
      searchEventPurchases({ token, term, limit: PER_SOURCE, signal }),
    ]);

    if (signal.aborted || !mountedRef.current) return;

    setResults({
      bookings: bookings.status === "fulfilled" ? bookings.value : [],
      waivers: waivers.status === "fulfilled" ? waivers.value.waivers : [],
      tickets: tickets.status === "fulfilled" ? tickets.value : [],
      orders: orders.status === "fulfilled" ? orders.value : [],
      events: events.status === "fulfilled" ? events.value : [],
    });
    setSearching(false);
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setResults(EMPTY);
    setSearched(false);
    setSearching(false);
    setHint(null);
  }, []);

  return { results, searching, searched, hint, search, clear };
}
