import { useEffect, useRef, useState } from "react";

import {
  repriceBooking,
  type BookingQuote,
  type BookingRepriceIntent,
} from "../../services/bookingsService";
import { getToken } from "../session";

/** The web EditBooking's debounce, so both admins quote at the same pace. */
const REPRICE_DEBOUNCE_MS = 300;

export type QuoteStatus = "idle" | "loading" | "ready" | "error";

export type BookingQuoteState = {
  /** The server's price for the current intent; `null` until one arrives. */
  quote: BookingQuote | null;
  status: QuoteStatus;
  /** Why the last quote failed, in the user's terms. */
  error: string | null;
  /**
   * True while the price on screen cannot be trusted — a quote is in flight,
   * or the last one failed. Saving must be blocked on this: the whole point of
   * quoting is that the client no longer knows the total, so a save that went
   * ahead anyway would be writing a number nobody computed.
   */
  blocked: boolean;
  /** Re-run the quote now, for a Retry button. */
  refresh: () => void;
};

/**
 * The server's price for a proposed booking edit, re-quoted as the user types.
 *
 * `intentKey` is what decides when to re-quote: the caller passes a string
 * that changes exactly when the priced fields change. That is deliberate —
 * `intent` is rebuilt on every render, so depending on the object itself would
 * re-quote on every keystroke in an unrelated field (and never settle).
 *
 * `enabled` gates the whole thing: while nothing priced has changed there is
 * nothing to quote, and the stored total already on screen is the right answer.
 */
export function useBookingQuote({
  bookingId,
  intent,
  intentKey,
  enabled,
}: {
  bookingId: number | null;
  intent: BookingRepriceIntent;
  intentKey: string;
  enabled: boolean;
}): BookingQuoteState {
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [status, setStatus] = useState<QuoteStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The latest intent, read at fire time. Keeping it in a ref rather than in
  // the dependency list is what lets `intentKey` alone drive the re-quote.
  const intentRef = useRef(intent);
  intentRef.current = intent;

  useEffect(() => {
    if (!enabled || bookingId == null) {
      // Nothing priced has changed: drop any stale quote so the screen falls
      // back to the stored total rather than showing a price for an edit the
      // user has since undone.
      setQuote(null);
      setStatus("idle");
      setError(null);
      return;
    }

    const token = getToken();
    if (!token) {
      setStatus("error");
      setError("You are signed out. Sign in again to price this change.");
      return;
    }

    // Straight to "loading" — before the debounce even elapses the price on
    // screen is already out of date, and saving must be blocked from that
    // moment, not from when the request happens to go out.
    setStatus("loading");
    setError(null);

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const next = await repriceBooking(
          token,
          bookingId,
          intentRef.current,
          controller.signal,
        );
        if (!mountedRef.current || controller.signal.aborted) return;
        setQuote(next);
        setStatus("ready");
        setError(null);
      } catch (e) {
        // An abort is this effect being superseded, not a failure.
        if (controller.signal.aborted || !mountedRef.current) return;
        setQuote(null);
        setStatus("error");
        setError(
          e instanceof Error
            ? e.message
            : "Couldn't get a price for this change.",
        );
      }
    }, REPRICE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [bookingId, intentKey, enabled, nonce]);

  return {
    quote,
    status,
    error,
    blocked: status === "loading" || status === "error",
    refresh: () => setNonce((n) => n + 1),
  };
}
