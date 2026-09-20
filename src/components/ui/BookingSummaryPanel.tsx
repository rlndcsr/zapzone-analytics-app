import { AlertTriangle, RefreshCw } from "lucide-react-native";
import { Text, View } from "react-native";

import { PressableScale } from "./motion/PressableScale";
import { StatusBadge } from "./StatusBadge";

import type { BookingQuoteState } from "../../lib/hooks/useBookingQuote";
import { resolvePaymentState } from "../../lib/payments/paymentState";
import type { AppliedFee } from "../../services/bookingsService";

/*
 * The web Edit Booking screen's right-hand "Booking Summary" card, as a panel
 * under the form.
 *
 * Presentational on purpose: every figure is handed in. The screen owns what a
 * line is worth (it has the package, the add-on catalog and the frozen prices);
 * this only decides how the card reads. The money that matters — subtotal,
 * fees, discount, total — comes off the server's quote, with the booking's
 * stored figures standing in until the first quote lands.
 */

const money = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

/** "checked-in" → "Checked in", the way the web prints a booking's status. */
const statusLabel = (status: string) =>
  status ? status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ") : "—";

/** A quote is "changed" only past half a cent — the same epsilon as everywhere. */
const CHANGE_EPSILON = 0.005;

/** One priced line in the breakdown: the package, an attraction, an add-on. */
export type SummaryLine = {
  label: string;
  /** The small grey note after the label — "(4 × $25.00 per player)". */
  hint?: string | null;
  amount: number;
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <View className="border-b border-gray-100 py-3 dark:border-neutral-800">
    <Text className="mb-1 text-xs text-gray-500 dark:text-gray-400">
      {label}
    </Text>
    {children}
  </View>
);

