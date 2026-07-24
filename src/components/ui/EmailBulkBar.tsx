import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

/** One bulk-action chip; `key` is echoed back to `onAction`. */
export type EmailBulkChip = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  danger?: boolean;
};

const Chip = ({
  label,
  icon,
  tint,
  loading,
  disabled,
  danger = false,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
  loading: boolean;
  disabled: boolean;
  danger?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border bg-white dark:bg-neutral-900 active:opacity-70 ${
      danger
        ? "border-red-200 dark:border-red-900/50"
        : "border-gray-200 dark:border-neutral-700"
    } ${disabled ? "opacity-50" : ""}`}
  >
    {loading ? (
      <ActivityIndicator size="small" color={tint} />
    ) : (
      <Feather name={icon} size={14} color={tint} />
    )}
    <Text
      className={`text-xs font-semibold ${
        danger
          ? "text-red-600 dark:text-red-400"
          : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * Bulk-action toolbar for the Email tables, shown only while a selection exists.
 * Same layout/behavior as the other modules' bulk bars; `busyKey` locks the bar
 * and spins the in-flight chip. Chips are parameterized so each Email screen
 * passes its own web-parity actions.
 */
export function EmailBulkBar({
  count,
  busyKey,
  chips,
  onAction,
  onClear,
}: {
  count: number;
  busyKey: string | null;
  chips: EmailBulkChip[];
  onAction: (key: string) => void;
  onClear: () => void;
}) {
  const locked = busyKey !== null;
  return (
    <View className="rounded-2xl border border-[#0644C7]/30 bg-blue-50 dark:bg-blue-900/20 p-3 mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-300">
          {count} selected
        </Text>
        <Pressable
          onPress={onClear}
          disabled={locked}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Feather name="x" size={14} color="#6B7280" />
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Clear
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {chips.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            icon={c.icon}
            tint={c.tint}
            danger={c.danger}
            loading={busyKey === c.key}
            disabled={locked}
            onPress={() => onAction(c.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
