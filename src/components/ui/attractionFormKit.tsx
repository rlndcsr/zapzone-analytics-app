import { Feather } from "@expo/vector-icons";
import { type ComponentProps, type ReactNode } from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";

import type { AvailabilitySchedule } from "../../services/attractionsService";

export const PRIMARY = "#0644C7";

export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

export type IconName = ComponentProps<typeof Feather>["name"];

export const PRICING_TYPES = [
  { value: "per_person", label: "Per Person" },
  { value: "per_group", label: "Per Group" },
  { value: "per_hour", label: "Per Hour" },
  { value: "per_game", label: "Per Game" },
  { value: "fixed", label: "Fixed Price" },
] as const;

export const DAYS = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;

export const ALL_DAY_KEYS = DAYS.map((d) => d.key);

export const MAX_IMAGES = 5;

// 30-minute increments, the native stand-in for the web's <input type="time">.
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

/** "16:30" | "16:30:00" → "4:30 PM" (12-hour, seconds ignored). */
export function formatTime(value: string): string {
  const [hStr, mStr] = value.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

export const newSchedule = (): AvailabilitySchedule => ({
  days: [...ALL_DAY_KEYS],
  start_time: "09:00",
  end_time: "17:00",
});

export const money = (n: number) => `$${n.toFixed(2)}`;

/** Human-readable day list for one availability schedule (in weekday order). */
export const scheduleDaysLabel = (days: string[]): string => {
  const labels = DAYS.filter((d) => days.includes(d.key)).map((d) => d.label);
  return labels.length ? labels.join(", ") : "No days";
};

/** Section wrapper card matching the app's card design. */
export const Section = ({
  icon,
  title,
  children,
  onLayout,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
    onLayout={onLayout}
  >
    <View className="flex-row items-center gap-2 mb-4">
      <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

export const FieldLabel = ({ children }: { children: ReactNode }) => (
  <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
    {children}
  </Text>
);

/** A pressable that opens a picker sheet, showing the current value. */
export const SelectRow = ({
  icon,
  value,
  placeholder,
  onPress,
  error,
}: {
  icon: IconName;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  error?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    className={`h-14 flex-row items-center gap-3 rounded-full border bg-white dark:bg-neutral-900 px-5 ${
      error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
    }`}
  >
    <Feather name={icon} size={18} color="#9CA3AF" />
    <Text
      className={`flex-1 text-base ${
        value ? "text-gray-900 dark:text-white" : "text-gray-400"
      }`}
      numberOfLines={1}
    >
      {value ?? placeholder}
    </Text>
    <Feather name="chevron-down" size={18} color="#9CA3AF" />
  </Pressable>
);

export const ErrorText = ({ error }: { error?: string }) =>
  error ? (
    <Text className="ml-4 mt-1.5 text-xs text-red-500">{error}</Text>
  ) : null;
