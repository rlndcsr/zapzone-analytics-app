import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import { ApiError } from "../../lib/api";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  checkInBooking,
  fetchBookingByReference,
  fetchBookingDetail,
  recordBookingPayment,
  scanBookingFromDetail,
  type BookingDetail,
  type ScanBooking,
} from "../../services/bookingsService";
import {
  checkInWaiver as checkInWaiverApi,
  fetchEntityWaivers,
  type EntityWaivers,
} from "../../services/waiversService";
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
  /** Full booking detail for the verify surface (null if the detail fetch failed). */
  reviewDetail: BookingDetail | null;
  /** Waivers connected to the booking under review (null while loading / on failure). */
  waivers: EntityWaivers | null;
  result: BookingCheckInResult | null;
  busy: boolean;
  /** True while an Add Payment request is in flight. */
  paying: boolean;
  /** Id of the waiver whose check-in is in flight (null when idle). */
  checkingWaiverId: number | null;
  handleScan: (decoded: string) => void;
  /** Approve → check the customer in (same as confirm). */
  confirm: () => void;
  /** Record an in-store payment against the reviewed booking; returns success. */
  addPayment: (amount: number) => Promise<boolean>;
  /** Mark a connected waiver's participant as checked in, then refresh. */
  checkInWaiver: (waiverId: number) => Promise<void>;
  /** Deny → decline check-in and return to the scanner. */
  deny: () => void;
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
  const [reviewDetail, setReviewDetail] = useState<BookingDetail | null>(null);
  const [waivers, setWaivers] = useState<EntityWaivers | null>(null);
  const [result, setResult] = useState<BookingCheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [checkingWaiverId, setCheckingWaiverId] = useState<number | null>(null);

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
    setReviewDetail(null);
    setWaivers(null);
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

        // Eligible → load the full detail + connected waivers for the verify
        // surface (both best-effort), then hand off to the review screen.
        setResult(null);

        let detail: BookingDetail | null = null;
        try {
          detail = await fetchBookingDetail(token, booking.id, signal);
        } catch (err) {
          if (signal.aborted) return;
          detail = null; // fall back to the summary-only review
        }

        let entityWaivers: EntityWaivers | null = null;
        try {
          entityWaivers = await fetchEntityWaivers(
            token,
            "booking",
            booking.id,
            signal,
          );
        } catch (err) {
          if (signal.aborted) return;
          entityWaivers = null;
        }

        if (!mountedRef.current) return;
        setReviewDetail(detail);
        setWaivers(entityWaivers);
        setReview(booking);
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

  // Record an in-store payment against the reviewed booking, then refresh the
  // detail so the new Amount Paid / Payment Status show immediately.
  const addPayment = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!reviewDetail || paying) return false;
      if (!(amount > 0)) {
        Alert.alert("Invalid amount", "Enter a payment amount greater than 0.");
        return false;
      }

      setPaying(true);
      try {
        const token = getToken();
        if (!token) {
          Alert.alert("Session expired", "Please sign in again to add a payment.");
          return false;
        }

        await recordBookingPayment(token, {
          bookingId: reviewDetail.id,
          amount,
          locationId: reviewDetail.locationId,
          customerId: reviewDetail.customerId,
        });

        // Reflect the new balance from the server.
        const detail = await fetchBookingDetail(token, reviewDetail.id);
        if (mountedRef.current) {
          setReviewDetail(detail);
          setReview((prev) =>
            prev
              ? {
                  ...prev,
                  amountPaid: detail.amountPaid,
                  paymentStatus: detail.paymentStatus,
                }
              : prev,
          );
        }
        return true;
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        Alert.alert(
          "Payment failed",
          apiErr?.message ??
            "Unable to record the payment. Check your connection and try again.",
        );
        return false;
      } finally {
        if (mountedRef.current) setPaying(false);
      }
    },
    [reviewDetail, paying],
  );

  // Check a connected waiver's participant in, then refresh the waivers list so
  // the "Checked In" badge updates.
  const checkInWaiver = useCallback(
    async (waiverId: number) => {
      if (!reviewDetail || checkingWaiverId != null) return;
      setCheckingWaiverId(waiverId);
      try {
        const token = getToken();
        if (!token) {
          Alert.alert("Session expired", "Please sign in again.");
          return;
        }
        await checkInWaiverApi(token, waiverId);
        const refreshed = await fetchEntityWaivers(
          token,
          "booking",
          reviewDetail.id,
        );
        if (mountedRef.current) setWaivers(refreshed);
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        Alert.alert(
          "Check-in failed",
          apiErr?.message ??
            "Unable to check in this waiver. Check your connection and try again.",
        );
      } finally {
        if (mountedRef.current) setCheckingWaiverId(null);
      }
    },
    [reviewDetail, checkingWaiverId],
  );

  const clearReview = useCallback(() => {
    setReview(null);
    setReviewDetail(null);
    setWaivers(null);
    setResult(null);
    setPhase("scanning");
  }, []);

  // Deny → decline the check-in and return to the scanner.
  const deny = useCallback(() => clearReview(), [clearReview]);
  const cancelReview = useCallback(() => clearReview(), [clearReview]);
  const reset = useCallback(() => clearReview(), [clearReview]);

  return {
    phase,
    review,
    reviewDetail,
    waivers,
    result,
    busy,
    paying,
    checkingWaiverId,
    handleScan,
    confirm,
    addPayment,
    checkInWaiver,
    deny,
    cancelReview,
    reset,
  };
}
