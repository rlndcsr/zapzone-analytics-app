import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  describeGiftCardError,
  nextAppliedGiftCard,
  type AppliedGiftCard,
} from "../../lib/giftCards/checkoutGiftCard";
import { getToken } from "../../lib/session";
import {
  validateGiftCardCode,
  type CheckoutItem,
} from "../../services/discountCodesService";

export type { AppliedGiftCard };

type Props = {
  locationId: number | null;
  items: CheckoutItem[];
  subtotal: number;
  applied: AppliedGiftCard | null;
  onApplied: (value: AppliedGiftCard | null) => void;
  disabled?: boolean;
};

export function GiftCardCheckoutField({
  locationId,
  items,
  subtotal,
  applied,
  onApplied,
  disabled,
}: Props) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    const value = code.trim();
    if (!value || checking) return;
    const token = getToken();
    if (!token) return;
    setChecking(true);
    setError(null);
    try {
      const result = await validateGiftCardCode({
        token,
        code: value,
        subtotal: Math.max(0, subtotal),
        locationId,
        items,
      });
      const next = nextAppliedGiftCard(value, result);
      onApplied(next);
      if (next) {
        setCode("");
      } else {
        setError(
          result.message || "That gift card is not valid for this order.",
        );
      }
    } catch (err) {
      onApplied(null);
      setError(describeGiftCardError(err));
    } finally {
      setChecking(false);
    }
  };

  if (applied) {
    return (
      <View className="flex-row items-center justify-between gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5">
        <View className="flex-1 flex-row items-center gap-2">
          <Feather name="gift" size={15} color="#059669" />
          <View className="flex-1">
            <Text
              className="text-sm font-semibold text-emerald-800 dark:text-emerald-300"
              numberOfLines={1}
            >
              Gift card {applied.code}
            </Text>
            <Text className="text-xs text-emerald-700 dark:text-emerald-400">
              −$
              {Math.min(applied.discountAmount, Math.max(0, subtotal)).toFixed(
                2,
              )}{" "}
              applied
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => onApplied(null)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove gift card"
          className="p-1.5 rounded-md active:bg-emerald-100 dark:active:bg-emerald-900/40"
        >
          <Feather name="x" size={15} color="#059669" />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row gap-2">
        <TextInput
          value={code}
          editable={!disabled && !checking}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(null);
          }}
          onSubmitEditing={apply}
          returnKeyType="done"
          placeholder="Gift card code"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="characters"
          autoCorrect={false}
          className="h-12 flex-1 rounded-lg border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 text-sm font-mono tracking-wide text-gray-900 dark:text-white"
        />
        <Pressable
          onPress={apply}
          disabled={disabled || checking || !code.trim()}
          className={`h-12 items-center justify-center rounded-lg border border-gray-300 dark:border-neutral-700 px-4 ${
            disabled || checking || !code.trim()
              ? "opacity-50"
              : "active:opacity-70"
          }`}
        >
          {checking ? (
            <ActivityIndicator size="small" color="#374151" />
          ) : (
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Apply
            </Text>
          )}
        </Pressable>
      </View>
      {!!error && (
        <Text className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </Text>
      )}
    </View>
  );
}

export default GiftCardCheckoutField;
