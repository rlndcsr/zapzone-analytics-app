import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../../lib/api";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  checkInBooking,
  fetchBookingByReference,
  fetchBookingDetail,
  scanBookingFromDetail,
  type ScanBooking,
} from "../../services/bookingsService";
import { parseBookingQr } from "../checkin/parseTicketQr";
// Reuse the phase/tone vocabulary from the attraction scanner so both flows
// speak the same language (no runtime coupling — types only).
import type { CheckInPhase, ResultTone } from "./useAttractionCheckIn";

export type { CheckInPhase, ResultTone };

/** Terminal outcome rendered on the booking check-in result surface. */
export type BookingCheckInResult = {
  tone: ResultTone;
  title: string;
  message: string;
  booking: ScanBooking | null;
  actionLabel: string;
};

/**
 * Maps a non-checkable booking status to a blocked outcome, or `null` when the
 * booking is eligible. Mirrors the web scanner's gate: only `confirmed`
 * bookings can be checked in (pending must be paid → confirmed first).
 */
function gateStatus(
  status: string,
): Omit<BookingCheckInResult, "booking" | "actionLabel"> | null {
  switch (status) {
    case "confirmed":
      return null;
    case "checked-in":
      return {
        tone: "warning",
        title: "Already Checked In",
        message: "This booking has already been checked in.",
      };
    case "completed":
      return {
        tone: "warning",
        title: "Booking Completed",
        message: "This booking has already been completed.",
      };
    case "cancelled":
      return {
        tone: "error",
        title: "Booking Cancelled",
        message: "This booking has been cancelled and cannot be checked in.",
      };
    case "refunded":
      return {
        tone: "error",
        title: "Booking Refunded",
        message: "This booking has been refunded and cannot be checked in.",
      };
    case "pending":
      return {
        tone: "warning",
        title: "Payment Incomplete",
        message:
          "This booking isn’t confirmed yet. Payment must be completed before check-in.",
      };
    default:
      return {
        tone: "error",
        title: "Not Eligible",
        message: `This booking is not eligible for check-in (status: ${status}).`,
      };
  }
}

export type UseBookingCheckIn = {
  phase: CheckInPhase;
  review: ScanBooking | null;
  result: BookingCheckInResult | null;
  busy: boolean;
  handleScan: (decoded: string) => void;
  confirm: () => void;
  cancelReview: () => void;
  reset: () => void;
};

/**
 * Owns the Booking check-in flow (QR parse → look up → status gate → confirm →
 * check-in), matching the web CheckIn.tsx workflow. Reuses the shared booking
 * services (same endpoints as the web) and reads auth from the session module.
 */
export function useBookingCheckIn(): UseBookingCheckIn {
  const [phase, setPhase] = useState<CheckInPhase>("scanning");
  const [review, setReview] = useState<ScanBooking | null>(null);
  const [result, setResult] = useState<BookingCheckInResult | null>(null);
  const [busy, setBusy] = useState(false);

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

  const finishWithResult = useCallback((next: BookingCheckInResult) => {
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
        const { referenceNumber, bookingId } = parseBookingQr(decoded);
        if (!referenceNumber && bookingId == null) {
          finishWithResult({
            tone: "error",
            title: "Invalid QR Code",
            message:
              "This code isn't a valid ZapZone booking. Please scan the QR code on the customer's booking.",
            booking: null,
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
            booking: null,
            actionLabel: "Try Again",
          });
          return;
        }

        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        let booking: ScanBooking | null = null;
        try {
          // Prefer the reference number (like the web); fall back to the id.
          if (referenceNumber) {
            booking = await fetchBookingByReference({
              token,
              referenceNumber,
              userId: user?.id,
              signal,
            });
          } else if (bookingId != null) {
            const detail = await fetchBookingDetail(token, bookingId, signal);
            booking = detail ? scanBookingFromDetail(detail) : null;
          }
        } catch (err) {
          if (signal.aborted) return;
          const apiErr = err instanceof ApiError ? err : null;
          if (apiErr?.status === 404) {
            booking = null;
          } else {
            finishWithResult({
              tone: "error",
              title: "Something Went Wrong",
              message:
                apiErr?.message ??
                "Unable to verify the booking. Check your connection and try again.",
              booking: null,
              actionLabel: "Try Again",
            });
            return;
          }
        }

        if (!mountedRef.current) return;

        if (!booking) {
          finishWithResult({
            tone: "error",
            title: "Booking Not Found",
            message: `No matching booking was found for this QR code${
              referenceNumber ? ` (“${referenceNumber}”)` : ""
            }.`,
            booking: null,
            actionLabel: "Scan Again",
          });
          return;
        }

        const blocked = gateStatus(booking.status);
        if (blocked) {
          finishWithResult({ ...blocked, booking, actionLabel: "Scan Next" });
          return;
        }

        // Eligible → hand off to the confirm surface.
        setReview(booking);
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
          booking: review,
          actionLabel: "Try Again",
        });
        return;
      }

      await checkInBooking(token, review.referenceNumber, user?.id);
      finishWithResult({
        tone: "success",
        title: "Check-In Successful",
        message: "Check-in successful! The booking has been marked as used.",
        booking: { ...review, status: "checked-in" },
        actionLabel: "Scan Next",
      });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      finishWithResult({
        tone: "error",
        title: "Check-In Failed",
        message:
          apiErr?.message ??
          "Unable to check in the booking. Check your connection and try again.",
        booking: review,
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
