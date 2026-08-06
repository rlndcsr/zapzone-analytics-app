import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { CenterModal } from "./CenterModal";

const DANGER = "#EF4444";
const BRAND = "#0644C7";
const CAUTION = "#B45309";

type ConfirmationModalProps = {
  visible: boolean;
  title: string;
  message: string;

  warning?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmationModal({
  visible,
  title,
  message,
  warning,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  icon,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const accent = destructive ? DANGER : BRAND;
  const tileIcon = icon ?? (destructive ? "trash-2" : "help-circle");

  return (
    <CenterModal visible={visible} onClose={onCancel} dismissable={!loading}>
      <View
        className="rounded-3xl bg-white p-6 dark:bg-neutral-900"
        style={{
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        <View className="items-center">
          <View
            className="mb-3 h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${accent}1A` }}
          >
            <Feather name={tileIcon} size={22} color={accent} />
          </View>

          <Text className="text-center text-lg font-bold text-gray-900 dark:text-white">
            {title}
          </Text>
        </View>

        <Text className="mt-3 text-center text-sm leading-5 text-gray-500 dark:text-gray-400">
          {message}
        </Text>

        {warning ? (
          <View className="mt-4 flex-row items-start rounded-2xl bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
            <Feather name="alert-triangle" size={14} color={CAUTION} />
            <Text className="ml-2.5 flex-1 text-[12px] leading-[18px] text-amber-700 dark:text-amber-500">
              {warning}
            </Text>
          </View>
        ) : null}

        <View className="mt-5 flex-row gap-3">
          <Pressable
            onPress={onCancel}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading }}
            className="flex-1 items-center rounded-xl border border-gray-200 py-3 active:opacity-70 dark:border-neutral-700"
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {cancelLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onConfirm}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 active:opacity-80"

            style={{ backgroundColor: accent, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                {confirmLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </CenterModal>
  );
}
