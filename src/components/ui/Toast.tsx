import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastType = "success" | "error" | "info";

/** Sub-line under the message — the web Toast's `typeDescriptions`. */
const TYPE_DESCRIPTIONS: Record<ToastType, string> = {
  success: "Action completed successfully.",
  error: "Something went wrong. Please try again.",
  info: "For your information.",
};

const ICONS: Record<ToastType, { Icon: typeof Info; color: string }> = {
  success: { Icon: CheckCircle2, color: "#10B981" },
  error: { Icon: AlertTriangle, color: "#F43F5E" },
  info: { Icon: Info, color: "#2563EB" },
};

/**
 * Mobile port of the web admin's `Toast` — same icon set, message + type
 * description, and dismiss affordance. Pinned under the header (the web pins it
 * top-right) so it never collides with the save actions at the bottom.
 */
export function Toast({
  message,
  type = "info",
  onClose,
}: {
  message: string;
  type?: ToastType;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { Icon, color } = ICONS[type];

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, top: insets.top + 56 }}
      className="px-5"
    >
      <View
        accessibilityRole="alert"
        className="flex-row items-center gap-3 rounded-xl bg-white dark:bg-neutral-800 px-4 py-3 shadow-lg"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Icon size={20} color={color} />
        <View className="flex-1">
          <Text className="text-sm font-medium text-gray-900 dark:text-white">
            {message}
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {TYPE_DESCRIPTIONS[type]}
          </Text>
        </View>
        {onClose && (
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={16} color="#9CA3AF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
