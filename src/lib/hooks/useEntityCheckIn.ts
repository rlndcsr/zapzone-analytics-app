import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../lib/api";
import { getActiveLocationId } from "../location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  checkInAttractionPurchase,
  verifyAttractionPurchase,
  type PurchaseRow,
} from "../../services/attractionPurchasesService";
import {
  updateEventPurchaseStatus,
  verifyEventPurchaseByReference,
  type ScannedEventTicket,
} from "../../services/eventPurchasesService";
import {
  checkInMembership,
  scanMembership,
  type ScanResult as MembershipScan,
} from "../../services/membershipsService";
import {
  checkInTicketOrder,
  fetchTicketOrder,
  type TicketOrderDetail,
} from "../../services/ticketOrdersService";
import {
  checkInWaiver as checkInWaiverApi,
  fetchEntityWaivers,
  scanWaiver,
  type EntityWaivers,
  type ScannedWaiver,
} from "../../services/waiversService";
import type { ResultTone } from "../checkin/checkInPhase";
import type { ScannedCode } from "../checkin/resolveScannedCode";
import { KIND_LABELS } from "../checkin/resolveScannedCode";

/**
 * What the desk is showing for a non-booking code.
 *
 * Bookings are deliberately absent: they keep their own flow (payments, the
 * verify surface, connected waivers) in `useBookingCheckIn`, which this hook
 * sits beside rather than duplicates.
 */
export type EntitySurface =
  | { kind: "ticket"; purchase: PurchaseRow; waivers: EntityWaivers | null }
  | { kind: "order"; order: TicketOrderDetail }
  | { kind: "membership"; scan: MembershipScan }
  | { kind: "event"; ticket: ScannedEventTicket }
  | { kind: "waiver"; waiver: ScannedWaiver };

/** A short-lived message under the scanner — the mobile stand-in for a toast. */
export type EntityNotice = { tone: ResultTone; message: string };

export type UseEntityCheckIn = {
  /** The record on screen, or null when the desk is at rest. */
  surface: EntitySurface | null;
  /** A code is being resolved against the backend. */
  loading: boolean;
  /** A check-in is in flight for the surface on screen. */
  busy: boolean;
  /** Which order check-in is running: a line id, "all", or nothing. */
  orderBusy: number | "all" | null;
  notice: EntityNotice | null;
  /** Resolve a scanned non-booking code and open its surface. */
  open: (code: ScannedCode) => Promise<void>;
  /** Open a waiver by its reference (a guest-lookup row, not a scan). */
  openWaiverByReference: (reference: string) => Promise<void>;
  /** Open an attraction ticket by id (a guest-lookup row). */
  openTicketById: (purchaseId: number) => Promise<void>;
  /** Open a bulk order by id (a guest-lookup row). */
  openOrderById: (orderId: number) => Promise<void>;
  /** Open an event ticket by its reference (a guest-lookup row). */
  openEventByReference: (reference: string) => Promise<void>;
  /** Admit whatever is on screen. Orders take the lines to admit. */
  confirm: (lineIds?: number[]) => Promise<void>;
  /** Mark the participant on a scanned waiver as checked in. */
  confirmWaiver: () => Promise<void>;
  /** Leave the surface, clearing any notice with it. */
  close: () => void;
  setNotice: (notice: EntityNotice | null) => void;
};

/** The location a member is being admitted at, as the web resolves it. */
function checkInLocationId(): number | undefined {
  return getActiveLocationId() ?? getCurrentUser()?.location_id ?? undefined;
}

