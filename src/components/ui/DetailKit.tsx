import { Feather } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

// Shared card elevation used across the details screens.
export const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

/** Titled section card (icon chip + bold title) matching the other details screens. */
export function DetailSection({
  icon,
  title,
  children,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  children: ReactNode;
}) {
  return (
    <View
      className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
      style={CARD_SHADOW}
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
}

/** Label-left / value-right row used inside detail sections. */
export function InfoRow({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <View className="flex-row items-start justify-between py-1.5">
      <Text className="text-sm text-gray-500 dark:text-gray-400 mr-3">{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text
          className={`text-sm font-medium text-gray-900 dark:text-white flex-1 text-right ${valueClass}`}
        >
          {value}
        </Text>
      ) : (
        <View className="flex-1 items-end">{value}</View>
      )}
    </View>
  );
}

type Variant = "primary" | "outline" | "danger";

/** Pill action button (primary/outline/danger) shared by the details screens' Actions row. */
export function DetailActionButton({
  icon,
  label,
  onPress,
  variant = "outline",
  busy = false,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
}) {
  const base =
    variant === "primary"
      ? "bg-[#0644C7]"
      : variant === "danger"
        ? "border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900"
        : "border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900";
  const tint = variant === "primary" ? "#FFFFFF" : variant === "danger" ? "#DC2626" : "#374151";
  const textColor =
    variant === "primary"
      ? "text-white"
      : variant === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-gray-700 dark:text-gray-200";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center justify-center gap-2 px-3 py-2.5 rounded-xl ${base} ${
        disabled || busy ? "opacity-50" : "active:opacity-80"
      }`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Feather name={icon} size={15} color={tint} />
      )}
      <Text className={`text-xs font-semibold ${textColor}`}>{label}</Text>
    </Pressable>
  );
}