const Row = ({
  label,
  hint,
  value,
  muted,
  valueClass,
}: {
  label: string;
  hint?: string | null;
  value: string;
  muted?: boolean;
  valueClass?: string;
}) => (
  <View className="flex-row items-start justify-between py-1">
    <Text
      className={`mr-2 flex-1 text-xs ${
        muted
          ? "text-gray-400 dark:text-gray-500"
          : "text-gray-600 dark:text-gray-300"
      }`}
    >
      {label}
      {!!hint && (
        <Text className="text-[10px] text-gray-400 dark:text-gray-500">
          {" "}
          {hint}
        </Text>
      )}
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

export function BookingSummaryPanel({
  packageName,
  packagePrice,
  spaceName,
  customerName,
  customerEmail,
  customerPhone,
  dateLabel,
  timeLabel,
  participants,
  status,
  customerNotes,
  internalNotes,
  packageLine,
  attractionLines,
  addOnLines,
  extraParticipantsLine,
  storedFees,
  quote: state,
  storedTotal,
  storedAmountPaid,
  storedPaymentStatus,
}: {
  packageName: string | null;
  packagePrice: number | null;
  /** Null when no space is assigned yet. */
  spaceName: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  dateLabel: string;
  timeLabel: string;
  participants: number;
  status: string;
  customerNotes: string;
  internalNotes: string;
  packageLine: SummaryLine | null;
  /** Only the attractions the booking keeps — a package swap drops them. */
  attractionLines: SummaryLine[];
  addOnLines: SummaryLine[];
  extraParticipantsLine: SummaryLine | null;
  /** The booking's saved fees, shown until a quote replaces them. */
  storedFees: AppliedFee[];
  quote: BookingQuoteState;
  storedTotal: number;
  storedAmountPaid: number;
  storedPaymentStatus: string | null;
}) {
  const { quote, status: quoteStatus, error, refresh } = state;

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

  // Before the first quote lands the booking's own saved fees stand in, which
  // is what the web shows too — the card is never blank.
  const fees = quote
    ? quote.fees.map((fee) => ({
        name: fee.feeLabel ? `${fee.feeName} (${fee.feeLabel})` : fee.feeName,
        amount: fee.feeAmount,
        applicationType: fee.feeApplicationType,
      }))
    : storedFees.map((fee) => ({
        name: fee.name,
        amount: fee.amount,
        applicationType: fee.applicationType,
      }));

  return (
    <View className="mt-6 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <Text className="mb-1 text-base font-bold text-[#0644C7]">
        Booking Summary
      </Text>

      {!!packageName && (
        <Field label="Package">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            {packageName}
          </Text>
          {packagePrice != null && (
            <Text className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              {money(packagePrice)}
            </Text>
          )}
        </Field>
      )}

      <Field label="Space">
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {spaceName || "Not assigned"}
        </Text>
      </Field>

      <Field label="Customer">
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {customerName || "Not specified"}
        </Text>
        <Text className="text-xs text-gray-600 dark:text-gray-300">
          {customerEmail || "No email"}
        </Text>
        <Text className="text-xs text-gray-600 dark:text-gray-300">
          {customerPhone || "No phone"}
        </Text>
      </Field>

      <Field label="Date & Time">
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {dateLabel || "Not set"}
        </Text>
        <Text className="text-xs text-gray-600 dark:text-gray-300">
          {timeLabel || "Not set"}
        </Text>
      </Field>

      <Field label="Participants">
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {participants || 0} people
        </Text>
      </Field>

      <Field label="Status">
        <View className="flex-row">
          <StatusBadge status={status} label={statusLabel(status)} />
        </View>
      </Field>

      {!!customerNotes && (
        <Field label="Customer Notes">
          <Text className="text-xs text-gray-700 dark:text-gray-300">
            {customerNotes}
          </Text>
        </Field>
      )}

      {!!internalNotes && (
        <View className="border-b border-gray-100 py-3 dark:border-neutral-800">
          <View className="mb-1 flex-row items-center gap-2">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Internal Notes
            </Text>
            <View className="rounded bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/30">
              <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Staff Only
              </Text>
            </View>
          </View>
          <Text className="rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/10 dark:text-amber-300">
            {internalNotes}
          </Text>
        </View>
      )}

      {/* Applied fees */}
      <Text className="mb-1 mt-3 text-xs text-gray-500 dark:text-gray-400">
        Applied Fees
      </Text>
      {fees.length === 0 ? (
        <Text className="text-[11px] text-gray-400 dark:text-gray-500">
          No fees configured for this package.
        </Text>
      ) : (
        fees.map((fee, i) => (
          <View
            key={`${fee.name}-${i}`}
            className="mb-1.5 flex-row items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          >
            <Text className="mr-2 flex-1 text-xs text-gray-700 dark:text-gray-300">
              {fee.name}
              <Text className="text-[10px] text-gray-400 dark:text-gray-500">
                {" "}
                {fee.applicationType}
              </Text>
            </Text>
            <Text className="text-xs font-medium text-gray-900 dark:text-white">
              {money(fee.amount)}
            </Text>
          </View>
        ))
      )}
      <Text className="mt-1 text-[11px] leading-4 text-gray-400 dark:text-gray-500">
        Fees come from this location&apos;s fee settings and recalculate with
        the participant count.
      </Text>

      {/* Payment breakdown */}
      <Text className="mb-1 mt-4 text-xs text-gray-500 dark:text-gray-400">
        Payment Breakdown
      </Text>

      {quoteStatus === "error" && (
        // Saving is blocked while this is on screen, so the message says what
        // to do rather than just what went wrong.
        <View className="mb-2 flex-row items-start gap-2 rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
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
        // The stored total predates the current rules — worth saying out loud,
        // because only the change made here is applied to it.
        <View className="mb-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
          <Text className="text-xs leading-4 text-amber-800 dark:text-amber-300">
            This booking&apos;s stored total predates the current pricing rules.
            Only the change you make here is applied to it, so the original
            agreed price is preserved.
          </Text>
        </View>
      )}

      {!!packageLine && (
        <Row
          label={packageLine.label}
          hint={packageLine.hint}
          value={money(packageLine.amount)}
        />
      )}

      {attractionLines.length > 0 && (
        <View className="mt-1 border-t border-gray-100 pt-1 dark:border-neutral-800">
          <Text className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
            Attractions
          </Text>
          {attractionLines.map((line, i) => (
            <Row
              key={`attraction-${i}`}
              label={line.label}
              value={money(line.amount)}
            />
          ))}
        </View>
      )}

      {addOnLines.length > 0 && (
        <View className="mt-1 border-t border-gray-100 pt-1 dark:border-neutral-800">
          <Text className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
            Add-ons
          </Text>
          {addOnLines.map((line, i) => (
            <Row
              key={`addon-${i}`}
              label={line.label}
              value={money(line.amount)}
            />
          ))}
        </View>
      )}

      {!!extraParticipantsLine && (
        <Row
          label={extraParticipantsLine.label}
          value={money(extraParticipantsLine.amount)}
        />
      )}

      {!!quote && quote.subtotal > 0 && (
        <View className="mt-1 border-t border-gray-100 pt-1 dark:border-neutral-800">
          <Row label="Subtotal" value={money(quote.subtotal)} />
        </View>
      )}

      {quote?.fees.map((fee, i) => (
        <Row
          key={`quote-fee-${fee.feeName}-${i}`}
          label={fee.feeLabel ? `${fee.feeName} (${fee.feeLabel})` : fee.feeName}
          value={money(fee.feeAmount)}
          muted
        />
      ))}

      {discount > 0 && (
        <Row
          label="Discount"
          value={`−${money(discount)}`}
          valueClass="text-green-600 dark:text-green-400"
        />
      )}

      <View className="mt-2 border-t border-gray-200 pt-2 dark:border-neutral-700">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            Total Amount
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text className="text-base font-bold text-gray-900 dark:text-white">
              {money(total)}
            </Text>
            {quoteStatus === "loading" && (
              <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                (updating…)
              </Text>
            )}
            {quoteStatus !== "loading" && totalChanged && (
              <Text className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                (Updated)
              </Text>
            )}
          </View>
        </View>

        <Row
          label="Amount Paid"
          value={money(amountPaid)}
          valueClass="text-green-600 dark:text-green-400"
        />

        <View className="mt-1 flex-row items-center justify-between border-t border-gray-100 pt-2 dark:border-neutral-800">
          <Text
            className={`text-xs font-medium ${
              payment.isSettled
                ? "text-green-700 dark:text-green-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {payment.balanceLabel}
          </Text>
          <Text className={`text-sm font-semibold ${payment.amountClass}`}>
            {payment.isSettled && payment.balance >= -CHANGE_EPSILON
              ? payment.label
              : money(Math.abs(payment.balance))}
          </Text>
        </View>
      </View>
    </View>
  );
}