/** Prefer the server's own words for a failure; otherwise say what we know. */
function reason(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

/**
 * Owns the non-booking half of the unified Check-In / Waivers desk: attraction
 * tickets, bulk orders, memberships, event tickets and waiver codes.
 *
 * Each kind resolves through the same endpoint its dedicated web handler uses
 * (`CheckIn.tsx`), so a code admitted here is admitted the same way it would be
 * at the web desk — no mobile-only rules, and no second source of truth.
 */
export function useEntityCheckIn(): UseEntityCheckIn {
  const [surface, setSurface] = useState<EntitySurface | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderBusy, setOrderBusy] = useState<number | "all" | null>(null);
  const [notice, setNotice] = useState<EntityNotice | null>(null);

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Fail the in-flight lookup with a message, leaving the desk at rest. */
  const fail = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setSurface(null);
    setNotice({ tone: "error", message });
  }, []);

  const withToken = useCallback(
    async (run: (token: string) => Promise<void>) => {
      const token = getToken();
      if (!token) {
        fail("Your session has expired. Please sign in again.");
        return;
      }
      await run(token);
    },
    [fail],
  );

  /* ------------------------------------------------------------ lookups -- */

  const openTicketById = useCallback(
    async (purchaseId: number) => {
      setLoading(true);
      setNotice(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        await withToken(async (token) => {
          const res = await verifyAttractionPurchase({
            token,
            purchaseId,
            userId: getCurrentUser()?.id,
            signal,
          });
          if (signal.aborted || !mountedRef.current) return;
          if (!res.success || !res.purchase) {
            fail(res.message || "Ticket not found.");
            return;
          }

          // Connected waivers are extra context, never a reason to refuse the
          // ticket — a failure here leaves the panel empty, not the desk stuck.
          let waivers: EntityWaivers | null = null;
          try {
            waivers = await fetchEntityWaivers(
              token,
              "attraction_purchase",
              res.purchase.id,
              signal,
            );
          } catch {
            waivers = null;
          }
          if (signal.aborted || !mountedRef.current) return;
          setSurface({ kind: "ticket", purchase: res.purchase, waivers });
        });
      } catch (err) {
        if (!signal.aborted) fail(reason(err, "Ticket not found."));
      } finally {
        if (mountedRef.current && !signal.aborted) setLoading(false);
      }
    },
    [fail, withToken],
  );

  const openOrderById = useCallback(
    async (orderId: number) => {
      setLoading(true);
      setNotice(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        await withToken(async (token) => {
          const order = await fetchTicketOrder(token, orderId, signal);
          if (signal.aborted || !mountedRef.current) return;
          setSurface({ kind: "order", order });
        });
      } catch (err) {
        if (!signal.aborted) fail(reason(err, "Order not found."));
      } finally {
        if (mountedRef.current && !signal.aborted) setLoading(false);
      }
    },
    [fail, withToken],
  );

  const openMembershipByToken = useCallback(
    async (qrToken: string) => {
      const locationId = checkInLocationId();
      if (locationId == null) {
        fail("Pick a location before checking members in.");
        return;
      }

      setLoading(true);
      setNotice(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        await withToken(async (token) => {
          const scan = await scanMembership(token, qrToken, locationId, signal);
          if (signal.aborted || !mountedRef.current) return;
          setSurface({ kind: "membership", scan });
        });
      } catch (err) {
        if (!signal.aborted) fail(reason(err, "Membership not found."));
      } finally {
        if (mountedRef.current && !signal.aborted) setLoading(false);
      }
    },
    [fail, withToken],
  );

  const openEventByReference = useCallback(
    async (reference: string) => {
      setLoading(true);
      setNotice(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        await withToken(async (token) => {
          const ticket = await verifyEventPurchaseByReference(
            token,
            reference,
            signal,
          );
          if (signal.aborted || !mountedRef.current) return;
          if (!ticket) {
            fail("No event ticket found for that code.");
            return;
          }
          setSurface({ kind: "event", ticket });
        });
      } catch (err) {
        if (!signal.aborted) {
          fail(reason(err, "No event ticket found for that code."));
        }
      } finally {
        if (mountedRef.current && !signal.aborted) setLoading(false);
      }
    },
    [fail, withToken],
  );

  const openWaiverByReference = useCallback(
    async (reference: string) => {
      setLoading(true);
      setNotice(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      try {
        await withToken(async (token) => {
          const waiver = await scanWaiver(token, reference, signal);
          if (signal.aborted || !mountedRef.current) return;
          if (!waiver) {
            fail("No waiver found for that code.");
            return;
          }
          setSurface({ kind: "waiver", waiver });
        });
      } catch (err) {
        if (!signal.aborted) fail(reason(err, "No waiver found for that code."));
      } finally {
        if (mountedRef.current && !signal.aborted) setLoading(false);
      }
    },
    [fail, withToken],
  );

  /**
   * Route a resolved code to its lookup. Kinds with no desk action of their own
   * (a photo delivery) are named in the refusal rather than silently ignored,
   * exactly as the web does.
   */
  const open = useCallback(
    async (code: ScannedCode) => {
      switch (code.kind) {
        case "attraction_purchase":
          if (code.id) return openTicketById(code.id);
          break;
        case "ticket_order":
          if (code.id) return openOrderById(code.id);
          break;
        case "membership":
          if (code.token) return openMembershipByToken(code.token);
          break;
        case "event_purchase":
          if (code.reference) return openEventByReference(code.reference);
          break;
        case "waiver":
          if (code.reference) return openWaiverByReference(code.reference);
          break;
        default:
          break;
      }

      fail(`${KIND_LABELS[code.kind]} codes can’t be checked in here yet.`);
    },
    [
      fail,
      openEventByReference,
      openMembershipByToken,
      openOrderById,
      openTicketById,
      openWaiverByReference,
    ],
  );

  /* ------------------------------------------------------------ check-in -- */

  const confirmWaiver = useCallback(async () => {
    if (surface?.kind !== "waiver" || busy) return;
    const { waiver } = surface;
    setBusy(true);
    try {
      await withToken(async (token) => {
        await checkInWaiverApi(token, waiver.id);
        if (!mountedRef.current) return;
        setSurface(null);
        setNotice({
          tone: "success",
          message: `${waiver.adultName} checked in.`,
        });
      });
    } catch (err) {
      if (mountedRef.current) {
        setNotice({
          tone: "error",
          message: reason(err, "Could not check in that waiver."),
        });
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [surface, busy, withToken]);

  const confirm = useCallback(
    async (lineIds?: number[]) => {
      if (!surface || busy) return;

      // An order reports per-line progress, so it tracks its own busy flag and
      // leaves `busy` (which disables the whole footer) alone.
      if (surface.kind === "order") {
        if (orderBusy != null) return;
        setOrderBusy(lineIds?.length === 1 ? lineIds[0] : "all");
        try {
          await withToken(async (token) => {
            const res = await checkInTicketOrder(token, surface.order.id, lineIds);
            if (!mountedRef.current) return;
            const skipped = res.skipped.length;
            setSurface(null);
            setNotice({
              tone: skipped > 0 ? "warning" : "success",
              message:
                `${res.checkedIn} ticket${res.checkedIn === 1 ? "" : "s"} checked in` +
                (skipped > 0 ? `, ${skipped} skipped` : "") +
                ".",
            });
          });
        } catch (err) {
          if (mountedRef.current) {
            setNotice({
              tone: "error",
              message: reason(err, "Could not check in that order."),
            });
          }
        } finally {
          if (mountedRef.current) setOrderBusy(null);
        }
        return;
      }

      if (surface.kind === "waiver") return confirmWaiver();

      setBusy(true);
      try {
        await withToken(async (token) => {
          if (surface.kind === "ticket") {
            const res = await checkInAttractionPurchase({
              token,
              purchaseId: surface.purchase.id,
              userId: getCurrentUser()?.id,
            });
            if (!mountedRef.current) return;
            if (!res.success) {
              setNotice({
                tone: "error",
                message: res.message || "Could not check in that ticket.",
              });
              return;
            }
            setSurface(null);
            setNotice({ tone: "success", message: "Ticket checked in." });
            return;
          }

          if (surface.kind === "membership") {
            const locationId = checkInLocationId();
            await checkInMembership(token, surface.scan.membershipId, {
              // An ineligible member admitted at the desk is an override, and
              // the server records it as one — same rule as the web.
              result: surface.scan.eligible ? "allowed" : "override",
              locationId,
              overrideNote: surface.scan.eligible
                ? undefined
                : "Manual override by staff",
            });
            if (!mountedRef.current) return;
            setSurface(null);
            setNotice({ tone: "success", message: "Member checked in." });
            return;
          }

          if (surface.kind === "event") {
            if (surface.ticket.ticketOrderId) {
              setNotice({
                tone: "error",
                message:
                  "This ticket belongs to a bulk order — scan the order instead.",
              });
              return;
            }
            await updateEventPurchaseStatus(token, surface.ticket.id, "checked-in");
            if (!mountedRef.current) return;
            setSurface(null);
            setNotice({ tone: "success", message: "Event ticket checked in." });
          }
        });
      } catch (err) {
        if (mountedRef.current) {
          setNotice({
            tone: "error",
            message: reason(err, "Could not complete that check-in."),
          });
        }
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [surface, busy, orderBusy, confirmWaiver, withToken],
  );

  const close = useCallback(() => {
    abortRef.current?.abort();
    setSurface(null);
    setNotice(null);
    setLoading(false);
  }, []);

  return {
    surface,
    loading,
    busy,
    orderBusy,
    notice,
    open,
    openWaiverByReference,
    openTicketById,
    openOrderById,
    openEventByReference,
    confirm,
    confirmWaiver,
    close,
    setNotice,
  };
}
