import { Text, View } from "react-native";

import {
  resolvePaymentState,
  type PaymentStateInput,
} from "../../lib/payments/paymentState";

/**
 * A booking's payment status, coloured and worded by the one rule that decides
 * it (lib/payments/paymentState.ts).
 *
 * Green means nothing is owed, red means money is, grey means the booking is
 * refunded or voided and the arithmetic no longer applies. That is the whole
 * palette — the amber/yellow/orange/grey spread this replaced encoded a
 * distinction the desk does not act on (a booking is either settled or it
 * isn't) while hiding the one it does.
 *
 * Pass the amounts whenever you have them; a row that only carries a stored
 * status still renders correctly from that alone.
 */
export function PaymentStatusBadge({
  payment,
  size = "md",
}: {
  payment: PaymentStateInput;
  /** "sm" for inside a dense table row. */
  size?: "sm" | "md";
}) {
  const state = resolvePaymentState(payment);
  const text = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <View className="flex-row">
      <View className={`rounded-full px-2 py-1 ${state.pillClass}`}>
        <Text className={`${text} font-semibold ${state.pillClass}`}>
          {state.label}
        </Text>
      </View>
    </View>
  );
}
