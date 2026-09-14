import { AlertTriangle, RefreshCw } from "lucide-react-native";
import { Text, View } from "react-native";

import { PressableScale } from "./motion/PressableScale";

import type { BookingQuoteState } from "../../lib/hooks/useBookingQuote";
import { resolvePaymentState } from "../../lib/payments/paymentState";

const money = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

/** A quote is "changed" only past half a cent — the same epsilon as everywhere. */
const CHANGE_EPSILON = 0.005;

const Row = ({
  label,
  value,
  muted,
  valueClass,
}: {
  label: string;
  value: string;
  muted?: boolean;
  valueClass?: string;
}) => (
  <View className="flex-row items-center justify-between py-1">
    <Text
      className={`text-xs ${
        muted
          ? "text-gray-400 dark:text-gray-500"
          : "text-gray-600 dark:text-gray-300"
      }`}
    >
      {label}
    </Text>
    <Text
      className={`text-xs font-medium ${
        valueClass ?? "text-gray-900 dark:text-white"
      }`}
    >
      {value}
    </Text>
  </View>
);

export function BookingPricePanel({
  quote: state,
  storedTotal,
  storedAmountPaid,
  storedPaymentStatus,
}: {
  quote: BookingQuoteState;
  storedTotal: number;
  storedAmountPaid: number;
  storedPaymentStatus: string | null;
}) {
  const { quote, status, error, refresh } = state;

  const total = quote ? quote.totalAmount : storedTotal;
  const amountPaid = quote ? quote.amountPaid : storedAmountPaid;
  const discount = quote ? quote.discountAmount : 0;

  const payment = resolvePaymentState({
    payment_status: quote ? quote.paymentStatus : storedPaymentStatus,
    total_amount: total,
    amount_paid: amountPaid,
  });

  const totalChanged =
    !!quote && Math.abs(quote.totalAmount - storedTotal) > CHANGE_EPSILON;

  return (
    <View className="mt-6 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Pricing
        </Text>
        {status === "loading" && (
          <Text className="text-[11px] text-gray-400 dark:text-gray-500">
            Updating…
          </Text>
        )}
        {status === "ready" && totalChanged && (
          <Text className="text-[11px] font-semibold text-[#0644C7]">
            Updated
          </Text>
        )}
      </View>

      {status === "error" && (
        // Saving is blocked while this is on screen, so the message says what
        // to do rather than just what went wrong.
        <View className="mb-3 flex-row items-start gap-2 rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
          <AlertTriangle size={15} color="#DC2626" />
          <View className="flex-1">
            <Text className="text-xs leading-4 text-red-700 dark:text-red-300">
              {error ?? "Couldn't price this change."} You can&apos;t save until
              the price comes back.
            </Text>
            <PressableScale
              onPress={refresh}
              accessibilityRole="button"
              className="mt-2 flex-row items-center gap-1.5 self-start rounded-lg bg-red-600 px-3 py-1.5"
            >
              <RefreshCw size={12} color="#FFFFFF" />
              <Text className="text-[11px] font-semibold text-white">
                Try again
              </Text>
            </PressableScale>
          </View>
        </View>
      )}

      {quote && quote.pricingConsistent === false && (
        // The stored total disagrees with what the rules now produce — worth
        // saying out loud, because saving will quietly correct it.
        <View className="mb-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
          <Text className="text-xs leading-4 text-amber-800 dark:text-amber-300">
            This booking&apos;s stored total doesn&apos;t match current pricing.
            Saving will update it to {money(quote.totalAmount)}.
          </Text>
        </View>
      )}

      {!!quote && quote.subtotal > 0 && (
        <Row label="Subtotal" value={money(quote.subtotal)} />
      )}

      {quote?.fees.map((fee, i) => (
        <Row
          key={`${fee.feeName}-${i}`}
          label={`${fee.feeLabel || fee.feeName}${
            fee.feeApplicationType === "inclusive" ? " (incl.)" : ""
          }`}
          value={money(fee.feeAmount)}
          muted
        />
      ))}

      {!!quote && quote.fees.length === 0 && (
        <Text className="py-1 text-[11px] text-gray-400 dark:text-gray-500">
          No fees configured for this package.
        </Text>
      )}

      {discount > 0 && (
        <Row
          label="Discount"
          value={`−${money(discount)}`}
          valueClass="text-green-600 dark:text-green-400"
        />
      )}

      <View className="mt-2 border-t border-gray-100 pt-2 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            Total
          </Text>
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            {money(total)}
          </Text>
        </View>

        <Row label="Amount paid" value={money(amountPaid)} muted />

        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-xs text-gray-600 dark:text-gray-300">
            {payment.balanceLabel}
          </Text>
          <Text className={`text-sm font-semibold ${payment.amountClass}`}>
            {money(Math.abs(payment.balance))}
          </Text>
        </View>
      </View>

      <Text className="mt-3 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
        Fees come from this location&apos;s fee settings and recalculate with
        the participant count.
      </Text>
    </View>
  );
}
