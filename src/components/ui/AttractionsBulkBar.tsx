import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/** Which bulk action is currently running (null = idle). */
export type BulkAction = "activate" | "deactivate" | "delete";

type Variant = "activate" | "deactivate" | "delete";

const VARIANT_STYLES: Record<
  Variant,
  { border: string; label: string; tint: string }
> = {
  activate: {
    border: "border-green-200 dark:border-green-900/50",
    label: "text-green-700 dark:text-green-400",
    tint: "#16A34A",
  },
  deactivate: {
    border: "border-gray-200 dark:border-neutral-700",
    label: "text-gray-700 dark:text-gray-200",
    tint: "#6B7280",
  },
  delete: {
    border: "border-red-200 dark:border-red-900/50",
    label: "text-red-600 dark:text-red-400",
    tint: "#DC2626",
  },
};

const BulkButton = ({
  variant,
  icon,
  label,
  loading,
  disabled,
  onPress,
}: {
  variant: Variant;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) => {
  const s = VARIANT_STYLES[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border bg-white dark:bg-neutral-900 active:opacity-70 ${s.border} ${disabled ? "opacity-50" : ""}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={s.tint} />
      ) : (
        <Feather name={icon} size={15} color={s.tint} />
      )}
      <Text className={`text-xs font-semibold ${s.label}`}>{label}</Text>
    </Pressable>
  );
};

/**
 * Bulk-action toolbar for the Attractions table, mirroring the web admin's
 * BulkActionsBar. Shown only while at least one row is selected; the parent
 * unmounts it when the selection is cleared. Activate / Deactivate map to the
 * per-id status endpoints and Delete to the bulk-delete endpoint (see
 * attractionsService). `busy` marks which action is in flight so the whole bar
 * locks and the active button shows a spinner.
 */
export function AttractionsBulkBar({
  count,
  busy,
  onActivate,
  onDeactivate,
  onDelete,
  onClear,
}: {
  count: number;
  busy: BulkAction | null;
  onActivate: () => void;
  onDeactivate: () => void;
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
      <View className="flex-row gap-2">
        <BulkButton
          variant="activate"
          icon="check-circle"
          label="Activate"
          loading={busy === "activate"}
          disabled={locked}
          onPress={onActivate}
        />
        <BulkButton
          variant="deactivate"
          icon="slash"
          label="Deactivate"
          loading={busy === "deactivate"}
          disabled={locked}
          onPress={onDeactivate}
        />
        <BulkButton
          variant="delete"
          icon="trash-2"
          label="Delete"
          loading={busy === "delete"}
          disabled={locked}
          onPress={onDelete}
        />
      </View>
    </View>
  );
}
