import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  Text,
  View,
} from "react-native";

import { formatDurationDisplay } from "../../lib/attractions/attractionDisplay";
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

/**
 * A pressable that opens a picker sheet, showing the current value. Rounded-lg
 * (never a pill) so it matches the web's inputs and the rest of this form.
 */
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
    className={`h-14 flex-row items-center gap-3 rounded-lg border bg-white dark:bg-neutral-900 px-5 ${
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
    <Text className="mt-1.5 text-xs text-red-500">{error}</Text>
  ) : null;

/**
 * Primary / secondary form button. Square-ish corners (rounded-lg) — the
 * attraction form deliberately uses no pill shapes, matching the web.
 */
export const FormButton = ({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
}) => {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      className={`h-14 flex-1 flex-row items-center justify-center gap-2 rounded-lg ${
        primary
          ? "bg-[#0644C7]"
          : "border border-gray-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      } ${disabled || loading ? "opacity-60" : "active:opacity-90"}`}
    >
      {loading ? (
        <ActivityIndicator color={primary ? "#FFFFFF" : PRIMARY} size="small" />
      ) : (
        <>
          {!!icon && (
            <Feather name={icon} size={16} color={primary ? "#FFFFFF" : "#374151"} />
          )}
          <Text
            className={`text-base font-semibold ${
              primary ? "text-white" : "text-gray-700 dark:text-gray-200"
            }`}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
};

/** Pricing-type suffixes the live preview shows next to the price. */
const PREVIEW_SUFFIX: Record<string, string> = {
  per_person: "/person",
  per_hour: "/hour",
  per_game: "/game",
};

/**
 * "Live Preview" card — how the attraction will read to customers. Mirrors the
 * web's sticky right-rail preview on both Create and Edit, so the two forms
 * stay in sync. Values come straight from the form state; `imageUri` is already
 * resolved by the caller (a data URI while creating, a media URL when editing).
 */
export const AttractionLivePreview = ({
  name,
  category,
  description,
  price,
  pricingType,
  duration,
  durationUnit,
  maxCapacity,
  schedules,
  imageUri,
}: {
  name: string;
  category: string;
  description: string;
  price: string;
  pricingType: string;
  duration: string;
  durationUnit: "minutes" | "hours";
  maxCapacity: string;
  schedules: AvailabilitySchedule[];
  imageUri?: string | null;
}) => {
  const durationText =
    !duration || Number(duration) === 0
      ? "Unlimited"
      : formatDurationDisplay(Number(duration), durationUnit);

  return (
    <View className="rounded-lg border border-gray-200 bg-white p-5 mb-4 dark:border-neutral-800 dark:bg-neutral-900">
      <Text className="mb-4 text-xl font-bold text-[#0644C7] dark:text-blue-400">
        Live Preview
      </Text>

      {!!imageUri && (
        <Image
          source={{ uri: imageUri }}
          style={{ width: "100%", height: 160, borderRadius: 8 }}
          contentFit="cover"
        />
      )}

      <View className={imageUri ? "mt-4" : undefined}>
        <Text className="text-lg font-semibold text-gray-800 dark:text-white">
          {name.trim() || "Attraction Name"}
        </Text>
        <Text className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {category || "Category"}
        </Text>
      </View>

      <Text className="mt-3 text-sm text-gray-800 dark:text-gray-200">
        {description.trim() || "No description provided"}
      </Text>

      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-[#0644C7] dark:text-blue-400">
          {price ? `$${price}` : "$0.00"}
          <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
            {" "}
            {PREVIEW_SUFFIX[pricingType] ?? ""}
          </Text>
        </Text>
        <Text className="text-sm text-gray-600 dark:text-gray-400">
          {durationText}
        </Text>
      </View>

      <Text className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        <Text className="font-medium">Capacity:</Text>{" "}
        {maxCapacity ? `Up to ${maxCapacity} people` : "Not specified"}
      </Text>

      <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
        <Text className="mb-2 font-medium text-gray-800 dark:text-gray-100">
          Availability Schedules:
        </Text>
        {schedules.map((s, i) => (
          <View key={i} className="mb-2">
            <View className="flex-row flex-wrap gap-1">
              {s.days.map((day) => (
                <View
                  key={day}
                  className="rounded bg-blue-100 px-2 py-1 dark:bg-blue-900/40"
                >
                  <Text className="text-xs text-[#0644C7] dark:text-blue-300">
                    {day.slice(0, 3)}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {formatTime(s.start_time)} – {formatTime(s.end_time)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};
