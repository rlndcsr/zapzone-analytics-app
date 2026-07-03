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
import { parseTicketPurchaseId } from "../checkin/parseTicketQr";

/**
 * Screen phase for the check-in flow (a "stay-and-rescan" loop, matching web):
 * - `scanning`   — camera live, waiting for a QR.
 * - `processing` — a code was read; verifying with the backend.
 * - `review`     — a valid, confirmed ticket is loaded, awaiting staff approval.
 * - `result`     — a terminal outcome (success / blocked / error) is shown.
 */
export type CheckInPhase = "scanning" | "processing" | "review" | "result";

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

export type UseAttractionCheckIn = {
  phase: CheckInPhase;
  review: PurchaseRow | null;
  result: CheckInResult | null;
  busy: boolean;
  handleScan: (decoded: string) => void;
  confirm: () => void;
  cancelReview: () => void;
  reset: () => void;
};

/**
 * Owns the entire Attraction check-in flow so the screen stays presentational:
 * QR parse → verify → status gate → confirm → check-in, plus invalid-QR and
 * network handling. Reuses the shared attraction-purchase service (same
 * endpoints as the web) and reads auth from the session module.
 */
export function useAttractionCheckIn(): UseAttractionCheckIn {
  const [phase, setPhase] = useState<CheckInPhase>("scanning");
  const [review, setReview] = useState<PurchaseRow | null>(null);
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
    setResult(next);
    setPhase("result");
  }, []);

  const handleScan = useCallback(
    async (decoded: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setPhase("processing");

      try {
        const purchaseId = parseTicketPurchaseId(decoded);
        if (purchaseId == null) {
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

        // Eligible → hand off to the confirm surface.
        setReview(purchase);
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

  const cancelReview = useCallback(() => {
    setReview(null);
    setResult(null);
    setPhase("scanning");
  }, []);

  const reset = useCallback(() => {
    setReview(null);
    setResult(null);
    setPhase("scanning");
  }, []);

  return {
    phase,
    review,
    result,
    busy,
    handleScan,
    confirm,
    cancelReview,
    reset,
  };
}
