import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../lib/api";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  checkInAttractionPurchase,
  fetchAttractionPurchase,
  verifyAttractionPurchase,
  type PurchaseRow,
  type PurchaseStatus,
} from "../../services/attractionPurchasesService";
import {
  checkInTicketOrder,
  fetchTicketOrder,
  type TicketOrderDetail,
} from "../../services/ticketOrdersService";
import {
  fetchEntityWaivers,
  type EntityWaivers,
} from "../../services/waiversService";
import { parseScannedTicketQr } from "../checkin/parseTicketQr";

/**
 * Screen phase for the check-in flow (a "stay-and-rescan" loop, matching web):
 * - `idle`       — camera off, waiting for "Start Camera" (the web's landing state).
 * - `scanning`   — camera live, waiting for a QR.
 * - `processing` — a code was read; verifying with the backend.
 * - `review`     — a valid, confirmed ticket is loaded, awaiting staff approval.
 * - `order`      — a scanned multi-item order is loaded, with its lines.
 * - `result`     — a terminal outcome (success / blocked / error) is shown.
 */
export type CheckInPhase =
  | "idle"
  | "scanning"
  | "processing"
  | "review"
  | "order"
  | "result";

export type ResultTone = "success" | "warning" | "error";

/** Terminal outcome rendered on the result surface. */
export type CheckInResult = {
  tone: ResultTone;
  title: string;
  message: string;
  purchase: PurchaseRow | null;
  actionLabel: string;
};

/**
 * Maps a non-checkable purchase status to a blocked outcome, or `null` when the
 * ticket is eligible. Messages mirror the web scanner's status gate.
 */
function gateStatus(
  status: PurchaseStatus,
): Omit<CheckInResult, "purchase" | "actionLabel"> | null {
  switch (status) {
    case "confirmed":
      return null;
    case "checked-in":
      return {
        tone: "warning",
        title: "Already Checked In",
        message:
          "This ticket has already been checked in and cannot be used again.",
      };
    case "cancelled":
      return {
        tone: "error",
        title: "Ticket Cancelled",
        message: "This ticket has been cancelled and cannot be used.",
      };
    case "refunded":
      return {
        tone: "error",
        title: "Ticket Refunded",
        message: "This ticket has been refunded and cannot be used.",
      };
    case "pending":
      return {
        tone: "warning",
        title: "Payment Incomplete",
        message:
          "This ticket has not been fully paid yet. Payment must be completed before check-in.",
      };
    default:
      return {
        tone: "error",
        title: "Not Eligible",
        message: `This ticket is not eligible for check-in (status: ${status}).`,
      };
  }
}

/** Outcome of the last order check-in attempt, shown above the order's lines. */
export type OrderNotice = { tone: ResultTone; message: string };

export type UseAttractionCheckIn = {
  phase: CheckInPhase;
  review: PurchaseRow | null;
  /** Waivers connected to the ticket under review (null while loading / on failure). */
  waivers: EntityWaivers | null;
  /** The scanned multi-item order, with its lines (phase `order`). */
  order: TicketOrderDetail | null;
  /** Which order check-in is in flight: a line id, "all", or nothing. */
  orderBusy: number | "all" | null;
  orderNotice: OrderNotice | null;
  result: CheckInResult | null;
  busy: boolean;
  handleScan: (decoded: string) => void;
  confirm: () => void;
  /** Admit the whole order, or just the given lines. */
  checkInOrder: (lineIds?: number[]) => void;
  /** Leave the order surface and go back to the camera (web `handleCloseOrder`). */
  closeOrder: () => void;
  cancelReview: () => void;
  /** Turn the camera on (web "Start Camera"). */
  startScanning: () => void;
  /** Turn the camera off, back to the landing state (web "Stop Camera"). */
  stopScanning: () => void;
  /** Clear the current result and return to the camera. */
  reset: () => void;
};

/**
 * Owns the entire Attraction check-in flow so the screen stays presentational:
 * QR parse → verify → status gate → confirm → check-in, plus invalid-QR and
 * network handling. Reuses the shared attraction-purchase service (same
 * endpoints as the web) and reads auth from the session module.
 */
