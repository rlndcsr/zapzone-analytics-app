import { Feather } from "@expo/vector-icons";
import React, { type ComponentProps } from "react";
import { Alert, Pressable, Text, View } from "react-native";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/**
 * A KPI tile: icon + label on the top row, a large value, and an optional hint
 * line. Sized to sit two-per-row in a `flex-row flex-wrap gap-3` container.
 * When `info` is set, a tappable "i" reveals the description in an alert.
 */
export function StatTile({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  hint,
  info,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  hint?: string;
  info?: string;
}) {
  return (
    <View
      className="flex-1 min-w-[45%] bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-2">
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${iconBg}`}>
          <Feather name={icon} size={18} color={iconColor} />
        </View>
        <View className="flex-1 flex-row items-center gap-1">
          <Text
            className="text-sm font-bold text-gray-900 dark:text-white shrink"
            numberOfLines={2}
          >
            {label}
          </Text>
          {info ? (
            <Pressable onPress={() => Alert.alert(label, info)} hitSlop={8}>
              <Feather name="info" size={12} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-3">
        {value}
      </Text>
      {hint ? (
        <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</Text>
      ) : null}
    </View>
  );
}
