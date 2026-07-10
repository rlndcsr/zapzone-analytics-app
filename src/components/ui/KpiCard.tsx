import { Feather } from "@expo/vector-icons";
import React, { type ComponentProps } from "react";
import { Text, View } from "react-native";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

export type KpiTone = { bg: string; tint: string };

/**
 * KPI tile for the list-screen header grids (Waivers / Manage Accounts /
 * Activity Log): tinted icon chip, uppercase label, large value, and a hint
 * line. Sized to sit two-per-row inside a `flex-row flex-wrap -mx-1.5` row with
 * each card wrapped in a `w-1/2` View — matching the Waivers KPIs exactly.
 */
export function KpiCard({
  icon,
  tone,
  title,
  value,
  hint,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  tone: KpiTone;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <View
      className="flex-1 bg-white dark:bg-neutral-900 rounded-2xl p-4 m-1.5 shadow-sm"
      style={CARD_SHADOW}
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: tone.bg }}
      >
        <Feather name={icon} size={18} color={tone.tint} />
      </View>
      <Text className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-3">
        {title}
      </Text>
      <Text
        className="text-2xl font-bold text-gray-900 dark:text-white mt-1"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</Text>
    </View>
  );
}