export function useAttractionCheckIn(): UseAttractionCheckIn {
  const [phase, setPhase] = useState<CheckInPhase>("idle");
  const [review, setReview] = useState<PurchaseRow | null>(null);
  const [waivers, setWaivers] = useState<EntityWaivers | null>(null);
  const [order, setOrder] = useState<TicketOrderDetail | null>(null);
  const [orderBusy, setOrderBusy] = useState<number | "all" | null>(null);
  const [orderNotice, setOrderNotice] = useState<OrderNotice | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);

  // Guards against the camera firing onBarcodeScanned repeatedly for one code.
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const finishWithResult = useCallback((next: CheckInResult) => {
    if (!mountedRef.current) return;
    setReview(null);
    setOrder(null);
    setOrderNotice(null);
    setResult(next);
    setPhase("result");
  }, []);

  const handleScan = useCallback(
    async (decoded: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setPhase("processing");

      try {
        const scanned = parseScannedTicketQr(decoded);
        if (scanned == null) {
          finishWithResult({
            tone: "error",
            title: "Invalid QR Code",
            message:
              "This code isn't a valid ZapZone ticket. Please scan the QR code on the customer's ticket.",
            purchase: null,
            actionLabel: "Scan Again",
          });
          return;
        }

        const token = getToken();
        const user = getCurrentUser();
        if (!token) {
          finishWithResult({
            tone: "error",
            title: "Session Expired",
            message: "Your session has expired. Please sign in again.",
            purchase: null,
            actionLabel: "Try Again",
          });
          return;
        }

        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        // A multi-item order: one code admits every line, so it opens the order
        // surface instead of the single-ticket verify (web `handleOrderScan`).
        // Eligibility is not gated here — the order panel states it per line,
        // exactly as the web modal does.
        if (scanned.kind === "order") {
          try {
            const detail = await fetchTicketOrder(
              token,
              scanned.orderId,
              signal,
            );
            if (!mountedRef.current) return;
            setReview(null);
            setWaivers(null);
            setResult(null);
            setOrderNotice(null);
            setOrder(detail);
            setPhase("order");
          } catch (err) {
            if (signal.aborted) return;
            const apiErr = err instanceof ApiError ? err : null;
            finishWithResult({
              tone: "error",
              title: apiErr?.status === 404 ? "Order Not Found" : "Something Went Wrong",
              message:
                apiErr?.status === 404
                  ? "No matching order was found for this QR code."
                  : (apiErr?.message ??
                    "Unable to load the order. Check your connection and try again."),
              purchase: null,
              actionLabel: "Scan Again",
            });
          }
          return;
        }

        const purchaseId = scanned.purchaseId;

        let verified;
        try {
          verified = await verifyAttractionPurchase({
            token,
            purchaseId,
            userId: user?.id,
            signal,
          });
        } catch (err) {
          if (signal.aborted) return;
          const apiErr = err instanceof ApiError ? err : null;
          if (apiErr?.status === 404) {
            finishWithResult({
              tone: "error",
              title: "Ticket Not Found",
              message: "No matching ticket was found for this QR code.",
              purchase: null,
              actionLabel: "Scan Again",
            });
          } else {
            finishWithResult({
              tone: "error",
              title: "Something Went Wrong",
              message:
                apiErr?.message ??
                "Unable to verify the ticket. Check your connection and try again.",
              purchase: null,
              actionLabel: "Try Again",
            });
          }
          return;
        }

        if (!verified.success || !verified.purchase) {
          finishWithResult({
            tone: "error",
            title: "Invalid Ticket",
            message: verified.message ?? "This ticket could not be verified.",
            purchase: null,
            actionLabel: "Scan Again",
          });
          return;
        }

        const purchase = verified.purchase;

        // Parity with web: when verify omits the schedule, backfill it from the
        // full purchase so the confirm surface can show it. Best-effort — a
        // failure here never blocks check-in.
        if (!purchase.scheduledDate || !purchase.scheduledTime) {
          try {
            const full = await fetchAttractionPurchase({
              token,
              purchaseId,
              signal,
            });
            if (full) {
              purchase.scheduledDate =
                purchase.scheduledDate ?? full.scheduledDate;
              purchase.scheduledTime =
                purchase.scheduledTime ?? full.scheduledTime;
            }
          } catch {
            if (signal.aborted) return;
            // Ignore — schedule is display-only.
          }
        }

        if (!mountedRef.current) return;

        const blocked = gateStatus(purchase.status);
        if (blocked) {
          finishWithResult({ ...blocked, purchase, actionLabel: "Scan Next" });
          return;
        }

        // Connected waivers for the verify surface (same panel as the web
        // modal). Best-effort — a failure never blocks check-in.
        let entityWaivers: EntityWaivers | null = null;
        try {
          entityWaivers = await fetchEntityWaivers(
            token,
            "attraction_purchase",
            purchase.id,
            signal,
          );
        } catch {
          if (signal.aborted) return;
          entityWaivers = null;
        }

        if (!mountedRef.current) return;

        // Eligible → hand off to the confirm surface.
        setReview(purchase);
        setWaivers(entityWaivers);
        setResult(null);
        setPhase("review");
      } finally {
        processingRef.current = false;
      }
    },
    [finishWithResult],
  );

  const confirm = useCallback(async () => {
    if (!review || busy) return;
    setBusy(true);
    try {
      const token = getToken();
      const user = getCurrentUser();
      if (!token) {
        finishWithResult({
          tone: "error",
          title: "Session Expired",
          message: "Your session has expired. Please sign in again.",
          purchase: review,
          actionLabel: "Try Again",
        });
        return;
      }

      const res = await checkInAttractionPurchase({
        token,
        purchaseId: review.id,
        userId: user?.id,
      });

      if (res.success) {
        finishWithResult({
          tone: "success",
          title: "Check-In Successful",
          message: "Check-in successful! Ticket marked as used.",
          purchase: res.purchase ?? review,
          actionLabel: "Scan Next",
        });
      } else {
        finishWithResult({
          tone: "error",
          title: "Check-In Failed",
          message: res.message ?? "Check-in failed. Please try again.",
          purchase: review,
          actionLabel: "Try Again",
        });
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      finishWithResult({
        tone: "error",
        title: "Check-In Failed",
        message:
          apiErr?.message ??
          "Unable to check in the ticket. Check your connection and try again.",
        purchase: review,
        actionLabel: "Try Again",
      });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [review, busy, finishWithResult]);

  /**
   * Admit the order — every eligible line, or just the ones passed.
   *
   * The server owns eligibility: it reports what it refused in `skipped`, and
   * the order is re-read afterwards so the panel shows the lines' new state
   * rather than an optimistic guess (web `handleOrderCheckIn`).
   */
  const checkInOrder = useCallback(
    async (lineIds?: number[]) => {
      if (!order || orderBusy !== null) return;
      setOrderBusy(lineIds && lineIds.length ? lineIds[0] : "all");
      try {
        const token = getToken();
        if (!token) {
          finishWithResult({
            tone: "error",
            title: "Session Expired",
            message: "Your session has expired. Please sign in again.",
            purchase: null,
            actionLabel: "Try Again",
          });
          return;
        }

        const res = await checkInTicketOrder(token, order.id, lineIds);
        const fresh = await fetchTicketOrder(token, order.id);
        if (!mountedRef.current) return;

        setOrder(fresh);
        const skipped = res.skipped.length
          ? ` — skipped: ${res.skipped.map((s) => s.reason).join(", ")}`
          : "";
        setOrderNotice({
          tone: res.checkedIn > 0 ? "success" : "error",
          message: `Checked in ${res.checkedIn} ticket${
            res.checkedIn === 1 ? "" : "s"
          }${skipped}`,
        });
      } catch (err) {
        if (!mountedRef.current) return;
        const apiErr = err instanceof ApiError ? err : null;
        setOrderNotice({
          tone: "error",
          message:
            apiErr?.message ??
            "We could not check that order in. Check your connection and try again.",
        });
      } finally {
        if (mountedRef.current) setOrderBusy(null);
      }
    },
    [order, orderBusy, finishWithResult],
  );

  const closeOrder = useCallback(() => {
    setOrder(null);
    setOrderNotice(null);
    setResult(null);
    setPhase("scanning");
  }, []);

  const clearSurfaces = useCallback(() => {
    setReview(null);
    setWaivers(null);
    setOrder(null);
    setOrderNotice(null);
    setResult(null);
  }, []);

  const cancelReview = useCallback(() => {
    clearSurfaces();
    setPhase("scanning");
  }, [clearSurfaces]);

  const startScanning = useCallback(() => {
    clearSurfaces();
    setPhase("scanning");
  }, [clearSurfaces]);

  const stopScanning = useCallback(() => {
    abortRef.current?.abort();
    clearSurfaces();
    setPhase("idle");
  }, [clearSurfaces]);

  const reset = useCallback(() => {
    clearSurfaces();
    setPhase("scanning");
  }, [clearSurfaces]);

  return {
    phase,
    review,
    waivers,
    order,
    orderBusy,
    orderNotice,
    result,
    busy,
    handleScan,
    confirm,
    checkInOrder,
    closeOrder,
    cancelReview,
    startScanning,
    stopScanning,
    reset,
  };
}
