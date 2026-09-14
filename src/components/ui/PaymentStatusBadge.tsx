import { Text, View } from "react-native";

import {
  resolvePaymentState,
  type PaymentStateInput,
} from "../../lib/payments/paymentState";

export function PaymentStatusBadge({
  payment,
  size = "md",
}: {
  payment: PaymentStateInput;
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
