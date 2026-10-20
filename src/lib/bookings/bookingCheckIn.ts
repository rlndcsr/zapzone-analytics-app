import {
  resolvePaymentState,
  type PaymentStateInput,
} from "../payments/paymentState.ts";

export const isCheckInEligible = (booking: {
  status?: string | null;
}): boolean => String(booking.status ?? "").toLowerCase() === "confirmed";

export const outstandingBalanceOf = (
  booking: PaymentStateInput,
): number | null => {
  if (booking.total_amount == null || booking.amount_paid == null) return null;
  const payment = resolvePaymentState(booking);
  return !payment.isSettled && payment.balance > 0 ? payment.balance : null;
};
