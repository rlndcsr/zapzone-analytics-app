import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

/** The bulk action currently running. Status values match the backend. */
export type BookingBulkAction =
  | "confirmed"
  | "checked-in"
  | "completed"
  | "cancelled"
  | "delete";

type StatusChip = {
  action: Exclude<BookingBulkAction, "delete">;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  tint: string;
};

// The same status transitions the web bulk bar's "Change Status" select offers.
const STATUS_CHIPS: StatusChip[] = [
  { action: "confirmed", label: "Confirm", icon: "check-circle", tint: "#0644C7" },
  { action: "checked-in", label: "Check In", icon: "log-in", tint: "#16A34A" },
  { action: "completed", label: "Complete", icon: "check", tint: "#2563EB" },
  { action: "cancelled", label: "Cancel", icon: "x-circle", tint: "#B45309" },
];

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
 * Bulk-action toolbar for the Bookings table, mirroring the web admin's bulk
 * bar: a status change (Confirm / Check In / Complete / Cancel) plus Delete,
 * shown only while at least one row is selected. The action row scrolls
 * horizontally so every action stays reachable on a phone. `busy` marks the
 * in-flight action so the whole bar locks and that chip spins.
 */
export function BookingsBulkBar({
  count,
  busy,
  onStatus,
  onDelete,
  onClear,
}: {
  count: number;
  busy: BookingBulkAction | null;
  onStatus: (status: Exclude<BookingBulkAction, "delete">) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const locked = busy !== null;
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
        {STATUS_CHIPS.map((c) => (
          <Chip
            key={c.action}
            label={c.label}
            icon={c.icon}
            tint={c.tint}
            loading={busy === c.action}
            disabled={locked}
            onPress={() => onStatus(c.action)}
          />
        ))}
        <Chip
          label="Delete"
          icon="trash-2"
          tint="#DC2626"
          danger
          loading={busy === "delete"}
          disabled={locked}
          onPress={onDelete}
        />
      </ScrollView>
    </View>
  );
}
